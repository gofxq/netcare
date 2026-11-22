import assert from 'node:assert/strict'
import { test } from 'node:test'
import { latencyTargets, providers, splitTargets } from '../src/catalog.js'
import { createGeoLookup, ipVersion, parseProviderPage, parseTrace, probePublicIP, probeSplitTarget } from '../src/network.js'

const signal = () => new AbortController().signal

test('the two pages cover the demo probe inventory', () => {
  assert.equal(providers.length, 4)
  assert.equal(latencyTargets.length, 8)
  assert.equal(splitTargets.length, 42)
  assert.equal(new Set(splitTargets.map(({ name }) => name)).size, 42)
  assert.equal(splitTargets.find(({ name }) => name === 'discord.com').url, 'https://gateway.discord.gg/cdn-cgi/trace')
})

test('IP validation handles IPv4, IPv6 and malformed addresses', () => {
  for (const ip of ['192.0.2.1', '0.0.0.0', '255.255.255.255']) assert.equal(ipVersion(ip), 4)
  for (const ip of ['2001:db8::2', '::ffff:192.0.2.1', '::1']) assert.equal(ipVersion(ip), 6)
  for (const ip of ['192.0.2.256', '127.1', '01.0.0.1', ':::', 'a:b', '[::1]', '::1/path']) assert.equal(ipVersion(ip), 0)
})

test('domestic source parsers match HTML and reject ambiguous IPs', () => {
  assert.deepEqual(parseProviderPage('ipcn', 'ip：192.0.2.1\n归属地：中国 上海'), { ip: '192.0.2.1', location: '中国 上海' })
  assert.deepEqual(parseProviderPage('ip138', '<p>IP: 192.0.2.1</p><p>来自：中国&nbsp;上海</p>'), { ip: '192.0.2.1', location: '中国 上海' })
  assert.equal(parseProviderPage('ip138', '<p>192.0.2.1 192.0.2.2</p>'), null)
})

test('the primary family check uses family-specific endpoints and GeoIP', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.includes('api-ipv4')) return new Response('2001:db8::2')
    if (url.includes('api-ipv6')) return new Response('2001:db8::2\n')
    return Response.json({ country_code: 'SG', country: 'Singapore', asn: 64500, asn_organization: 'Example' })
  })
  assert.deepEqual(await probePublicIP(6, signal()), {
    ip: '2001:db8::2', country: 'SG', location: 'Singapore', isp: 'Example', asn: 'AS64500 · Example',
  })
  await assert.rejects(probePublicIP(4, signal()), /未获取到 IPv4 地址/)
  assert.equal(fetch.mock.callCount(), 3)
})

test('split results distinguish valid trace data, missing IP and a failed request', async (t) => {
  assert.deepEqual(parseTrace('loc=SG\r\nip=192.0.2.1\r\nuag=a=b'), { loc: 'SG', ip: '192.0.2.1', uag: 'a=b' })
  const fetch = t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.includes('api.ip.sb')) return Response.json({ country: 'Singapore', isp: 'Example' })
    if (url.includes('missing')) return new Response('<html>Challenge</html>')
    if (url.includes('failed')) return new Response('', { status: 403 })
    return new Response('loc=SG\nip=192.0.2.1')
  })
  const lookup = createGeoLookup()
  const progress = []
  const run = (host) => probeSplitTarget({ method: 'trace', url: `https://${host}.test/cdn-cgi/trace` }, lookup, signal(), (value) => progress.push(value))
  const results = await Promise.all([run('first'), run('second')])
  assert.deepEqual(results, Array(2).fill({ ip: '192.0.2.1', country: 'SG', location: 'Singapore · Example' }))
  assert.equal(progress.length, 2)
  assert.equal(fetch.mock.calls.filter(({ arguments: [url] }) => url.includes('api.ip.sb')).length, 1)
  await assert.rejects(run('missing'), { code: 'missing' })
  await assert.rejects(run('failed'), { code: 403 })
})
