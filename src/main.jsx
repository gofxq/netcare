import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, Check, ChevronDown, Globe2, Menu, Monitor, Moon, Network, Route, Search, Server, Sun, X } from 'lucide-react'
import { localTools } from './catalog.js'
import './styles.css'
import { DnsExit } from './DnsExit.jsx'
import { Home } from './Home.jsx'
import { IPQuery } from './IPQuery.jsx'
import { MultiExit } from './MultiExit.jsx'
import { SplitTunnel } from './SplitTunnel.jsx'
import { currentRoute, Link } from './routing.jsx'
import './diagnostic-pages.css'

const pages = { '/': Home, '/split-tunnel': SplitTunnel, '/multi': MultiExit, '/dns-exit-lookup': DnsExit, '/query': IPQuery }
const toolIcons = { globe: Globe2, route: Route, network: Network, search: Search, server: Server }
const themes = { auto: ['跟随系统', Monitor], light: ['浅色', Sun], dark: ['深色', Moon] }

function readTheme() {
  try {
    const saved = localStorage.getItem('netcare-theme')
    if (Object.hasOwn(themes, saved)) return saved
  } catch {
    // The theme still works when storage is unavailable.
  }
  return 'auto'
}

function ThemePicker() {
  const [theme, setTheme] = useState(readTheme)
  const details = useRef(null)
  const summary = useRef(null)
  const [label, Icon] = themes[theme]

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('netcare-theme', theme)
    } catch {
      // Storage is optional.
    }
  }, [theme])

  useEffect(() => {
    const dismiss = (event) => {
      if (details.current && !details.current.contains(event.target)) details.current.open = false
    }
    window.addEventListener('pointerdown', dismiss)
    return () => window.removeEventListener('pointerdown', dismiss)
  }, [])

  const close = () => {
    details.current.open = false
    summary.current.focus()
  }

  return (
    <details className="theme-picker" ref={details}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false }}
      onKeyDown={(event) => { if (event.key === 'Escape' && details.current.open) close() }}>
      <summary ref={summary} className="theme-trigger" aria-label="显示主题" title={`显示主题 · ${label}`}>
        <Icon size={17} aria-hidden="true" /><span>{label}</span><ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div className="theme-options" aria-label="显示主题">
        {Object.entries(themes).map(([key, [name, ModeIcon]]) => (
          <button type="button" aria-pressed={key === theme} key={key} onClick={() => { setTheme(key); close() }}>
            <ModeIcon size={16} aria-hidden="true" /> {name}
            {key === theme && <Check className="theme-check" size={15} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </details>
  )
}

function AppHeader({ path }) {
  const [open, setOpen] = useState(false)
  const nav = useRef(null)
  const toggle = useRef(null)

  useEffect(() => {
    if (!open) return
    nav.current.querySelector('[aria-current="page"]')?.focus()
    const dismissOutside = (event) => {
      if (!nav.current.contains(event.target) && !toggle.current.contains(event.target)) setOpen(false)
    }
    const dismiss = () => setOpen(false)
    const desktop = window.matchMedia('(min-width: 980px)')
    desktop.addEventListener('change', dismiss)
    window.addEventListener('popstate', dismiss)
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('focusin', dismissOutside)
    return () => {
      desktop.removeEventListener('change', dismiss)
      window.removeEventListener('popstate', dismiss)
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('focusin', dismissOutside)
    }
  }, [open])

  const select = () => {
    setOpen(false)
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }

  return (
    <header className="masthead" onKeyDown={(event) => {
      if (open && event.key === 'Escape') {
        setOpen(false)
        toggle.current.focus()
      }
    }}>
      <div className="masthead-inner">
        <Link href="/" className="brand" aria-label="NetCare 首页">
          <span className="brand-icon"><Activity size={23} strokeWidth={2.5} aria-hidden="true" /></span>
          NetCare
        </Link>
        <nav ref={nav} id="tool-navigation" className={`tool-nav${open ? ' is-open' : ''}`} aria-label="网络工具">
          {localTools.map(({ label, path: href, icon }) => {
            const Icon = toolIcons[icon]
            return <Link className="nav-link" key={href} href={href} aria-current={href === path ? 'page' : undefined} onClick={select}>
              <Icon size={17} aria-hidden="true" />{label}
            </Link>
          })}
        </nav>
        <div className="header-actions">
          <ThemePicker />
          <button ref={toggle} className="icon-button menu-toggle" type="button" onClick={() => setOpen(!open)}
            aria-label={open ? '关闭导航' : '打开导航'} aria-controls="tool-navigation" aria-expanded={open}>
            {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  )
}

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through for browsers that deny clipboard permissions.
    }
  }
  const previous = document.activeElement
  const input = document.createElement('textarea')
  input.value = text
  input.readOnly = true
  input.style.cssText = 'position:fixed;left:-9999px;top:0'
  document.body.append(input)
  input.select()
  try {
    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable')
  } finally {
    input.remove()
    previous?.focus()
  }
}

function App() {
  const [{ path, search }, setRoute] = useState(currentRoute)
  const [toast, setToast] = useState(null)
  const title = localTools.find((tool) => tool.path === path).label
  const Page = pages[path]

  useEffect(() => {
    const onPopState = () => setRoute(currentRoute())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => { document.title = `${title} · NetCare` }, [title])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(timer)
  }, [toast])

  const copy = async (text) => {
    try {
      await writeClipboard(text)
      setToast({ text: 'IP 已复制到剪贴板', copied: true })
    } catch {
      setToast({ text: '复制失败，请手动复制 IP 地址。', copied: false })
    }
  }

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">跳转到主要内容</a>
      <AppHeader path={path} />
      <main id="main-content" tabIndex={-1} className="content">
        <Page search={search} onCopy={copy} />
      </main>
      <div className="toast-container" role="status" aria-live="polite">
        {toast && <div className="toast">{toast.copied && <Check size={18} aria-hidden="true" />}{toast.text}</div>}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
