import { localTools } from './catalog.js'

export function currentRoute() {
  const pathname = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/'
  const path = localTools.some((tool) => tool.path === pathname) ? pathname : '/'
  return { path, search: window.location.search }
}

export function navigate(href, scroll = true) {
  if (`${window.location.pathname}${window.location.search}` === href) return
  window.history.pushState(null, '', href)
  window.dispatchEvent(new PopStateEvent('popstate'))
  if (scroll) {
    window.scrollTo(0, 0)
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }
}

export function Link({ href, onClick, ...attributes }) {
  return <a {...attributes} href={href} onClick={(event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(href)
    onClick?.()
  }} />
}
