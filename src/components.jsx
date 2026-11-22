import { Copy, Globe2, RefreshCw, Search } from 'lucide-react'
import { Link } from './routing.jsx'

export function PageHeading({ title, description, onRefresh, refreshLabel }) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {onRefresh && <button className="button primary-button" type="button" onClick={onRefresh}>
        <RefreshCw size={16} aria-hidden="true" /> {refreshLabel}
      </button>}
    </header>
  )
}

export function SectionHeading({ id, title, icon: Icon, description }) {
  return (
    <div className="section-heading">
      <span className="section-icon"><Icon size={19} aria-hidden="true" /></span>
      <div>
        <h2 id={id}>{title}</h2>
        {description && <p>{description}</p>}
      </div>
    </div>
  )
}

export function Region({ region }) {
  return <span className={`badge ${region}`}>{region === 'domestic' ? '国内' : '国际'}</span>
}

export function Country({ code }) {
  const country = typeof code === 'string' && /^[A-Z]{2}$/i.test(code) && code.toUpperCase()
  if (!country || country === 'XX') return <Globe2 className="country-empty" size={17} aria-hidden="true" />
  const flag = String.fromCodePoint(...Array.from(country, (char) => char.charCodeAt(0) + 127397))
  return <span className="country-flag" role="img" aria-label={country} title={country}>{flag}</span>
}

export function Skeleton({ width = '6rem' }) {
  return <span className="skeleton" style={{ '--skeleton-width': width }} aria-hidden="true" />
}

export function IPActions({ ip, onCopy }) {
  return (
    <span className="ip-actions">
      <button className="icon-button" type="button" onClick={() => onCopy(ip)} title="复制到剪贴板" aria-label="复制到剪贴板">
        <Copy size={15} aria-hidden="true" />
      </button>
      <Link className="icon-button" href={`/query?q=${encodeURIComponent(ip)}`} title="查询这个 IP" aria-label="查询这个 IP">
        <Search size={16} aria-hidden="true" />
      </Link>
    </span>
  )
}
