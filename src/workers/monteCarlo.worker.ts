/// <reference lib="webworker" />
import { runMonteCarlo } from '../utils/monteCarlo';
import type { MonteCarloConfig, MonteCarloResult } from '../types';

interface RequestMessage {
  id: number;
  config: MonteCarloConfig;
}

interface ResponseMessage {
  id: number;
  result: MonteCarloResult;
}

self.onmessage = (e: MessageEvent<RequestMessage>) => {
  const { id, config } = e.data;
  const result = runMonteCarlo(config);
  const response: ResponseMessage = { id, result };
  (self as unknown as Worker).postMessage(response);
};
