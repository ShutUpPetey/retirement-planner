import { useEffect, useRef, useState } from 'react';
import type { MonteCarloConfig, MonteCarloResult } from '../types';
import { runMonteCarlo } from '../utils/monteCarlo';

interface UseMonteCarloResult {
  result: MonteCarloResult | null;
  isRunning: boolean;
}

/**
 * Runs the Monte Carlo simulation in a Web Worker, re-running (debounced) whenever
 * the config changes. Falls back to synchronous computation if Workers are
 * unavailable (e.g. older browsers, SSR, test environments).
 *
 * Pass `config = null` to skip simulation (e.g. no accounts / not enough data).
 */
export function useMonteCarlo(config: MonteCarloConfig | null, debounceMs = 250): UseMonteCarloResult {
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const reqIdRef = useRef(0);
  const workerBrokenRef = useRef(false);

  // Lazily construct the worker once
  useEffect(() => {
    try {
      workerRef.current = new Worker(
        new URL('../workers/monteCarlo.worker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch {
      workerBrokenRef.current = true;
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // Serialize config for the dependency comparison
  const configKey = config ? JSON.stringify(config) : null;

  useEffect(() => {
    if (!config) {
      setResult(null);
      setIsRunning(false);
      return;
    }

    setIsRunning(true);
    const reqId = ++reqIdRef.current;
    let cancelled = false;

    const timer = setTimeout(() => {
      const worker = workerRef.current;

      if (worker && !workerBrokenRef.current) {
        const handle = (e: MessageEvent<{ id: number; result: MonteCarloResult }>) => {
          if (e.data.id !== reqId || cancelled) return;
          worker.removeEventListener('message', handle);
          setResult(e.data.result);
          setIsRunning(false);
        };
        const handleErr = () => {
          // Worker failed — fall back to sync for this and future runs
          worker.removeEventListener('message', handle);
          worker.removeEventListener('error', handleErr);
          workerBrokenRef.current = true;
          if (cancelled) return;
          setResult(runMonteCarlo(config));
          setIsRunning(false);
        };
        worker.addEventListener('message', handle);
        worker.addEventListener('error', handleErr);
        worker.postMessage({ id: reqId, config });
      } else {
        // Synchronous fallback
        const r = runMonteCarlo(config);
        if (!cancelled) {
          setResult(r);
          setIsRunning(false);
        }
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, debounceMs]);

  return { result, isRunning };
}
