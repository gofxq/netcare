const geoApi = 'https://api.ip.sb/geoip/'

export class ProbeError extends Error {
  constructor(message, code = 'unavailable') {
    super(message)
    this.code = code
  }
}

export function ipVersion(value) {
  if (typeof value !== 'string') return 0
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    return value.split('.').every((part) => +part <= 255 && String(+part) === part) ? 4 : 0
  }
  if (!value.includes(':') || !/^[\da-f:.]+$/i.test(value)) return 0
  try {
    new URL(`http://[${value}]/`)
    return 6
  } catch {
    return 0
  }
}

export function parseTrace(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const separator = line.indexOf('=')
    return separator > 0 ? [[line.slice(0, separator), line.slice(separator + 1).trim()]] : []
  }))
}

export function joinDetails(...values) {
  const text = values.map((value) => typeof value === 'string' ? value.trim() : '').filter(Boolean)
  return [...new Set(text)].join(' · ')
}

export function asnLabel(number) {
  const digits = String(number ?? '').match(/^(?:AS)?(\d+)$/i)?.[1]
  return digits ? `AS${digits}` : ''
}

function normalizeGeo(data) {
  return {
    country: data.country_code || data.country || '',
    location: joinDetails(data.country, data.region, data.city),
    isp: data.isp || data.organization || data.asn_organization || '',
    asn: joinDetails(asnLabel(data.asn), data.asn_organization),
  }
}

export async function request(url, signal, options = {}, timeout = 5500) {
  const deadline = AbortSignal.timeout(timeout)
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    ...options,
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
  })
  if (!response.ok && response.type !== 'opaque') {
    throw new ProbeError(`获取失败（HTTP ${response.status}）`, response.status)
  }
  return response
}

export async function fetchJson(url, signal, timeout) {
  return (await request(url, signal, {}, timeout)).json()
}

export function canonicalIP(value) {
  if (typeof value !== 'string') return ''
  const ip = value.trim()
  const version = ipVersion(ip)
  if (version === 4) return ip
  return version === 6 ? new URL(`http://[${ip}]/`).hostname.slice(1, -1) : ''
}

function validateIP(ip) {
  if (!ipVersion(ip)) throw new ProbeError('未获取到 IP 地址', 'missing')
  return ip
}

export async function probePublicIP(version, signal) {
  let ip
  try {
    ip = (await (await request(`https://api-ipv${version}.ip.sb/ip`, signal)).text()).trim()
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ProbeError(`当前网络可能不支持 IPv${version}，或检测服务暂不可用。`)
  }
  if (ipVersion(ip) !== version) throw new ProbeError(`未获取到 IPv${version} 地址，请检查网络或 DNS 设置。`)

  try {
    return { ip, ...normalizeGeo(await fetchJson(`${geoApi}${encodeURIComponent(ip)}`, signal)) }
  } catch (error) {
    if (signal?.aborted) throw error
    return { ip, location: '', isp: '', asn: '', country: '' }
  }
}

export function parseProviderPage(id, text) {
  const plain = text.replace(/<[^>]*>/g, ' ').replaceAll('&nbsp;', ' ')
  if (id === 'ipcn') {
    const match = /\bip\s*[:：]\s*([^\s]+)\s+归属地\s*[:：]\s*([^\r\n<]+)/i.exec(plain)
    return match && ipVersion(match[1]) ? { ip: match[1], location: match[2].trim() } : null
  }
  const addresses = [...new Set(text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [])].filter(ipVersion)
  const location = /来自\s*[:：]\s*([^<\r\n]+)/.exec(text)?.[1]?.replaceAll('&nbsp;', ' ').trim()
  return addresses.length === 1 ? { ip: addresses[0], location: location || '' } : null
}

export async function probeProvider(id, signal) {
  if (id === 'ip138') {
    const year = new Date().getFullYear()
    for (const offset of [0, -1, 1, -2, 2, -3]) {
      try {
        const response = await request(`https://${year + offset}.ip138.com`, signal, {}, 2000)
        const content = await response.arrayBuffer()
        for (const encoding of ['utf-8', 'gb18030']) {
          const result = parseProviderPage(id, new TextDecoder(encoding).decode(content))
          if (result?.location) return result
        }
      } catch (error) {
        if (signal.aborted) throw error
      }
    }
    throw new ProbeError('未获取到 IP 地址或归属地', 'missing')
  }
  if (id === 'ipcn') {
    const response = await request('https://my.ip.cn', signal)
    const result = parseProviderPage(id, await response.text())
    if (result) return result
    throw new ProbeError('未获取到 IP 地址', 'missing')
  }
  if (id === 'cloudflare') {
    const response = await request('https://www.cloudflare.com/cdn-cgi/trace', signal)
    const { ip, loc } = parseTrace(await response.text())
    validateIP(ip)
    try {
      const geo = normalizeGeo(await fetchJson(`${geoApi}${encodeURIComponent(ip)}`, signal))
      return { ip, location: joinDetails(geo.location || loc, geo.asn || geo.isp) }
    } catch (error) {
      if (signal.aborted) throw error
      return { ip, location: loc || '' }
    }
  }
  const { ip, country, region, city, org } = await fetchJson('https://ipinfo.io/json', signal)
  return { ip: validateIP(ip), location: joinDetails(country, region, city, org) }
}

// JSONP executes in an opaque-origin frame so the provider has no access to this page.
function readJsonp(url, parameter, signal) {
  signal.throwIfAborted()
  url.searchParams.set(parameter, 'netcareResult')
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.hidden = true
    frame.title = '网络探测'
    frame.setAttribute('sandbox', 'allow-scripts')
    frame.setAttribute('credentialless', '')
    frame.referrerPolicy = 'no-referrer'
    const cleanup = () => {
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      signal.removeEventListener('abort', onAbort)
      frame.remove()
    }
    const onMessage = (event) => {
      if (event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.netcare !== true) return
      cleanup()
      if (event.data.error) reject(new ProbeError('获取失败'))
      else resolve(event.data.value)
    }
    const onAbort = () => {
      cleanup()
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new ProbeError('请求超时'))
    }, 5500)
    window.addEventListener('message', onMessage)
    signal.addEventListener('abort', onAbort, { once: true })
    const source = JSON.stringify(url.href).replaceAll('<', '\\u003c')
    frame.srcdoc = `<!doctype html><script>
      window.netcareResult = (value) => parent.postMessage({netcare: true, value}, '*');
      const script = document.createElement('script');
      script.referrerPolicy = 'no-referrer';
      script.src = ${source};
      script.onerror = () => parent.postMessage({netcare: true, error: true}, '*');
      document.head.append(script);
    </script>`
    document.body.append(frame)
  })
}

async function splitAddress(target, signal) {
  if (target.method === 'alibaba') {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('')
    const url = new URL(`https://${Date.now()}-${token}.dns-detect.alicdn.com/api/detect/DescribeDNSLookup`)
    const data = await readJsonp(url, 'cb', signal)
    return { ip: data?.content?.localIp, country: data?.content?.ipCountry }
  }
  if (target.method === 'tencent') {
    const data = await readJsonp(new URL('https://r.inews.qq.com/api/ip2city?otype=jsonp'), 'callback', signal)
    if (Number(data?.ret) !== 0) throw new ProbeError('获取失败')
    return {
      ip: data.ip,
      location: joinDetails(data.country, data.province, data.city, data.district, data.isp),
    }
  }
  if (target.method === 'header') {
    const { headers } = await request(target.url, signal, { method: 'HEAD' })
    const ip = target.header ? headers.get(target.header) : headers.get('x-request-ip') || headers.get('x-response-cinfo')
    return { ip }
  }
  const { ip, loc } = parseTrace(await (await request(target.url, signal)).text())
  return { ip, country: loc }
}

export function createGeoLookup() {
  const byAddress = new Map()
  return (ip) => {
    if (!byAddress.has(ip)) {
      const lookup = fetchJson(`${geoApi}${encodeURIComponent(ip)}`).then(normalizeGeo).catch((error) => {
        byAddress.delete(ip)
        throw error
      })
      byAddress.set(ip, lookup)
    }
    return byAddress.get(ip)
  }
}

export async function probeSplitTarget(target, lookupGeo, signal, report) {
  const result = await splitAddress(target, signal)
  const ip = validateIP(typeof result.ip === 'string' ? result.ip.trim() : '')
  const address = { ...result, ip }
  report(address)
  try {
    const geo = await lookupGeo(ip)
    return {
      ...address,
      country: address.country || geo.country,
      location: address.location || joinDetails(geo.location, geo.isp),
    }
  } catch {
    return { ...address, location: address.location || '', geoUnavailable: !address.location }
  }
}

export async function probeLatency(url, signal, report) {
  const count = matchMedia('(min-width: 1024px)').matches ? 12 : 8
  const samples = []
  let consecutiveFailures = 0
  for (let index = -2; index < count; index += 1) {
    signal.throwIfAborted()
    const start = performance.now()
    let elapsed = null
    try {
      await request(url, signal, { method: 'HEAD', mode: 'no-cors' }, 2000)
      elapsed = Math.max(1, Math.round(performance.now() - start))
    } catch (error) {
      if (signal.aborted) throw error
    }
    if (index < 0) continue
    samples.push(elapsed)
    report([...samples])
    consecutiveFailures = elapsed === null ? consecutiveFailures + 1 : 0
    if (consecutiveFailures >= 3) break
  }
  return samples
}
