# cscc-local

High-performance, **zero-network, offline-first** Node.js and Bun module providing sub-millisecond access to the **Country-Level Social Cost of Carbon (CSCC)** dataset ([Ricke et al., 2018](https://doi.org/10.1038/s41558-018-0282-y)).

> [!IMPORTANT]
> **Data Ownership & Attribution Disclaimer**:
> The underlying CSCC dataset was created and published by **[country-level-scc](https://github.com/country-level-scc/)** (associated with [Ricke et al., 2018](https://doi.org/10.1038/s41558-018-0282-y)).
> **This repository provides an optimized local binary distribution and zero-dependency client module for JavaScript runtimes (Node.js & Bun).**

---

## Key Features

- **Clone and Use**: Works immediately upon cloning. No network calls, no HTTP server, no API keys, and no database setup required.
- **Ultra-Compact**: All 170 countries (247,860 scenarios) compiled into just **3.8 MB** of pre-built binary data (`data/*.bin`).
- **Blazing Fast**:
  - Initial load & decode: **~3 ms** per country.
  - In-memory lookups: **>290,000 queries / second**.
  - Synchronous helpers (`getDataSync`, `getSync`) for high-throughput calculation loops (e.g. Life-Cycle Cost Analysis / LCCA).
- **Dual CJS & ESM**: First-class support for both `require('.')` and `import { getData } from 'cscc-local'`.
- **Full TypeScript Definitions**: Rich autocompletion and type checking included (`index.d.ts`).
- **Zero Runtime Dependencies**: Uses native JavaScript `ArrayBuffer`, `DataView`, and standard runtime file APIs.

---

## Installation & Quickstart

### 1. Clone & Use

```bash
git clone https://github.com/swas02/cscc-local.git
cd cscc-local
```

### 2. CommonJS (Node.js)

```javascript
const cscc = require('.'); // or require('./path/to/cscc-local')

async function main() {
  // Query India (IND) for SSP2, RCP 4.5, Discount Rate = 3%
  const rows = await cscc.getData('IND', {
    ssp: 2,
    rcp: 4.5,
    dr: 3
  });

  console.log(`Found ${rows.length} scenarios for IND:`);
  console.log(rows[0]);
}

main();
```

### 3. ES Modules (Node.js 18+ or Bun)

```javascript
import cscc, { getData, getSync } from './src/index.mjs';

// Asynchronous query
const rows = await getData('USA', { ssp: 2, rcp: 4.5 });
console.log(`Retrieved ${rows.length} rows for USA`);

// Synchronous exact scenario lookup (Zero await required)
const point = getSync('USA', {
  run: 'bhm_sr',
  dmgfuncpar: 'bootstrap',
  climate: 'expected',
  ssp: 2,
  rcp: 4.5,
  dr: 3
});

console.log(`USA Median CSCC: $${point.p50} / tCO2 (16.7%-83.3%: $${point.p16_7} - $${point.p83_3})`);
```

### 4. Run the Complete API Demo

To see every single method executed live with rich explanations:
```bash
node example.js
# or
npm run example
```

---

## API Reference

### Asynchronous Methods

| Method | Description |
| :--- | :--- |
| `cscc.ready()` | Resolves when scenario dictionary and schema metadata are initialized. |
| `cscc.countries()` | Returns all 170 available ISO3 country codes (sorted alphabetically). |
| `cscc.options(filter?)` | Returns available dimension choices given an active filter. |
| `cscc.getData(iso3, filter?)` | Returns all matching scenario rows for a country. |
| `cscc.get(iso3, key)` | Returns the single exact scenario row matching `key`, or `null`. |
| `cscc.prefetch(iso3)` | Pre-loads one or more countries into memory cache. |

### Synchronous Methods (Node.js & Bun)

For computational models, Monte Carlo simulations, or LCCA calculation loops where `await` overhead is undesirable:

| Method | Description |
| :--- | :--- |
| `cscc.readySync()` | Initializes and returns metadata synchronously. |
| `cscc.countriesSync()` | Returns the 170 ISO3 codes synchronously. |
| `cscc.optionsSync(filter?)` | Computes valid options synchronously. |
| `cscc.getDataSync(iso3, filter?)` | Decodes binary and filters rows synchronously. |
| `cscc.getSync(iso3, key)` | Instant single-scenario lookup (<5 microseconds). |

---

## Result Row Schema

Each result object represents one climate-economic damage scenario:

```typescript
interface CsccRow {
  run: string;         // 'bhm_sr' | 'bhm_lr' | 'bhm_richpoor_sr' | 'bhm_richpoor_lr' | 'djo_richpoor'
  dmgfuncpar: string;  // 'bootstrap' | 'estimates'
  climate: string;     // 'expected' | 'uncertain'
  ssp: string;         // 'SSP1' | 'SSP2' | 'SSP3' | 'SSP4' | 'SSP5'
  rcp: string;         // 'rcp45' | 'rcp60' | 'rcp85'
  dr: number | null;   // Constant discount rate (e.g. 3, 5), or null for Ramsey
  prtp: number | null; // Pure rate of time preference (Ramsey discounting), or null
  eta: number | null;  // Elasticity of marginal utility (Ramsey discounting), or null
  p16_7: number | null;// 16.7th percentile CSCC ($/tCO2)
  p50: number | null;  // 50.0th percentile (median) CSCC ($/tCO2)
  p83_3: number | null;// 83.3th percentile CSCC ($/tCO2)
  n: number;           // Monte Carlo sample run count
}
```

---

## Rebuilding the Binary Data from CSV

If you modify or update the underlying `src/cscc_db_v2.csv`:

```bash
# Recompile CSV into the 170 binary files and meta.json
npm run build:data
```

This runs `build_cscc.py`, which performs complete round-trip integrity checks (1.24M assertions) verifying that all float32 percentiles and scenario keys match the source CSV with 100% fidelity.

---

## Running Tests

```bash
# Test with Node.js
npm test

# Or test with Bun
npm run test:bun
```

---

## License

MIT License. Attribution to Ricke et al. (2018) for original empirical research and dataset creation.
