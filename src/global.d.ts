import type { MargeXApi } from '../shared/types';

declare global {
  interface Window {
    margex: MargeXApi;
  }
}

export {};
