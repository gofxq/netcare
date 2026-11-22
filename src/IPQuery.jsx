import { useCallback, useState } from 'react'
import { RotateCcw, Search } from 'lucide-react'
import { Country, PageHeading, Skeleton } from './components.jsx'
import { geoSources, lookupGeoSource } from './geo-sources.js'
import { useProbe } from './hooks.js'
import { canonicalIP, joinDetails } from './network.js'
import { navigate } from './routing.jsx'

function QueryForm({ initial, onSearch }) {
  const [input, setInput] = useState(initial)
  const [error, setError] = useState(initial && !canonicalIP(initial) ? '请输入有效的 IPv4 或 IPv6 地址。' : '')

  const search = (address) => {
    const ip = canonicalIP(address)
    if (!ip) {
      setError('请输入有效的 IPv4 或 IPv6 地址。')
      return
    }
    setError('')
    setInput(ip)
    onSearch(ip)
  }

  return (
    <form className="diag-panel insight-search" onSubmit={(event) => { event.preventDefault(); search(input) }} noValidate>
      <label htmlFor="query-ip">IP 地址</label>
      <div className="insight-input-row">
        <div className="insight-input">
          <Search size={18} aria-hidden="true" />
          <input id="query-ip" name="q" type="text" className="mono" placeholder="输入 IPv4 或 IPv6 地址"
            value={input} onChange={(event) => { setInput(event.target.value); setError('') }}
            autoCapitalize="off" autoComplete="off" spellCheck={false} maxLength={64}
            aria-invalid={Boolean(error)} aria-describedby={error ? 'query-error' : undefined} />
        </div>
        <button type="submit" className="button primary-button">查询</button>
      </div>
      {error && <p id="query-error" className="query-error" role="alert">{error}</p>}
      {!initial && <div className="query-examples"><span>试一试</span>{['8.8.8.8', '2606:4700:4700::1111'].map((ip) =>
        <button type="button" key={ip} className="mono" onClick={() => search(ip)}>{ip}</button>)}</div>}
    </form>
  )
}

function SourceRow({ source, ip, revision }) {
  const run = useCallback((signal) => lookupGeoSource(source, ip, signal), [source, ip])
  const { status, value, error, retry } = useProbe(run, revision)
  const pending = status === 'pending'
  const region = joinDetails(value?.region, value?.city)
  return (
    <tr role="row" aria-busy={pending}>
      <th scope="row" role="rowheader">{source.name}</th>
      {error ? (
        <td role="cell" colSpan={3} className="insight-failure">
          <div className="lookup-row-error"><span>{error}</span>
            <button type="button" className="icon-button small-icon" onClick={retry} title="重试" aria-label={`重试 ${source.name}`}><RotateCcw size={15} /></button>
          </div>
        </td>
      ) : <>
        <td role="cell" data-label="归属地" data-empty={!pending && !value?.country && !region}>
          {pending ? <Skeleton width="7rem" /> : <>
            {value?.country && <span className="address-with-country">{value.countryCode && <Country code={value.countryCode} />}{value.country}</span>}
            {region && <span className="insight-secondary">{region}</span>}
            {!value?.country && !region && '—'}
          </>}
        </td>
        <td role="cell" data-label="自治系统" data-empty={!pending && !value?.asn && !value?.asnOrg}>
          {pending ? <Skeleton width="6rem" /> : <>
            {value?.asn && <span className="mono">{value.asn}</span>}
            {value?.asnOrg && <span className="insight-secondary">{value.asnOrg}</span>}
            {!value?.asn && !value?.asnOrg && '—'}
          </>}
        </td>
        <td role="cell" data-label="运营商" data-empty={!pending && !value?.isp}>{pending ? <Skeleton width="5rem" /> : value?.isp || '—'}</td>
      </>}
    </tr>
  )
}

export function IPQuery({ search }) {
  const [revision, setRevision] = useState(0)
  const query = new URLSearchParams(search).get('q') || ''
  const ip = canonicalIP(query)
  const submit = (address) => {
    if (address === query) setRevision((value) => value + 1)
    else navigate(`/query?q=${encodeURIComponent(address)}`, false)
  }

  return (
    <>
      <PageHeading title="IP 洞察" description={`对比 ${geoSources.length} 个数据源记录的归属地、自治系统和运营商。`} />
      <QueryForm key={query} initial={query} onSearch={submit} />
      {ip && <section className="diag-panel insight-panel" aria-labelledby="insight-title">
        <header className="diag-panel-heading">
          <h2 id="insight-title">数据源对比</h2>
          <span className="diag-meta mono">{ip}</span>
        </header>
        <table className="diag-table insight-table" role="table" aria-labelledby="insight-title">
          <thead role="rowgroup"><tr role="row">{['数据源', '归属地', '自治系统', '运营商'].map((title) => <th scope="col" key={title}>{title}</th>)}</tr></thead>
          <tbody role="rowgroup">{geoSources.map((source) => <SourceRow key={source.id} source={source} ip={ip} revision={revision} />)}</tbody>
        </table>
      </section>}
    </>
  )
}
