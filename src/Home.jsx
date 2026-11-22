import { Fragment, useRef, useState } from 'react'
import { Activity, CircleHelp, Database, Globe, RefreshCw, Shield } from 'lucide-react'
import { latencyTargets, providers } from './catalog.js'
import { Country, IPActions, PageHeading, SectionHeading, Skeleton } from './components.jsx'
import { useProbe, useWhenVisible } from './hooks.js'
import { probeLatency, probeProvider, probePublicIP } from './network.js'
import { Link } from './routing.jsx'
import './home.css'

const families = [4, 6].map((version) => ({ version, run: (signal) => probePublicIP(version, signal) }))
const sourceChecks = providers.map((provider) => ({ ...provider, run: (signal) => probeProvider(provider.id, signal) }))
const latencyChecks = latencyTargets.map((target) => ({ ...target, run: (signal, report) => probeLatency(target.url, signal, report) }))
const regions = { domestic: '国内', international: '国际' }
const privacyOptions = [
  ['address', '隐藏 IP'],
  ['domestic', '隐藏国内信息'],
  ['international', '隐藏国际信息'],
]

function IPCard({ family, revision, privacy, onCopy }) {
  const { status, value, error, retry } = useProbe(family.run, revision)
  const pending = status === 'pending'
  const { ip, country, location, isp, asn } = value || {}
  const fields = [['归属地', location], ['运营商', isp], ['自治系统 ASN', asn]]

  return (
    <article className={`home-protocol home-v${family.version}`} aria-label={`IPv${family.version}`} aria-busy={pending}>
      {family.version === 4 && <Globe className="home-protocol-globe" size={224} strokeWidth={0.45} aria-hidden="true" />}
      <div className="home-protocol-head">
        <h2>IPv{family.version}</h2>
        <span className={`home-connection ${status}`}>
          <i aria-hidden="true" />{pending ? '检测中' : ip ? '已连接' : '未检测到'}
        </span>
        {ip && !privacy.address && <IPActions ip={ip} onCopy={onCopy} />}
      </div>
      <div className="home-address">
        {pending ? <Skeleton width="12rem" /> : ip ? (
          <span className="mono">{privacy.address ? '••••••••••••' : ip.split(/(?<=:)(?!:)/).map((part, i) =>
            <Fragment key={i}>{i > 0 && <wbr />}{part}</Fragment>)}</span>
        ) : <span className="home-address-empty">未获取到地址</span>}
      </div>
      {error ? (
        <div className="home-protocol-error">
          <p>{error}</p>
          <button type="button" className="button" onClick={retry}><RefreshCw size={14} aria-hidden="true" />重试</button>
        </div>
      ) : (
        <dl className="home-network-details">
          {fields.map(([label, field]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{pending ? <Skeleton /> : privacy.international ? '已隐藏' : (
                <>{label === '归属地' && country && <Country code={country} />}{field || '暂无信息'}</>
              )}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  )
}

function PrivacyControls({ privacy, setPrivacy }) {
  const [showHelp, setShowHelp] = useState(false)
  return (
    <div className="home-privacy">
      <div className="home-privacy-row">
        <div className="home-privacy-title">
          <Shield size={16} aria-hidden="true" /><strong>隐私显示</strong>
          <button className="icon-button small-icon" type="button" title="隐藏信息说明" aria-label="隐藏信息说明" aria-controls="privacy-help" aria-expanded={showHelp} onClick={() => setShowHelp(!showHelp)}>
            <CircleHelp size={15} />
          </button>
        </div>
        <div className="home-privacy-options">
          {privacyOptions.map(([key, label]) => (
            <button className="home-switch" type="button" role="switch" aria-checked={privacy[key]} key={key} onClick={() => setPrivacy((current) => ({ ...current, [key]: !current[key] }))}>
              <span aria-hidden="true" />{label}
            </button>
          ))}
        </div>
      </div>
      <p id="privacy-help" className="home-privacy-help" hidden={!showHelp}>开关会遮盖本页显示的地址或归属信息，便于截图。检测时浏览器仍会请求相应服务。</p>
    </div>
  )
}

function ProviderRow({ provider, revision, privacy }) {
  const { status, value, error, retry } = useProbe(provider.run, revision)
  const pending = status === 'pending'
  return (
    <div className="home-provider" aria-busy={pending}>
      <dt>
        <span className={`home-source-mark source-${provider.color}`} aria-hidden="true">{provider.mark}</span>
        <span className="home-service-name">{provider.name}<small>{regions[provider.region]}</small></span>
      </dt>
      <dd>
        <div className="home-provider-address">
          {pending ? <Skeleton width="8rem" /> : value ? (
            <span className="mono">{privacy.address ? '••••••••••••' : value.ip}</span>
          ) : <span className="muted">未获取到地址</span>}
        </div>
        <div className="home-provider-location">
          {pending ? <Skeleton width="5rem" /> : value ? (privacy[provider.region] ? '归属地已隐藏' : value.location || '暂无归属地') : error}
        </div>
        {error && <div className="home-source-recovery">
          <button className="home-text-button" type="button" onClick={retry} aria-label={`重试 ${provider.name}`}><RefreshCw size={13} aria-hidden="true" />重试</button>
          {provider.id === 'ip138' && <a href={`https://${new Date().getFullYear()}.ip138.com/`} target="_blank" rel="noreferrer">在 iP138 查看</a>}
        </div>}
      </dd>
    </div>
  )
}

function LatencyRow({ target, revision, enabled }) {
  const { status, value: samples = [], retry } = useProbe(target.run, revision, enabled)
  const successful = samples.filter((sample) => sample !== null)
  const average = successful.length ? Math.round(successful.reduce((total, sample) => total + sample, 0) / successful.length) : null
  const unavailable = status === 'error' || (status === 'success' && average === null)
  const points = Array.from({ length: Math.max(8, samples.length) }, (_, index) => samples[index])
  return (
    <li className="home-latency-row" aria-busy={status === 'pending'}>
      <div className="home-latency-summary">
        <span className="home-target-name">{target.name}</span>
        {average !== null ? <span className="home-latency-value mono">{average}<small> ms</small></span> :
          <span className="home-latency-status">{unavailable ? '不可达' : status === 'idle' ? '待检测' : '检测中'}</span>}
        {unavailable && <button className="icon-button small-icon" type="button" onClick={retry} title="重试" aria-label={`重试 ${target.name} 延迟`}><RefreshCw size={13} /></button>}
      </div>
      <div className="home-latency-chart" role="img" aria-label={`已采样 ${samples.length} 次，其中 ${successful.length} 次有响应`}>
        {points.map((sample, index) => (
          <i key={index} className={sample === null ? 'missed' : sample !== undefined ? 'sampled' : undefined}
            title={sample === null ? '超时' : sample !== undefined ? `${sample} ms` : undefined}
            style={sample != null ? { height: `${Math.min(100, 18 + Math.sqrt(sample) * 3)}%` } : undefined} />
        ))}
      </div>
    </li>
  )
}

export function Home({ onCopy }) {
  const [revision, setRevision] = useState(0)
  const [privacy, setPrivacy] = useState({ address: false, domestic: false, international: false })
  const latencySection = useRef(null)
  const measureLatency = useWhenVisible(latencySection)
  return (
    <div className="home-page">
      <PageHeading title="本机 IP 查询" description="查看当前网络的公网地址、出口归属地和连接延迟。" refreshLabel="重新检测" onRefresh={() => setRevision((value) => value + 1)} />
      <section className="home-overview" aria-label="公网 IP 地址">
        <div className="home-protocols">
          {families.map((family) => <IPCard family={family} key={family.version} revision={revision} privacy={privacy} onCopy={onCopy} />)}
        </div>
        <PrivacyControls privacy={privacy} setPrivacy={setPrivacy} />
      </section>
      <div className="home-diagnostics">
        <section className="home-panel" aria-labelledby="source-title">
          <SectionHeading id="source-title" title="多源 IP 检测" icon={Database} description="对比四个服务看到的出口地址。" />
          <dl className="home-provider-list">
            {sourceChecks.map((provider) => <ProviderRow key={provider.id} provider={provider} revision={revision} privacy={privacy} />)}
          </dl>
          <div className="home-local-links">
            <Link href="/split-tunnel">网站分流测试</Link><Link href="/multi">多出口 IP 查询</Link>
          </div>
        </section>
        <section ref={latencySection} className="home-panel" aria-labelledby="latency-title">
          <SectionHeading id="latency-title" title="网络连通性" icon={Activity} description="各节点的平均 HTTP 响应时间。" />
          <div className="home-latency-groups">
            {Object.entries(regions).map(([region, label]) => (
              <div className="home-latency-group" key={region}>
                <h3>{label}节点</h3>
                <ul>{latencyChecks.filter((target) => target.region === region).map((target) => (
                  <LatencyRow key={target.name} target={target} revision={revision} enabled={measureLatency} />
                ))}</ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
