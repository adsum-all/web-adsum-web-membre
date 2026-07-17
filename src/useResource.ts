import { useEffect, useRef, useState } from "react";

import { ApiError } from "./api.js";

export interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function langFallback(): string {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("adsum.lang") === "en" ? "Network error" : "Erreur réseau";
  } catch {
    return "Erreur réseau";
  }
}

// Load an async resource and keep it fresh WITHOUT a manual page refresh: it refetches
// silently when the tab regains focus / becomes visible, and on a light interval. A silent
// refetch never blanks the data or shows a spinner, and keeps the last value on a transient
// error, so the member sees changes appear on their own.
export function useResource<T>(loader: () => Promise<T>, deps: unknown[], options?: { pollMs?: number }): ResourceState<T> {
  const [state, setState] = useState<ResourceState<T>>({ data: null, loading: true, error: null });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const pollMs = options?.pollMs ?? 20000;

  useEffect(() => {
    let alive = true;
    const run = (silent: boolean): void => {
      if (!silent) setState({ data: null, loading: true, error: null });
      loaderRef.current()
        .then((data) => {
          if (alive) setState({ data, loading: false, error: null });
        })
        .catch((err: unknown) => {
          if (!alive) return;
          const message = err instanceof ApiError ? err.message : langFallback();
          // On a silent refresh, keep whatever we already show rather than flashing an error.
          setState((prev) => (silent && prev.data != null ? prev : { data: null, loading: false, error: message }));
        });
    };
    run(false);
    const onFocus = (): void => run(true);
    const onVisible = (): void => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") run(true);
    };
    if (typeof window !== "undefined") window.addEventListener("focus", onFocus);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    const id = pollMs > 0 && typeof window !== "undefined" ? window.setInterval(() => run(true), pollMs) : undefined;
    return () => {
      alive = false;
      if (typeof window !== "undefined") window.removeEventListener("focus", onFocus);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
      if (id !== undefined) window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
