import { useCallback, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { splitTargets } from './catalog.js'
import { Country, PageHeading, Skeleton } from './components.jsx'
import { useProbe, useWhenVisible } from './hooks.js'
import { createGeoLookup, probeSplitTarget } from './network.js'

const regions = { all: '全部', domestic: '国内', international: '国际' }

function SplitRow({ target, revision, lookupGeo, hidden }) {
  const row = useRef(null)
  const enabled = useWhenVisible(row, target.method !== 'trace')
  const run = useCallback((signal, report) => probeSplitTarget(target, lookupGeo, signal, report), [target, lookupGeo])
  const { status, value, error, retry } = useProbe(run, revision, enabled)
  const pending = status === 'pending'
  const failed = status === 'error' || status === 'missing'

  return (
    <tr ref={row} role="row" aria-busy={pending} hidden={hidden}>
      <th scope="row" role="rowheader" className="split-site">
        <span className="site-name">{target.name}</span>
        <small>{[regions[target.region], target.category].filter(Boolean).join(' · ')}</small>
      </th>
      <td role="cell" className="split-address">
        {value?.ip ? <span className="address-with-country"><Country code={value.country} /><span className="mono">{value.ip}</span></span> :
          pending ? <><Skeleton width="7.5rem" /><span className="sr-only">检测中</span></> :
            <span className="diag-muted">{error || '等待检测'}</span>}
      </td>
      <td role="cell" className="split-location">
        {pending && !value?.location ? <Skeleton width="8rem" /> : value?.location || (value?.geoUnavailable ? '归属地查询失败' : '—')}
      </td>
      <td role="cell" className="diag-actions">
        {(failed || value?.geoUnavailable) &&
          <button className="icon-button small-icon" type="button" onClick={retry} title="重试" aria-label={`重试 ${target.name}`}><RefreshCw size={15} /></button>}
      </td>
    </tr>
  )
}

export function SplitTunnel() {
  const [revision, setRevision] = useState(0)
  const [region, setRegion] = useState('all')
  const lookupGeo = useMemo(createGeoLookup, [revision])
  const total = region === 'all' ? splitTargets.length : splitTargets.filter((target) => target.region === region).length

  return (
    <>
      <PageHeading title="网站分流测试" description="比较访问不同网站时的出口 IP，滚动列表可继续检测。" refreshLabel="重新测试" onRefresh={() => setRevision((value) => value + 1)} />
      <section className="diag-panel" aria-labelledby="split-title">
        <header className="diag-panel-heading">
          <h2 id="split-title">网站出口 <span className="diag-count">{total}</span></h2>
          <div className="region-filter" role="group" aria-label="按网站地区筛选">
            {Object.entries(regions).map(([id, name]) => (
              <button key={id} type="button" aria-pressed={region === id} onClick={() => setRegion(id)}>{name}</button>
            ))}
          </div>
        </header>
        <table className="diag-table route-table" role="table" aria-labelledby="split-title">
          <thead role="rowgroup">
            <tr role="row"><th scope="col">网站</th><th scope="col">出口 IP</th><th scope="col">归属地</th><th scope="col"><span className="sr-only">操作</span></th></tr>
          </thead>
          <tbody role="rowgroup">
            {splitTargets.map((target) => <SplitRow key={target.name} target={target} revision={revision} lookupGeo={lookupGeo} hidden={region !== 'all' && target.region !== region} />)}
          </tbody>
        </table>
      </section>
    </>
  )
}
