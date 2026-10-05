export type ScenarioFilter = {
  run?: string | string[];
  dmgfuncpar?: string | string[];
  climate?: string | string[];
  ssp?: string | number | (string | number)[];
  rcp?: string | number | (string | number)[];
  dr?: number | string | (number | string)[];
  prtp?: number | string | (number | string)[];
  eta?: number | string | (number | string)[];
};

export type ScenarioKey = {
  run: string;
  dmgfuncpar: string;
  climate: string;
  ssp: string | number;
  rcp: string | number;
  dr?: number | string | null;
  prtp?: number | string | null;
  eta?: number | string | null;
};

export interface CsccRow {
  run: string;
  dmgfuncpar: string;
  climate: string;
  ssp: string;
  rcp: string;
  dr: number | null;
  prtp: number | null;
  eta: number | null;
  p16_7: number | null;
  p50: number | null;
  p83_3: number | null;
  n: number;
}

export interface CsccOptions {
  run: string[];
  dmgfuncpar: string[];
  climate: string[];
  ssp: string[];
  rcp: string[];
  dr: (number | null)[];
  prtp: (number | null)[];
  eta: (number | null)[];
}

export interface ReadyInfo {
  dataVersion: string;
  formatVersion: number;
  schemaHash: string;
  rows: number;
  countries: number;
}

export interface ApiConfig {
  dataDir?: string;
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  maxCached?: number;
  fetch?: typeof fetch | null;
}

export class DataApiError extends Error {
  code: string;
  details: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>);
}

export const ERROR_CODES: {
  readonly UNKNOWN_ISO3: 'UNKNOWN_ISO3';
  readonly BAD_OPTION: 'BAD_OPTION';
  readonly NETWORK: 'NETWORK';
  readonly BAD_FILE: 'BAD_FILE';
  readonly VERSION_MISMATCH: 'VERSION_MISMATCH';
};

export const version: string;

export function ready(): Promise<ReadyInfo>;
export function readySync(): ReadyInfo;

export function countries(): Promise<string[]>;
export function countriesSync(): string[];

export function options(filter?: ScenarioFilter): Promise<CsccOptions>;
export function optionsSync(filter?: ScenarioFilter): CsccOptions;

export function getData(iso3: string, filter?: ScenarioFilter): Promise<CsccRow[]>;
export function getDataSync(iso3: string, filter?: ScenarioFilter): CsccRow[];

export function get(iso3: string, key: ScenarioKey): Promise<CsccRow | null>;
export function getSync(iso3: string, key: ScenarioKey): CsccRow | null;

export function prefetch(iso3: string | string[]): Promise<void>;
export function prefetchSync(iso3: string | string[]): void;

export function configure(options?: ApiConfig): ApiConfig;
export function clearCache(): void;

declare const api: {
  version: string;
  ready: typeof ready;
  readySync: typeof readySync;
  countries: typeof countries;
  countriesSync: typeof countriesSync;
  options: typeof options;
  optionsSync: typeof optionsSync;
  getData: typeof getData;
  getDataSync: typeof getDataSync;
  get: typeof get;
  getSync: typeof getSync;
  prefetch: typeof prefetch;
  prefetchSync: typeof prefetchSync;
  configure: typeof configure;
  clearCache: typeof clearCache;
  DataApiError: typeof DataApiError;
  ERROR_CODES: typeof ERROR_CODES;
  default: any;
};

export default api;
