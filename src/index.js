/*! cscc-local - High-performance local Node & Bun client for Country-Level Social Cost of Carbon data */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LIB_VERSION = '1.0.0';
const SUPPORTED_FORMAT = 1;
const HEADER_BYTES = 16;
const MAGIC = 0x43534343; // "CSCC", big-endian
const KEY_COLS = ['run', 'dmgfuncpar', 'climate', 'SSP', 'RCP', 'discount'];
const KEY5 = ['run', 'dmgfuncpar', 'climate', 'ssp', 'rcp'];
const COL_OF = { run: 'run', dmgfuncpar: 'dmgfuncpar', climate: 'climate', ssp: 'SSP', rcp: 'RCP' };
const DISC = ['dr', 'prtp', 'eta'];
const FIELDS = KEY5.concat(DISC);
const IS_LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

const ERROR_CODES = Object.freeze({
  UNKNOWN_ISO3: 'UNKNOWN_ISO3',
  BAD_OPTION: 'BAD_OPTION',
  NETWORK: 'NETWORK',
  BAD_FILE: 'BAD_FILE',
  VERSION_MISMATCH: 'VERSION_MISMATCH',
});

class DataApiError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'DataApiError';
    this.code = code;
    this.details = details || {};
  }
}
const bad = (msg, details) => new DataApiError('BAD_OPTION', msg, details);

// ---- auto-detect local data directory --------------------------------------------------------
function findDefaultDataDir() {
  const candidates = [
    path.resolve(__dirname, '..'),              // package root when in src/
    path.resolve(__dirname, '../data/..'),
    __dirname,                                  // if bundled / flat
    path.resolve(process.cwd(), 'data/..'),
    process.cwd(),
  ];

  for (const dir of candidates) {
    try {
      const meta = path.join(dir, 'meta.json');
      const data = path.join(dir, 'data');
      if (fs.existsSync(meta) && fs.existsSync(data)) {
        return dir;
      }
    } catch (_) {}
  }
  return null;
}

// ---- configuration --------------------------------------------------------------------------
const cfg = {
  dataDir: null,
  baseUrl: null,
  timeoutMs: 15000,
  retries: 1,
  maxCached: Infinity,
  fetch: null,
};

let state = newState();
function newState() {
  return { meta: null, metaP: null, cache: new Map(), cacheSync: new Map() };
}

function getMode() {
  if (cfg.baseUrl) return 'remote';
  return 'local';
}

function getLocalDir() {
  if (cfg.dataDir) {
    return path.resolve(process.cwd(), cfg.dataDir);
  }
  const def = findDefaultDataDir();
  if (def) return def;
  throw bad('Local data directory not found. Call configure({ dataDir: "..." }) or configure({ baseUrl: "..." }).');
}

const withSlash = (u) => (u.charAt(u.length - 1) === '/' ? u : u + '/');

function toArrayBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function getFetch() {
  if (cfg.fetch) return cfg.fetch;
  if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis);
  throw bad('No fetch implementation available. Use Node 18+ or provide configure({ fetch }).');
}

// ---- network fallback (when baseUrl is explicitly configured) --------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, asText) {
  const f = getFetch();
  let lastErr = null;
  for (let i = 0; i <= cfg.retries; i++) {
    if (i > 0) await sleep(300);
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl && cfg.timeoutMs > 0 ? setTimeout(() => ctrl.abort(), cfg.timeoutMs) : 0;
    try {
      const res = await f(url, ctrl ? { signal: ctrl.signal } : undefined);
      if (res.ok) return asText ? await res.text() : await res.arrayBuffer();
      if (res.status < 500) {
        throw new DataApiError('BAD_FILE', `HTTP ${res.status} for ${url}`, { url, status: res.status });
      }
      lastErr = new DataApiError('NETWORK', `HTTP ${res.status} from ${url}`, { url, status: res.status });
    } catch (e) {
      if (e instanceof DataApiError && e.code === 'BAD_FILE') throw e;
      lastErr = new DataApiError('NETWORK', `Could not fetch ${url}: ${e ? e.message : e}`, { url, cause: e });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastErr;
}

// ---- metadata loading -----------------------------------------------------------------------
function prepareMeta(raw) {
  if (raw.formatVersion !== SUPPORTED_FORMAT) {
    throw new DataApiError('VERSION_MISMATCH', `Data format ${raw.formatVersion} is not supported (reads format ${SUPPORTED_FORMAT})`, {
      found: raw.formatVersion,
      supported: SUPPORTED_FORMAT,
    });
  }
  const m = { rows: raw.rows, dataVersion: raw.dataVersion, formatVersion: raw.formatVersion, schemaHash: raw.schemaHash };
  try {
    m.layout = raw.layout;
    m.countries = raw.countries;
    m.countrySet = new Set(raw.countries);
    m.dict = {};
    m.codes = {};
    m.ci = {};
    for (const c of KEY_COLS) {
      m.dict[c] = raw.dict[c];
      m.codes[c] = Uint8Array.from(raw.keys[c]);
      if (m.codes[c].length !== m.rows) throw new Error('key length');
      m.ci[c] = new Map(raw.dict[c].map((v, i) => [v.toLowerCase(), i]));
    }
    m.mult = {};
    let size = 1;
    for (let i = KEY_COLS.length - 1; i >= 0; i--) {
      m.mult[KEY_COLS[i]] = size;
      size *= m.dict[KEY_COLS[i]].length;
    }
    m.lookup = new Int32Array(size).fill(-1);
    for (let r = 0; r < m.rows; r++) {
      let id = 0;
      for (const c of KEY_COLS) id += m.codes[c][r] * m.mult[c];
      m.lookup[id] = r;
    }
    m.disc = m.dict.discount.map((lab) => {
      const d = raw.discountDetail[lab];
      return { dr: d.dr, prtp: d.prtp, eta: d.eta };
    });
    m.discIndex = new Map(m.disc.map((d, i) => [`${d.dr}|${d.prtp}|${d.eta}`, i]));
    m.discValues = {};
    for (const f of DISC) m.discValues[f] = sortVals(Array.from(new Set(m.disc.map((d) => d[f]))));
    m.schemaU32 = parseInt(String(raw.schemaHash).slice(0, 8), 16);
  } catch (e) {
    throw new DataApiError('BAD_FILE', 'meta.json is missing expected fields', { cause: e });
  }
  return m;
}

function loadMeta(st) {
  if (st.meta) return Promise.resolve(st.meta);
  if (!st.metaP) {
    const mode = getMode();
    let p;
    if (mode === 'local') {
      const dir = getLocalDir();
      const filePath = path.join(dir, 'meta.json');
      p = (async () => {
        let text;
        try {
          text = await fs.promises.readFile(filePath, 'utf8');
        } catch (e) {
          throw new DataApiError('BAD_FILE', `Could not read ${filePath}: ${e.message}`, { file: filePath, cause: e });
        }
        let raw;
        try {
          raw = JSON.parse(text);
        } catch (e) {
          throw new DataApiError('BAD_FILE', 'meta.json is not valid JSON', { file: filePath });
        }
        const m = prepareMeta(raw);
        st.meta = m;
        return m;
      })();
    } else {
      const base = cfg.baseUrl;
      p = (async () => {
        const text = await request(base + 'meta.json', true);
        let raw;
        try {
          raw = JSON.parse(text);
        } catch (e) {
          throw new DataApiError('BAD_FILE', 'meta.json is not valid JSON', { url: base + 'meta.json' });
        }
        const m = prepareMeta(raw);
        st.meta = m;
        return m;
      })();
    }
    st.metaP = p;
    p.catch(() => {
      if (st.metaP === p) {
        st.metaP = null;
        st.meta = null;
      }
    });
  }
  return st.metaP;
}

function loadMetaSync(st) {
  if (st.meta) return st.meta;
  const mode = getMode();
  if (mode !== 'local') {
    throw bad('Synchronous methods (readySync, getDataSync, etc.) require local data files. Use await ready() for remote URLs.');
  }
  const dir = getLocalDir();
  const filePath = path.join(dir, 'meta.json');
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    throw new DataApiError('BAD_FILE', `Could not read ${filePath}: ${e.message}`, { file: filePath, cause: e });
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new DataApiError('BAD_FILE', 'meta.json is not valid JSON', { file: filePath });
  }
  const m = prepareMeta(raw);
  st.meta = m;
  st.metaP = Promise.resolve(m);
  return m;
}

// ---- binary country decoding ----------------------------------------------------------------
function decode(m, iso, buf) {
  const rows = m.rows;
  const url = `data/${iso}.bin`;
  if (buf.byteLength !== m.layout.bytesPerFile) {
    throw new DataApiError('BAD_FILE', `${url} is ${buf.byteLength} bytes, expected ${m.layout.bytesPerFile}`, { file: url });
  }
  const dv = new DataView(buf);
  if (dv.getUint32(0, false) !== MAGIC) throw new DataApiError('BAD_FILE', `${url} is not a valid data file (bad magic)`, { file: url });
  const fmt = dv.getUint16(4, true);
  const hRows = dv.getUint32(8, true);
  const schema = dv.getUint32(12, true);
  if (fmt !== m.formatVersion || hRows !== rows || schema !== m.schemaU32) {
    throw new DataApiError('VERSION_MISMATCH', `${url} does not match meta.json (file from different release?)`, {
      file: url,
      fileFormat: fmt,
      fileRows: hRows,
      fileSchema: schema,
      metaSchema: m.schemaU32,
    });
  }
  const at = (k) => HEADER_BYTES + rows * 4 * k;
  if (IS_LE) {
    return {
      p16: new Float32Array(buf, at(0), rows),
      p50: new Float32Array(buf, at(1), rows),
      p83: new Float32Array(buf, at(2), rows),
      n: new Uint32Array(buf, at(3), rows),
    };
  }
  const f32 = (k) => Float32Array.from({ length: rows }, (_, i) => dv.getFloat32(at(k) + 4 * i, true));
  return { p16: f32(0), p50: f32(1), p83: f32(2), n: Uint32Array.from({ length: rows }, (_, i) => dv.getUint32(at(3) + 4 * i, true)) };
}

function loadCountry(st, m, iso) {
  const hit = st.cache.get(iso);
  if (hit) {
    st.cache.delete(iso);
    st.cache.set(iso, hit);
    return hit;
  }
  const mode = getMode();
  let p;
  if (mode === 'local') {
    const dir = getLocalDir();
    const filePath = path.join(dir, 'data', `${iso}.bin`);
    p = (async () => {
      let buf;
      try {
        buf = await fs.promises.readFile(filePath);
      } catch (e) {
        throw new DataApiError('BAD_FILE', `Could not read ${filePath}: ${e.message}`, { file: filePath, cause: e });
      }
      const decoded = decode(m, iso, toArrayBuffer(buf));
      st.cacheSync.set(iso, decoded);
      return decoded;
    })();
  } else {
    const base = cfg.baseUrl;
    p = (async () => {
      const buf = await request(`${base}data/${iso}.bin`, false);
      const decoded = decode(m, iso, buf);
      st.cacheSync.set(iso, decoded);
      return decoded;
    })();
  }
  st.cache.set(iso, p);
  p.catch(() => {
    if (st.cache.get(iso) === p) {
      st.cache.delete(iso);
      st.cacheSync.delete(iso);
    }
  });
  trim(st);
  return p;
}

function loadCountrySync(st, m, iso) {
  const hit = st.cacheSync.get(iso);
  if (hit) {
    st.cacheSync.delete(iso);
    st.cacheSync.set(iso, hit);
    return hit;
  }
  const mode = getMode();
  if (mode !== 'local') {
    throw bad('Synchronous methods (getDataSync, getSync, etc.) require local data files. Use await getData() for remote URLs.');
  }
  const dir = getLocalDir();
  const filePath = path.join(dir, 'data', `${iso}.bin`);
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch (e) {
    throw new DataApiError('BAD_FILE', `Could not read ${filePath}: ${e.message}`, { file: filePath, cause: e });
  }
  const decoded = decode(m, iso, toArrayBuffer(buf));
  st.cacheSync.set(iso, decoded);
  st.cache.set(iso, Promise.resolve(decoded));
  trim(st);
  return decoded;
}

function trim(st) {
  while (st.cache.size > cfg.maxCached) st.cache.delete(st.cache.keys().next().value);
  while (st.cacheSync.size > cfg.maxCached) st.cacheSync.delete(st.cacheSync.keys().next().value);
}

// ---- normalization & filtering --------------------------------------------------------------
const normSsp = (v) => (/^\d+$/.test(String(v)) ? 'SSP' + v : String(v));
const normRcp = (v) => {
  const s = String(v);
  if (!/^\d+(\.\d+)?$/.test(s)) return s;
  const n = parseFloat(s);
  return 'rcp' + (n < 10 ? Math.round(n * 10) : n);
};

function normNum(field, v) {
  if (v === null || v === 'NA') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace('p', '.'));
  if (!Number.isFinite(n)) throw bad(`Invalid ${field} "${v}"`, { field, value: v });
  return n;
}

function sortVals(a) {
  return a.sort((x, y) => (x === null) - (y === null) || x - y);
}

function keyCode(m, field, v) {
  const col = COL_OF[field];
  const s = field === 'ssp' ? normSsp(v) : field === 'rcp' ? normRcp(v) : String(v);
  const c = m.dict[col].indexOf(s);
  if (c < 0) throw bad(`Unknown ${field} "${v}"`, { field, value: v, valid: m.dict[col].slice() });
  return c;
}

function checkIso(m, iso3) {
  const iso = typeof iso3 === 'string' ? iso3.trim().toUpperCase() : '';
  if (!m.countrySet.has(iso)) {
    throw new DataApiError('UNKNOWN_ISO3', `Unknown ISO3 code "${iso3}"`, { value: iso3, valid: m.countries.slice() });
  }
  return iso;
}

function compile(m, filter) {
  const masks = {};
  if (filter === undefined || filter === null) return masks;
  if (typeof filter !== 'object' || Array.isArray(filter)) throw bad('filter must be an object like { ssp: 2, rcp: [4.5, 6] }');
  for (const key of Object.keys(filter)) {
    if (key === 'n') throw bad('"n" is a result value and cannot be used as a filter', { field: 'n', valid: FIELDS.slice() });
    if (FIELDS.indexOf(key) < 0) throw bad(`Unknown filter field "${key}"`, { field: key, valid: FIELDS.slice() });
    if (filter[key] === undefined) continue;
    const vals = Array.isArray(filter[key]) ? filter[key] : [filter[key]];
    if (!vals.length) throw bad(`Filter "${key}" is an empty array`, { field: key });
    if (DISC.indexOf(key) >= 0) {
      const nums = vals.map((v) => normNum(key, v));
      for (const x of nums) {
        if (m.discValues[key].indexOf(x) < 0) throw bad(`Unknown ${key} "${x}"`, { field: key, value: x, valid: m.discValues[key].slice() });
      }
      const mask = new Uint8Array(m.disc.length);
      m.disc.forEach((d, i) => {
        if (nums.indexOf(d[key]) >= 0) mask[i] = 1;
      });
      masks[key] = mask;
    } else {
      const mask = new Uint8Array(m.dict[COL_OF[key]].length);
      for (const v of vals) mask[keyCode(m, key, v)] = 1;
      masks[key] = mask;
    }
  }
  return masks;
}

function matcher(m, masks, exclude) {
  const tests = [];
  for (const f of KEY5) if (f !== exclude && masks[f]) tests.push([m.codes[COL_OF[f]], masks[f]]);
  let dm = null;
  for (const f of DISC) {
    if (f === exclude || !masks[f]) continue;
    dm = dm ? dm.map((x, i) => x & masks[f][i]) : masks[f];
  }
  if (dm) tests.push([m.codes.discount, dm]);
  return (r) => {
    for (let i = 0; i < tests.length; i++) if (!tests[i][1][tests[i][0][r]]) return false;
    return true;
  };
}

const nn = (x) => (x !== x ? null : x);
function makeRow(m, c, r) {
  const d = m.disc[m.codes.discount[r]];
  return {
    run: m.dict.run[m.codes.run[r]],
    dmgfuncpar: m.dict.dmgfuncpar[m.codes.dmgfuncpar[r]],
    climate: m.dict.climate[m.codes.climate[r]],
    ssp: m.dict.SSP[m.codes.SSP[r]],
    rcp: m.dict.RCP[m.codes.RCP[r]],
    dr: d.dr,
    prtp: d.prtp,
    eta: d.eta,
    p16_7: nn(c.p16[r]),
    p50: nn(c.p50[r]),
    p83_3: nn(c.p83[r]),
    n: c.n[r],
  };
}

// ---- public API -----------------------------------------------------------------------------
async function ready() {
  const m = await loadMeta(state);
  return { dataVersion: m.dataVersion, formatVersion: m.formatVersion, schemaHash: m.schemaHash, rows: m.rows, countries: m.countries.length };
}

function readySync() {
  const m = loadMetaSync(state);
  return { dataVersion: m.dataVersion, formatVersion: m.formatVersion, schemaHash: m.schemaHash, rows: m.rows, countries: m.countries.length };
}

async function countries() {
  return (await loadMeta(state)).countries.slice();
}

function countriesSync() {
  return loadMetaSync(state).countries.slice();
}

async function options(filter) {
  const m = await loadMeta(state);
  return computeOptions(m, filter);
}

function optionsSync(filter) {
  const m = loadMetaSync(state);
  return computeOptions(m, filter);
}

function computeOptions(m, filter) {
  const masks = compile(m, filter);
  const out = {};
  for (const f of FIELDS) {
    const ok = matcher(m, masks, f);
    if (DISC.indexOf(f) >= 0) {
      const seen = new Set();
      for (let r = 0; r < m.rows; r++) if (ok(r)) seen.add(m.disc[m.codes.discount[r]][f]);
      out[f] = sortVals(Array.from(seen));
    } else {
      const col = COL_OF[f];
      const seen = new Uint8Array(m.dict[col].length);
      for (let r = 0; r < m.rows; r++) if (ok(r)) seen[m.codes[col][r]] = 1;
      out[f] = m.dict[col].filter((_, i) => seen[i]);
    }
  }
  return out;
}

async function getData(iso3, filter) {
  const st = state;
  const m = await loadMeta(st);
  const iso = checkIso(m, iso3);
  const masks = compile(m, filter);
  const c = await loadCountry(st, m, iso);
  const ok = matcher(m, masks, null);
  const out = [];
  for (let r = 0; r < m.rows; r++) if (ok(r)) out.push(makeRow(m, c, r));
  return out;
}

function getDataSync(iso3, filter) {
  const st = state;
  const m = loadMetaSync(st);
  const iso = checkIso(m, iso3);
  const masks = compile(m, filter);
  const c = loadCountrySync(st, m, iso);
  const ok = matcher(m, masks, null);
  const out = [];
  for (let r = 0; r < m.rows; r++) if (ok(r)) out.push(makeRow(m, c, r));
  return out;
}

async function get(iso3, key) {
  const st = state;
  const m = await loadMeta(st);
  const iso = checkIso(m, iso3);
  const { id } = resolveKey(m, key);
  if (id === null) return null;
  const c = await loadCountry(st, m, iso);
  const r = m.lookup[id];
  return r < 0 ? null : makeRow(m, c, r);
}

function getSync(iso3, key) {
  const st = state;
  const m = loadMetaSync(st);
  const iso = checkIso(m, iso3);
  const { id } = resolveKey(m, key);
  if (id === null) return null;
  const c = loadCountrySync(st, m, iso);
  const r = m.lookup[id];
  return r < 0 ? null : makeRow(m, c, r);
}

function resolveKey(m, key) {
  if (!key || typeof key !== 'object' || Array.isArray(key)) throw bad('key must be an object');
  for (const k of Object.keys(key)) {
    if (FIELDS.indexOf(k) < 0) throw bad(`Unknown field "${k}"`, { field: k, valid: FIELDS.slice() });
  }
  for (const f of KEY5) if (key[f] === undefined) throw bad(`${f} is required`, { field: f });
  const part = (f) => (key[f] === undefined ? null : normNum(f, key[f]));
  const dcode = m.discIndex.get(`${part('dr')}|${part('prtp')}|${part('eta')}`);
  if (dcode === undefined) return { id: null };
  let id = dcode * m.mult.discount;
  for (const f of KEY5) id += keyCode(m, f, key[f]) * m.mult[COL_OF[f]];
  return { id };
}

async function prefetch(iso3) {
  const st = state;
  const m = await loadMeta(st);
  const list = Array.isArray(iso3) ? iso3 : [iso3];
  await Promise.all(list.map((i) => loadCountry(st, m, checkIso(m, i))));
}

function prefetchSync(iso3) {
  const st = state;
  const m = loadMetaSync(st);
  const list = Array.isArray(iso3) ? iso3 : [iso3];
  for (const i of list) loadCountrySync(st, m, checkIso(m, i));
}

function configure(opts) {
  if (opts !== undefined) {
    if (!opts || typeof opts !== 'object') throw bad('configure() takes an object');
    const known = ['dataDir', 'baseUrl', 'timeoutMs', 'retries', 'maxCached', 'fetch'];
    for (const k of Object.keys(opts)) if (known.indexOf(k) < 0) throw bad(`Unknown option "${k}"`, { valid: known });
    if ('dataDir' in opts && (typeof opts.dataDir !== 'string' || !opts.dataDir)) throw bad('dataDir must be a non-empty string');
    if ('baseUrl' in opts && (typeof opts.baseUrl !== 'string' || !opts.baseUrl)) throw bad('baseUrl must be a non-empty string');
    if ('timeoutMs' in opts && !(opts.timeoutMs >= 0)) throw bad('timeoutMs must be a number >= 0 (0 disables the timeout)');
    if ('retries' in opts && !(Number.isInteger(opts.retries) && opts.retries >= 0 && opts.retries <= 5)) throw bad('retries must be an integer from 0 to 5');
    if ('maxCached' in opts && !(opts.maxCached === Infinity || (Number.isInteger(opts.maxCached) && opts.maxCached >= 1))) throw bad('maxCached must be an integer >= 1 or Infinity');
    if ('fetch' in opts && opts.fetch !== null && typeof opts.fetch !== 'function') throw bad('fetch must be a function or null');
    for (const k of ['timeoutMs', 'retries', 'maxCached', 'fetch']) if (k in opts) cfg[k] = opts[k];
    let reset = false;
    if ('baseUrl' in opts) {
      const nb = withSlash(opts.baseUrl);
      if (nb !== cfg.baseUrl) {
        cfg.baseUrl = nb;
        cfg.dataDir = null;
        reset = true;
      }
    }
    if ('dataDir' in opts) {
      if (opts.dataDir !== cfg.dataDir) {
        cfg.dataDir = opts.dataDir;
        cfg.baseUrl = null;
        reset = true;
      }
    }
    if (reset) state = newState();
    trim(state);
  }
  return {
    dataDir: cfg.dataDir || findDefaultDataDir(),
    baseUrl: cfg.baseUrl,
    timeoutMs: cfg.timeoutMs,
    retries: cfg.retries,
    maxCached: cfg.maxCached,
  };
}

function clearCache() {
  state = newState();
}

const api = {
  version: LIB_VERSION,
  ready,
  readySync,
  countries,
  countriesSync,
  options,
  optionsSync,
  getData,
  getDataSync,
  get,
  getSync,
  prefetch,
  prefetchSync,
  configure,
  clearCache,
  DataApiError,
  ERROR_CODES,
};

api.default = api;
Object.freeze(api);
module.exports = api;
