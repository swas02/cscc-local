# Country-Level Social Cost of Carbon (CSCC) Local Node & Bun Client

[![CSV Data Census](https://img.shields.io/badge/data%20census-1.24M%20assertions-brightgreen.svg)](build_cscc.py)
[![Test Suite](https://img.shields.io/badge/tests-passed%20(Node%20%26%20Bun)-brightgreen.svg)](test.js)
[![Data Format](https://img.shields.io/badge/format-CSCC%20v1%20binary-blue.svg)](build_cscc.py)
[![Countries](https://img.shields.io/badge/countries-170%20ISO3-orange.svg)](meta.json)
[![Release Size](https://img.shields.io/badge/dataset%20size-3.8%20MB-success.svg)](data)
[![Runtime](https://img.shields.io/badge/runtime-Node.js%20(18%2B)%20%7C%20Bun-black.svg)](package.json)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> [!IMPORTANT]
> **Data Ownership & Attribution Disclaimer**:
> The original creators and owners of the underlying CSCC dataset are **[country-level-scc](https://github.com/country-level-scc/)** (associated with the publication [Ricke et al., 2018](https://doi.org/10.1038/s41558-018-0282-y)).
> **The maintainers of this repository are NOT the owners or authors of the CSV data.** This repository solely provides an optimized local binary distribution and zero-dependency client module for JavaScript runtimes (Node.js & Bun).

A high-performance, **zero-network, offline-first** Node.js and Bun module providing sub-millisecond access to the **Country-Level Social Cost of Carbon (CSCC)** dataset ([Ricke et al., 2018](https://doi.org/10.1038/s41558-018-0282-y)).

Instead of querying a remote database or parsing a heavy 27.5 MB CSV at runtime, this project compiles the entire dataset into **170 compact binary files** (one per ISO3 country, **~22.8 KB each**, 3.8 MB total). A unified metadata index enables instant filtering, caching, and lookups with **zero network requests** and **zero runtime dependencies**.

---

## Table of Contents

- [Key Features](#key-features)
- [Architecture & Binary Format](#architecture--binary-format)
  - [Binary Format Specification](#binary-format-specification)
  - [Key Dimension Mapping](#key-dimension-mapping)
- [Installation & Quickstart](#installation--quickstart)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. CommonJS (Node.js)](#2-commonjs-nodejs)
  - [3. ES Modules (Node.js 18+ or Bun)](#3-es-modules-nodejs-18-or-bun)
  - [4. Run the Live Interactive Demo](#4-run-the-live-interactive-demo)
- [Client API Reference](#client-api-reference)
  - [Asynchronous Methods](#asynchronous-methods)
  - [Synchronous Methods (High Throughput)](#synchronous-methods-high-throughput)
- [Data Model & Dimension Combinations](#data-model--dimension-combinations)
- [Result Row Schema](#result-row-schema)
- [Rebuilding Binary Data from CSV](#rebuilding-binary-data-from-csv)
- [Running the Test Suites](#running-the-test-suites)
- [Attribution & Citation](#attribution--citation)
- [License](#license)

---

## Key Features

- **Clone and Use**: Works immediately upon cloning. No network calls, no HTTP server, no API keys, and no database setup required.
- **Extreme Compression**: Compiles a 27.5 MB CSV (247,860 rows) into a **3.80 MB total dataset** across 170 countries.
- **Blazing Fast**:
  - Initial load & decode: **~3–5 ms** per country.
  - In-memory lookups: **>290,000 queries / second**.
  - Synchronous helpers (`getDataSync`, `getSync`) for high-throughput calculation loops (e.g. Life-Cycle Cost Analysis / LCCA).
- **Dual CJS & ESM Support**: First-class support for both `require('.')` and `import { getData } from 'cscc-local'`.
- **Full TypeScript Definitions**: Rich autocompletion and type checking included (`index.d.ts`).
- **Zero Runtime Dependencies**: Uses standard JavaScript `ArrayBuffer`, `DataView`, and native file APIs.
- **100% Data Fidelity**: All 247,860 rows and 170 countries verified round-trip against the original CSV.

---

## Architecture & Binary Format

### Binary Format Specification

Each country `.bin` file in `data/` is 23,344 bytes, formatted in little-endian binary layout:

| Offset | Type | Description |
| :--- | :--- | :--- |
| `0..3` | `char[4]` | Magic identifier: `"CSCC"` (`0x43534343`) |
| `4..5` | `uint16` | Format version: `1` |
| `6..7` | `uint16` | Reserved (`0x0000`) |
| `8..11` | `uint32` | Rows per country (`1458`) |
| `12..15`| `uint32` | Schema hash (first 4 bytes of SHA-256 schema hash) |
| `16..5847` | `float32[1458]` | **16.7% percentile** values (`NaN` represents missing / `NA`) |
| `5848..11679` | `float32[1458]` | **50.0% percentile** (median) values |
| `11680..17511`| `float32[1458]` | **83.3% percentile** values (`NaN` represents missing / `NA`) |
| `17512..23343`| `uint32[1458]`  | **N** (sample size / Monte Carlo runs) |

### Key Dimension Mapping

Because every country shares the exact same 1,458 scenario combinations in the exact same canonical order, scenario dimensions (`run`, `dmgfuncpar`, `climate`, `SSP`, `RCP`, `discount`) are stored only **once** inside `meta.json`.

---

## Installation & Quickstart

### 1. Clone the Repository

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

### 4. Run the Live Interactive Demo

To see every single method executed live with rich explanations:
```bash
node example.js
# or
npm run example
```

---

## Client API Reference

### Asynchronous Methods

| Method | Description |
| :--- | :--- |
| `cscc.ready()` | Resolves when scenario dictionary and schema metadata are initialized. |
| `cscc.countries()` | Returns all 170 available ISO3 country codes (sorted alphabetically). |
| `cscc.options(filter?)` | Returns available dimension choices given an active filter. |
| `cscc.getData(iso3, filter?)` | Returns all matching scenario rows for a country. |
| `cscc.get(iso3, key)` | Returns the single exact scenario row matching `key`, or `null`. |
| `cscc.prefetch(iso3)` | Pre-loads one or more countries into memory cache. |
| `cscc.configure(options?)` | Inspects or updates configuration (`dataDir`, `maxCached`, etc.). |
| `cscc.clearCache()` | Flushes all loaded country binaries from RAM. |

### Synchronous Methods (High Throughput)

For computational models, Monte Carlo simulations, or LCCA calculation loops where `await` overhead is undesirable:

| Method | Description |
| :--- | :--- |
| `cscc.readySync()` | Initializes and returns metadata synchronously. |
| `cscc.countriesSync()` | Returns the 170 ISO3 codes synchronously. |
| `cscc.optionsSync(filter?)` | Computes valid options synchronously. |
| `cscc.getDataSync(iso3, filter?)` | Decodes binary and filters rows synchronously. |
| `cscc.getSync(iso3, key)` | Instant single-scenario lookup (<5 microseconds). |
| `cscc.prefetchSync(iso3)` | Synchronously caches countries into memory. |

---

## Data Model & Dimension Combinations

Every country has data for **1,458 scenario combinations**, calculated from the Cartesian product of:

- **Damage Function (`run`)**: 5 models
  - `bhm_sr`: Burke, Hsiang, Miguel (short-run specification)
  - `bhm_lr`: Burke, Hsiang, Miguel (long-run specification)
  - `bhm_richpoor_sr`: BHM differentiating rich vs. poor countries (short-run)
  - `bhm_richpoor_lr`: BHM differentiating rich vs. poor countries (long-run)
  - `djo_richpoor`: Dell, Jones, Olken specification
- **Damage Parameterization (`dmgfuncpar`)**: 2 options
  - `bootstrap`: Empirical bootstrapping (captures parameter uncertainty)
  - `estimates`: Central point estimates
- **Climate Uncertainty (`climate`)**: 2 options
  - `expected`: Mean climate response
  - `uncertain`: Climate system uncertainty sampling
- **Socioeconomic Pathways (`ssp`)**: 5 options (`SSP1`, `SSP2`, `SSP3`, `SSP4`, `SSP5`)
- **Radiative Forcing (`rcp`)**: 3 options (`rcp45`, `rcp60`, `rcp85`)
- **Discounting Specifications**: 6 options
  - **Constant Discounting (`dr`)**: `3%` or `5%`
  - **Ramsey Endogenous Discounting (`prtp` & `eta`)**: 4 combinations
    - `prtp = 1%`, `eta = 0.7`
    - `prtp = 1%`, `eta = 1.5`
    - `prtp = 2%`, `eta = 0.7`
    - `prtp = 2%`, `eta = 1.5`

**Total Combinations**: `5 * 2 * 2 * 5 * 3 * (2 + 4) = 1,458 scenarios per country`.

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

## Rebuilding Binary Data from CSV

If you modify or update the underlying `src/cscc_db_v2.csv`:

```bash
# Recompile CSV into the 170 binary files and meta.json
npm run build:data
```

This runs `build_cscc.py`, which performs complete round-trip integrity checks (1.24M assertions) verifying that all float32 percentiles and scenario keys match the source CSV with 100% fidelity.

---

## Running the Test Suites

```bash
# Test with Node.js
npm test

# Or test with Bun
npm run test:bun
```

---

## Attribution & Citation

If you use this dataset or package in academic research, policy analysis, or engineering applications, please cite the foundational research paper:

> **Ricke, K., Drouet, L., Caldeira, K. et al.** Country-level social cost of carbon. *Nature Climate Change* 8, 895–900 (2018).  
> DOI: [10.1038/s41558-018-0282-y](https://doi.org/10.1038/s41558-018-0282-y)

```bibtex
@article{Ricke2018,
  author    = {Ricke, Katharine and Drouet, Laurent and Caldeira, Ken and Tavoni, Massimo},
  title     = {Country-level social cost of carbon},
  journal   = {Nature Climate Change},
  volume    = {8},
  number    = {10},
  pages     = {895--900},
  year      = {2018},
  publisher = {Nature Publishing Group},
  doi       = {10.1038/s41558-018-0282-y},
  url       = {https://doi.org/10.1038/s41558-018-0282-y}
}
```

---

## License

The code, parser tooling, and client libraries are licensed under the [MIT License](LICENSE).  
The underlying CSCC dataset and derivative files are governed by the terms in [DATA_NOTICE.md](DATA_NOTICE.md).  
Attribution is acknowledged to Ricke et al. (2018) for original empirical research and dataset creation.
