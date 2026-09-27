import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLibraryVersion } from "@/state/store";

/**
 * Loads data and reloads it when the library changes or the screen regains focus.
 * Stale responses from earlier loads are discarded.
 */
export function useQuery<T>(
  load: () => Promise<T>,
  deps: unknown[],
): { data: T | undefined; error: Error | null; reload: () => void } {
  const version = useLibraryVersion();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error | null>(null);
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);

  const reload = useCallback(() => {
    const id = ++seq.current;
    run().then(
      (value) => {
        if (id === seq.current) {
          setData(value);
          setError(null);
        }
      },
      (e: unknown) => {
        if (id === seq.current) setError(e instanceof Error ? e : new Error(String(e)));
      },
    );
  }, [run]);

  useEffect(reload, [reload, version]);
  useFocusEffect(reload);
  return { data, error, reload };
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setV(value), ms);
    return () => clearTimeout(h);
  }, [value, ms]);
  return v;
}
