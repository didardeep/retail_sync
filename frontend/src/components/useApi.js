import { useCallback, useEffect, useState } from 'react'

/** Small data-fetching helper so pages stay readable. */
export function useApi(fn, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const run = useCallback(() => {
    setLoading(true)
    fn()
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch(setError)
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(run, [run])
  return { data, error, loading, reload: run }
}
