import { canonicalIP, fetchJson, joinDetails, parseTrace, ProbeError, request } from './network.js'

const directory = 'https://speedtest-net-servers.cdn.skk.moe/servers.json'
const baseline = [
  { host: 'api-ipv4.ip.sb', name: 'IP.SB IPv4', url: 'https://api-ipv4.ip.sb/ip', format: 'text' },
  { host: 'api-ipv6.ip.sb', name: 'IP.SB IPv6', url: 'https://api-ipv6.ip.sb/ip', format: 'text' },
  { host: 'www.cloudflare.com', name: 'Cloudflare', url: 'https://www.cloudflare.com/cdn-cgi/trace', format: 'trace' },
  { host: 'ipinfo.io', name: 'IPinfo', url: 'https://ipinfo.io/json', format: 'json' },
]

export function speedtestTargets(records) {
  if (!Array.isArray(records)) return []
  const hosts = new Map()
  for (const entry of records) {
    if (!entry?.https_functional || typeof entry.host !== 'string') continue
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*(?::\d{1,5})?$/i.test(entry.host)) continue
    let url
    try {
      url = new URL(`wss://${entry.host}/ws`)
    } catch {
      continue
    }
    if (/\.(?:local|internal|localhost|test|invalid)$/i.test(url.hostname) || hosts.has(url.host)) continue
    hosts.set(url.host, {
      host: url.host,
      url: url.href,
      name: joinDetails(entry.name, entry.sponsor) || url.host,
      country: typeof entry.country === 'string' ? entry.country : '',
      countryCode: typeof entry.cc === 'string' ? entry.cc : '',
    })
  }
  return [...hosts.values()]
}

export function readSpeedtestIP(message) {
  return typeof message === 'string' && message.startsWith('YOURIP ') ? canonicalIP(message.slice(7)) : ''
}

function socketIP(url, signal) {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const finish = (error, ip) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null
      socket.close()
      if (error) reject(error)
      else resolve(ip)
    }
    const onAbort = () => finish(signal.reason)
    const fail = () => finish(new ProbeError('探针未返回出口 IP。'))
    const timer = setTimeout(fail, 6500)
    socket.onopen = () => socket.send('GETIP')
    socket.onmessage = ({ data }) => {
      const ip = readSpeedtestIP(data)
      if (ip) finish(null, ip)
      else if (typeof data === 'string' && data.startsWith('YOURIP ')) fail()
    }
    socket.onerror = socket.onclose = fail
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function probeExit(target, signal) {
  if (!target.format) return socketIP(target.url, signal)
  const response = await request(target.url, signal)
  let address
  if (target.format === 'json') address = (await response.json()).ip
  else {
    const text = await response.text()
    address = target.format === 'trace' ? parseTrace(text).ip : text
  }
  const ip = canonicalIP(address)
  if (!ip) throw new ProbeError('探针未返回出口 IP。')
  return ip
}

export async function scanExits(pageSignal, stopSignal, report) {
  const signal = AbortSignal.any([pageSignal, stopSignal])
  let publicTargets = []
  try {
    publicTargets = speedtestTargets(await fetchJson(directory, signal))
  } catch {
    pageSignal.throwIfAborted()
    if (stopSignal.aborted) return { total: 0, matches: [], failed: 0, limited: false, stopped: true }
  }

  const targets = [...baseline, ...publicTargets]
  const matches = []
  let next = 0
  let failed = 0
  let progressTimer
  const snapshot = () => ({
    total: targets.length,
    matches: [...matches],
    failed,
    limited: publicTargets.length === 0,
    stopped: stopSignal.aborted,
  })
  report(snapshot())

  const work = async () => {
    while (!signal.aborted && next < targets.length) {
      const target = targets[next++]
      try {
        const ip = await probeExit(target, signal)
        if (!signal.aborted) matches.push({ ...target, ip })
      } catch {
        if (!signal.aborted) failed += 1
      }
      if (!progressTimer && !signal.aborted) progressTimer = setTimeout(() => {
        progressTimer = undefined
        report(snapshot())
      }, 80)
    }
  }
  await Promise.all(Array.from({ length: Math.min(16, targets.length) }, work))
  clearTimeout(progressTimer)
  return snapshot()
}

export function parseDnsRows(data) {
  const rows = new Map()
  for (const record of Array.isArray(data) ? data : []) {
    if (record?.type !== 'dns') continue
    const ip = canonicalIP(record.ip)
    if (!ip || rows.has(ip)) continue
    rows.set(ip, {
      ip,
      country: record.country_code || '',
      location: joinDetails(record.country_name || record.country, record.city, record.isp || record.asn),
    })
  }
  return [...rows.values()]
}

function waitForDnsResults(ms, signal) {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function bashDns(signal, report) {
  const response = await request('https://bash.ws/id', signal, {}, 3500)
  const id = (await response.text()).trim()
  if (!/^[a-z0-9]{8,48}$/i.test(id)) throw new ProbeError('DNS 服务返回了无效的检测编号。')
  report('正在向检测域名发起 DNS 查询…')
  await Promise.allSettled(Array.from({ length: 8 }, (_, index) =>
    request(`https://${index + 1}.${id}.bash.ws/`, signal, { mode: 'no-cors' }, 2500)))
  report('正在收集递归解析器的出口地址…')
  for (const delay of [0, 450, 900]) {
    if (delay) await waitForDnsResults(delay, signal)
    const data = await fetchJson(`https://bash.ws/dnsleak/test/${id}?json`, signal, 3500)
    const rows = parseDnsRows(data)
    if (rows.length) return { rows, source: 'bash.ws' }
  }
  return { rows: [], source: 'bash.ws' }
}

export async function probeDnsExit(signal, report) {
  try {
    const results = await bashDns(signal, report)
    if (results.rows.length) return results
  } catch {
    signal.throwIfAborted()
  }
  report('正在通过备用探针查询 DNS 出口…')
  try {
    const { dns } = await fetchJson('https://edns.ip-api.com/json', signal)
    const ip = canonicalIP(dns?.ip)
    const rows = ip ? [{ ip, country: '', location: joinDetails(dns.geo) }] : []
    return { rows, source: 'IP-API DNS' }
  } catch {
    signal.throwIfAborted()
    throw new ProbeError('DNS 检测服务暂不可用，请检查网络后重试。')
  }
}
