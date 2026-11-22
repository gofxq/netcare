import { TriangleAlert } from 'lucide-react'
import { Country, IPActions, PageHeading, Skeleton } from './components.jsx'
import { probeDnsExit } from './diagnostic-probes.js'
import { useProbe } from './hooks.js'

export function DnsExit({ onCopy }) {
  const { status, value, error, retry } = useProbe(probeDnsExit, 0)
  const pending = status === 'pending'
  const rows = value?.rows || []

  return (
    <>
      <PageHeading title="DNS 出口查询" description="查看递归 DNS 解析器对外查询时使用的 IP 地址。" onRefresh={retry} refreshLabel="重新检测" />
      <section className="diag-panel lookup-panel" aria-labelledby="dns-results" aria-busy={pending}>
        <header className="diag-panel-heading">
          <h2 id="dns-results">递归解析器出口 {!pending && <span className="diag-count">{rows.length}</span>}</h2>
          {value?.source && <span className="diag-meta">探针 · {value.source}</span>}
        </header>
        <table className="diag-table dns-table" role="table" aria-labelledby="dns-results">
          <thead role="rowgroup"><tr role="row"><th scope="col">DNS 出口 IP</th><th scope="col">归属地</th><th scope="col"><span className="sr-only">操作</span></th></tr></thead>
          <tbody role="rowgroup">
            {pending && <tr role="row"><td colSpan={3} role="cell" className="dns-pending"><Skeleton width="8rem" /><span role="status">{value || '正在初始化 DNS 检测…'}</span></td></tr>}
            {rows.map(({ ip, country, location }) => (
              <tr key={ip} role="row" className="dns-result-row">
                <th scope="row" role="rowheader"><span className="dns-address address-with-country"><Country code={country} /><span className="mono">{ip}</span></span></th>
                <td role="cell" className="dns-location">{location || '暂无归属地信息'}</td>
                <td role="cell" className="diag-actions"><IPActions ip={ip} onCopy={onCopy} /></td>
              </tr>
            ))}
            {!pending && rows.length === 0 && <tr role="row"><td role="cell" colSpan={3}>
              <span className="diag-empty-message">{error && <TriangleAlert size={17} aria-hidden="true" />}{error || '此次检测未观测到递归 DNS 的出口地址。'}</span>
            </td></tr>}
          </tbody>
        </table>
      </section>
    </>
  )
}
