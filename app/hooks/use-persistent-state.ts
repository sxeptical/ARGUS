"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { readStoredJson, writeStoredJson } from "@/lib/local-history";

/**
 * `useState` backed by localStorage. Renders `initial` on the server and first
 * client paint, then hydrates from storage. Only explicit updates are written,
 * so hydration never overwrites the stored value with the default.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  parse: (stored: unknown) => T | undefined,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initial);
  // An update made before hydration wins over the stored value.
  const touched = useRef(false);
  const parseRef = useRef(parse);
  // Latest value, so `update` can resolve functional actions outside the
  // state updater (updaters must stay pure, and StrictMode double-invokes them).
  const valueRef = useRef(value);

  useEffect(() => {
    parseRef.current = parse;
  });

  useEffect(() => {
    valueRef.current = value;
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (touched.current) return;
      const stored = parseRef.current(readStoredJson(key));
      if (stored !== undefined) setValue(stored);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key]);

  const update = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      touched.current = true;
      const next =
        typeof action === "function"
          ? (action as (previous: T) => T)(valueRef.current)
          : action;
      valueRef.current = next;
      writeStoredJson(key, next);
      setValue(next);
    },
    [key],
  );

  return [value, update];
}
