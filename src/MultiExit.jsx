import { useCallback, useMemo, useRef, useState } from 'react'
import { ChevronDown, Globe2, Square } from 'lucide-react'
import { Country, IPActions, PageHeading, Skeleton } from './components.jsx'
import { scanExits } from './diagnostic-probes.js'
import { useProbe } from './hooks.js'
import { createGeoLookup, joinDetails } from './network.js'

function ExitGroup({ ip, targets, lookup, onCopy }) {
  const [expanded, setExpanded] = useState(false)
  const load = useCallback(() => lookup(ip), [ip, lookup])
  const geo = useProbe(load, ip)
  const countries = new Map()
  if (expanded) {
    for (const target of targets) {
      const key = target.countryCode || target.country || '未标注地区'
      const region = countries.get(key) || { name: target.country || key, code: target.countryCode, entries: [] }
      region.entries.push(target)
      countries.set(key, region)
    }
  }

  return (
    <article className="exit-card">
      <div className="exit-head">
        <h3 className="address-with-country"><Country code={geo.value?.country} /><span className="mono">{ip}</span></h3>
        <IPActions ip={ip} onCopy={onCopy} />
      </div>
      <p className="exit-location">
        {geo.status === 'pending' ? <Skeleton width="10rem" /> : joinDetails(geo.value?.location, geo.value?.isp) || '暂无归属地信息'}
      </p>
      <details className="exit-probes" onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>{targets.length} 个探针发现此出口<ChevronDown size={16} aria-hidden="true" /></summary>
        {expanded && <div className="exit-regions">
          {Array.from(countries, ([key, { name, code, entries }]) => (
            <div key={key}>
              <h4><Country code={code} />{name}</h4>
              <ul>{entries.map((target) => <li key={target.url} title={target.host}>{target.name}</li>)}</ul>
            </div>
          ))}
        </div>}
      </details>
    </article>
  )
}

export function MultiExit({ onCopy }) {
  const active = useRef(null)
  const run = useCallback(async (signal, report) => {
    const controller = new AbortController()
    active.current = controller
    try {
      return await scanExits(signal, controller.signal, report)
    } finally {
      if (active.current === controller) active.current = null
    }
  }, [])
  const { status, value, error, retry } = useProbe(run, 0)
  const pending = status === 'pending'
  const lookup = useMemo(createGeoLookup, [])
  const groups = useMemo(() => {
    const found = new Map()
    for (const target of value?.matches || []) {
      if (!found.has(target.ip)) found.set(target.ip, [])
      found.get(target.ip).push(target)
    }
    return [...found.entries()].sort(([a, left], [b, right]) => right.length - left.length || a.localeCompare(b))
  }, [value])
  const completed = (value?.matches.length || 0) + (value?.failed || 0)

  return (
    <>
      <PageHeading title="多出口 IP 查询" description="连接不同地区的探针，查看它们观测到的公网出口。" onRefresh={retry} refreshLabel="重新检测" />
      <section className="diag-panel scan-panel" aria-labelledby="multi-progress">
        <header className="diag-panel-heading">
          <h2 id="multi-progress">检测进度</h2>
          {pending && <button type="button" className="button stop-button" onClick={() => active.current?.abort()}><Square size={13} aria-hidden="true" />停止检测</button>}
          {!pending && <span className="diag-meta">{value?.stopped ? '检测已停止' : error ? '检测失败' : '检测完成'}</span>}
        </header>
        <div className="scan-body">
          <div className="scan-progress-label">
            <span>{value ? `已检测 ${completed} / ${value.total}` : (error || '正在加载探针目录…')}</span>
            {value && <span>成功 {value.matches.length} · 失败 {value.failed}</span>}
          </div>
          <progress max={value?.total || 1} value={value ? completed : undefined} aria-label="出口探针检测进度" />
          {value?.limited && <p className="diagnostic-note">探针目录暂不可用，当前使用内置公网探针。</p>}
        </div>
      </section>
      <section className="diag-panel exit-panel" aria-labelledby="exit-title">
        <header className="diag-panel-heading"><h2 id="exit-title">出口地址 <span className="diag-count">{groups.length}</span></h2></header>
        {groups.map(([ip, targets]) => <ExitGroup key={ip} ip={ip} targets={targets} lookup={lookup} onCopy={onCopy} />)}
        {groups.length === 0 && <p className="exit-empty" role="status">
          <Globe2 size={20} aria-hidden="true" />{pending ? '等待探针返回出口地址…' : '本轮没有获取到出口 IP。'}
        </p>}
      </section>
    </>
  )
}
