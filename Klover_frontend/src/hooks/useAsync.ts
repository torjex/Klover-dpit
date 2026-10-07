import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";

interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  initial: boolean;
  reload: () => void;
}


export function useAsync<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  options: { intervalMs?: number } = {},
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initial, setInitial] = useState(true);
  const [tick, setTick] = useState(0);
  const requestId = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    const id = ++requestId.current;
    let cancelled = false;
    setLoading(true);
    loaderRef
      .current()
      .then((result) => {
        if (cancelled || id !== requestId.current) return;
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled || id !== requestId.current) return;
        setError(cause instanceof ApiError ? cause.message : "Unexpected error");
      })
      .finally(() => {
        if (cancelled || id !== requestId.current) return;
        setLoading(false);
        setInitial(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const { intervalMs } = options;
  useEffect(() => {
    if (!intervalMs) return;
    const timer = window.setInterval(reload, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, reload]);

  return { data, error, loading, initial, reload };
}

/** Ticks once a second; used by live countdowns. */
export function useSecondsTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}
