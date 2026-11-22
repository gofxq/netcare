import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseDnsRows, probeDnsExit, readSpeedtestIP, scanExits, speedtestTargets } from '../src/diagnostic-probes.js'
import { geoSources, lookupGeoSource } from '../src/geo-sources.js'
import { mmdbFields } from '../server/geo-lookup.js'

test('Speedtest catalog accepts unique, secure probe hosts and the protocol validates addresses', () => {
  const candidates = speedtestTargets([
    { host: 'Probe.example.com:8080', name: 'Singapore', sponsor: 'Example', cc: 'SG', https_functional: true },
    { host: 'probe.example.com:8080', https_functional: true },
    { host: 'probe.example.com:88888', https_functional: true },
    { host: '192.168.1.1', https_functional: true },
    { host: 'probe.internal', https_functional: true },
    { host: 'probe.example.net/callback', https_functional: true },
    { host: 'probe.example.net', https_functional: false },
  ])
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].url, 'wss://probe.example.com:8080/ws')
  assert.equal(readSpeedtestIP('YOURIP 2001:0DB8:0:0:0:0:0:1'), '2001:db8::1')
  assert.equal(readSpeedtestIP('YOURIP 192.0.2.256'), '')
  assert.equal(readSpeedtestIP('OTHER 192.0.2.1'), '')
})

test('an unavailable probe catalog falls back to real browser probe methods', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.includes('servers.json')) return new Response('', { status: 503 })
    if (url.includes('ipinfo.io')) return Response.json({ ip: '198.51.100.2' })
    if (url.includes('cloudflare.com')) return new Response('ip=198.51.100.2')
    return new Response(url.includes('ipv6') ? '2001:db8::1\n' : '192.0.2.1\n')
  })
  const progress = []
  const final = await scanExits(new AbortController().signal, new AbortController().signal, (value) => progress.push(value))
  assert.equal(progress[0].total, 4)
  assert.equal(final.limited, true)
  assert.equal(final.matches.length, 4)
  assert.equal(new Set(final.matches.map(({ ip }) => ip)).size, 3)
})

test('DNS results use resolver addresses only and deduplicate IPv6', async (t) => {
  const data = [
    { type: 'ip', ip: '198.51.100.1' },
    { type: 'dns', ip: '2001:0DB8::1', country_name: 'Singapore', asn: 'Example ISP' },
    { type: 'dns', ip: '2001:db8::1' },
    { type: 'conclusion', ip: 'bad' },
  ]
  const expected = [{ ip: '2001:db8::1', country: '', location: 'Singapore · Example ISP' }]
  assert.deepEqual(parseDnsRows(data), expected)
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(url)
    if (url.endsWith('/id')) return new Response('deadbeef12345678\n')
    if (url.includes('/dnsleak/test/')) return Response.json(data)
    throw new TypeError('The test host only needs to be resolved')
  })
  assert.deepEqual(await probeDnsExit(new AbortController().signal, () => {}), { rows: expected, source: 'bash.ws' })
  assert.equal(requests.filter((url) => url.endsWith('.deadbeef12345678.bash.ws/')).length, 8)
})

test('GeoIP source normalization, validation and config state are independent', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.startsWith('/api/geo/')) return new Response('', { status: 428 })
    return Response.json({ location: { country: 'Example', country_code: 'EX', city: 'Test' }, isp: { asn: 'AS64500', org: 'Example ASN', isp: 'Example ISP' } })
  })
  const signal = new AbortController().signal
  const source = geoSources.find(({ id }) => id === 'ipquery')
  assert.equal(geoSources.length, 22)
  await assert.rejects(() => lookupGeoSource(source, 'example.org', signal), /有效/)
  assert.deepEqual(await lookupGeoSource(source, '2001:0DB8::1', signal), {
    country: 'Example', countryCode: 'EX', region: '', city: 'Test', asn: 'AS64500', asnOrg: 'Example ASN', isp: 'Example ISP',
  })
  assert.equal(fetch.mock.calls[0].arguments[0], 'https://api.ipquery.io/2001%3Adb8%3A%3A1')
  await assert.rejects(() => lookupGeoSource(geoSources.find(({ id }) => id === 'geolite2'), '8.8.8.8', signal), /NETCARE_GEOLITE2_MMDB/)
  assert.deepEqual(mmdbFields({ country: { iso_code: 'SG', names: { 'zh-CN': '新加坡' } }, city: { names: { en: 'Singapore' } }, traits: { autonomous_system_number: 64500 } }), {
    country: '新加坡', countryCode: 'SG', region: undefined, city: 'Singapore', asn: 64500, asnOrg: undefined, isp: undefined,
  })
})
