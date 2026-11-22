import { useEffect, useState } from 'react'
import { ProbeError } from './network.js'

export function useProbe(run, revision, enabled = true) {
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const { signal } = controller
    const update = (status, value, error) => {
      if (!signal.aborted) setResult({ run, revision, attempt, status, value, error })
    }
    const execute = async () => {
      try {
        const value = await run(signal, (progress) => update('pending', progress))
        update('success', value)
      } catch (error) {
        update(error?.code === 'missing' ? 'missing' : 'error', undefined,
          error instanceof ProbeError ? error.message : '获取失败，请检查网络后重试。')
      }
    }
    void execute()
    return () => controller.abort()
  }, [run, revision, attempt, enabled])

  const retry = () => setAttempt((value) => value + 1)
  if (!enabled) return { status: 'idle', retry }
  if (result?.run !== run || result?.revision !== revision || result?.attempt !== attempt) {
    return { status: 'pending', retry }
  }
  return { ...result, retry }
}

export function useWhenVisible(ref, immediate = false) {
  const [visible, setVisible] = useState(immediate)
  useEffect(() => {
    if (visible) return
    if (!('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '100px' })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref, visible])
  return visible
}
