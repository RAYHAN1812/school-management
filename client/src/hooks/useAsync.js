import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Run an async loader and track { data, error, loading }. Re-runs when deps change;
 * `reload()` re-runs on demand. Stale responses from earlier runs are ignored.
 */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const runId = useRef(0);

  const run = useCallback(async () => {
    runId.current += 1;
    const id = runId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loader();
      if (id === runId.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (id === runId.current) setState((s) => ({ ...s, error, loading: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { ...state, reload: run };
}

/** Debounce a fast-changing value (e.g. a search box). */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
