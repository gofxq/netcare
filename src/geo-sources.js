import { asnLabel, canonicalIP, fetchJson, ProbeError } from './network.js'

export const geoColumns = [
  ['country', '国家和地区'], ['region', '省州'], ['city', '城市'],
  ['asn', 'ASN'], ['asnOrg', 'AS 组织'], ['isp', '运营商'],
]

function asnAndOrg(value) {
  const match = typeof value === 'string' && value.match(/^AS(\d+)\s*(.*)$/i)
  return match ? { asn: match[1], asnOrg: match[2] } : { asnOrg: value }
}

const local = (id, name, config) => ({ id, name, config })
const online = (id, name, url, extract = (data) => data) => ({ id, name, url, extract })

export const geoSources = [
  online('ipsb', 'IP.SB', (ip) => `https://api.ip.sb/geoip/${ip}`, (d) => ({ ...d, countryCode: d.country_code, asnOrg: d.asn_organization })),
  online('ipquery', 'IPQuery.io', (ip) => `https://api.ipquery.io/${ip}`, ({ location, isp }) => ({ ...location, countryCode: location?.country_code, region: location?.state || location?.region, asn: isp?.asn, asnOrg: isp?.org, isp: isp?.isp })),
  online('geojs', 'GeoJS.io', (ip) => `https://get.geojs.io/v1/ip/geo/${ip}.json`, (d) => ({ ...d, countryCode: d.country_code, asnOrg: d.organization_name || asnAndOrg(d.organization).asnOrg })),
  local('ip-api', 'IP-API.com', 'NETCARE_IP_API_KEY'),
  online('ipinfo', 'IPInfo.io', (ip) => `https://ipinfo.io/${ip}/json`, (d) => ({ ...d, countryCode: d.country, ...asnAndOrg(d.org) })),
  online('ipinfo-es', 'IPInfo.ES', (ip) => `https://api.ipinfo.es/ipinfo?ip=${ip}`, (d) => ({ ...d, country: d.country_name, countryCode: d.country, asnOrg: d.as_name })),
  local('dbip', 'DB-IP City Lite (MMDB)', 'NETCARE_DBIP_MMDB'),
  local('geolite2', 'GeoLite2 City (MMDB)', 'NETCARE_GEOLITE2_MMDB'),
  local('ipip-2023', 'IPIP.net (2023)', 'NETCARE_IPIP_MMDB'),
  online('ip2location', 'IP2Location', (ip) => `https://api.ip2location.io/?ip=${ip}`, (d) => ({ country: d.country_name, countryCode: d.country_code, region: d.region_name, city: d.city_name, asn: d.asn, asnOrg: d.as, isp: d.isp })),
  online('ipwhois-app', 'ipwhois.app', (ip) => `https://ipwhois.app/json/${ip}`, (d) => ({ ...d, countryCode: d.country_code, asnOrg: d.org })),
  online('ipwho-is', 'ipwho.is', (ip) => `https://ipwho.is/${ip}`, (d) => ({ ...d, countryCode: d.country_code, asn: d.connection?.asn, asnOrg: d.connection?.org, isp: d.connection?.isp })),
  online('iplocate', 'IPLocate.io', (ip) => `https://www.iplocate.io/api/lookup/${ip}`, (d) => ({ ...d, countryCode: d.country_code, region: d.subdivision, asn: d.asn?.asn, asnOrg: d.asn?.name })),
  online('freeipapi', 'FreeIPAPI.com', (ip) => `https://free.freeipapi.com/api/json/${ip}`, (d) => ({ country: d.countryName, countryCode: d.countryCode, region: d.regionName, city: d.cityName, asn: d.asn, asnOrg: d.asnOrganization })),
  local('ipdata', 'ipdata.co', 'NETCARE_IPDATA_KEY'),
  local('geo-ipify', 'GEO IPIFY', 'NETCARE_IPIFY_KEY'),
  online('ipapi-is', 'ipapi.is', (ip) => `https://api.ipapi.is/?q=${ip}`, (d) => ({ ...d.location, countryCode: d.location?.country_code, region: d.location?.state || d.location?.region, asn: d.asn?.asn, asnOrg: d.asn?.org, isp: d.company?.type === 'isp' ? d.company.name : undefined })),
  local('ipregistry', 'ipregistry.co', 'NETCARE_IPREGISTRY_KEY'),
  ...[['dbip', 'DB-IP'], ['maxmind', 'MaxMind']].map(([db, label]) => online(`wp-${db}`, `WP Statistics (${label})`,
    (ip) => `https://geo.wp-statistics.com/api/lookup?ip=${ip}&db=${db}&format=json`, (d) => ({ ...d, countryCode: d.country_code }))),
  local('cz88', '纯真 CZ88', 'NETCARE_CZ88_MMDB'),
  local('ipstack', 'IPstack.com', 'NETCARE_IPSTACK_KEY'),
]

function detail(value) {
  return typeof value === 'string' && value !== '-' ? value.trim() : ''
}

export function normalizeGeoDetails(data) {
  return {
    country: detail(data.country) || detail(data.countryCode),
    countryCode: detail(data.countryCode),
    region: detail(data.region),
    city: detail(data.city),
    asn: asnLabel(data.asn),
    asnOrg: detail(data.asnOrg),
    isp: detail(data.isp),
  }
}

export async function lookupGeoSource(source, address, signal) {
  const ip = canonicalIP(address)
  if (!ip) throw new ProbeError('请输入有效的 IPv4 或 IPv6 地址。')
  const encoded = encodeURIComponent(ip)
  let data
  try {
    data = source.url
      ? await fetchJson(source.url(encoded), signal, 6500)
      : await fetchJson(`/api/geo/${source.id}?ip=${encoded}`, signal, 8500)
  } catch (error) {
    signal.throwIfAborted()
    if (source.config && error.code === 428) throw new ProbeError(`需配置 ${source.config}`)
    if (source.config && (error.code === 404 || error instanceof SyntaxError)) throw new ProbeError('此来源需要本地查询服务。')
    if (error.code === 429) throw new ProbeError('该数据源已达到调用频率限制。')
    throw error
  }
  if (!data || data.success === false || data.error || data.status === 'fail') {
    throw new ProbeError('该数据源未返回结果。', 'missing')
  }
  const fields = normalizeGeoDetails(source.extract ? source.extract(data) : data)
  if (!geoColumns.some(([key]) => fields[key])) throw new ProbeError('该数据源未返回结果。', 'missing')
  return fields
}
