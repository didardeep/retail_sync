import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

// Filters that live in the URL, so a filtered view can be shared, refreshed,
// and the back button works. `tab` belongs to the parent page and survives
// clearAll.
//
// options.dependsOn: { tool: ['section', 'criterion'] } means changing `tool`
// also deletes `section` and `criterion` (they belong to one tool).
export function useUrlFilters(keys, options = {}) {
  const { dependsOn = {} } = options
  const [params, setParams] = useSearchParams()

  const keyList = keys.join(',')
  const filters = useMemo(
    () => Object.fromEntries(keys.map((k) => [k, params.get(k) || ''])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, keyList],
  )

  function setFilter(key, value) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value); else next.delete(key)
      for (const dep of dependsOn[key] || []) next.delete(dep)
      return next
    }, { replace: true })
  }

  // Several keys in one URL update (two setFilter calls in one tick would each
  // start from the same URL and the first would be lost).
  function setMany(values) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(values)) {
        if (value) next.set(key, value); else next.delete(key)
      }
      return next
    }, { replace: true })
  }

  const toggle = (key, value) => setFilter(key, filters[key] === value ? '' : value)

  function clearAll() {
    setParams((prev) => {
      const next = new URLSearchParams()
      if (prev.get('tab')) next.set('tab', prev.get('tab'))
      return next
    }, { replace: true })
  }

  return { filters, setFilter, setMany, toggle, clearAll }
}
