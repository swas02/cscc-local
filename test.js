/**
 * test.js - Comprehensive validation suite for cscc-local
 * Verifies local filesystem reads, sync and async methods, zero-network isolation, and performance.
 */
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

console.log('='.repeat(70));
console.log('cscc-local: Node / Bun Local Execution Test Suite');
console.log('='.repeat(70));

// Disallow any network fetch to strictly guarantee zero network calls
globalThis.fetch = () => {
  throw new Error('NETWORK CALL DETECTED: cscc-local must run 100% locally without network!');
};

// Test 1: Require local module with zero config
console.log('\n[1/7] Loading module from "." (zero config)...');
const cscc = require('.');
assert.ok(cscc.version, 'Module must export version');
console.log(`  ✓ Loaded cscc-local v${cscc.version}`);

async function run() {
  // Test 2: ready() & readySync()
  console.log('\n[2/7] Testing ready() & readySync()...');
  const t0 = performance.now();
  const metaAsync = await cscc.ready();
  const tAsync = performance.now() - t0;

  const t1 = performance.now();
  const metaSync = cscc.readySync();
  const tSync = performance.now() - t1;

  assert.equal(metaAsync.countries, 170, 'Must have 170 countries');
  assert.equal(metaAsync.rows, 1458, 'Must have 1458 rows per country');
  assert.deepEqual(metaAsync, metaSync, 'ready() and readySync() must return identical metadata');
  console.log(`  ✓ Metadata loaded (${metaAsync.countries} countries, ${metaAsync.rows} scenarios/country)`);
  console.log(`    Async: ${tAsync.toFixed(2)} ms | Sync: ${tSync.toFixed(2)} ms`);

  // Test 3: countries() & countriesSync()
  console.log('\n[3/7] Testing countries() & countriesSync()...');
  const listAsync = await cscc.countries();
  const listSync = cscc.countriesSync();
  assert.equal(listAsync.length, 170);
  assert.deepEqual(listAsync, listSync);
  assert.ok(listAsync.includes('IND') && listAsync.includes('USA') && listAsync.includes('CHN'));
  console.log(`  ✓ Verified all 170 ISO3 codes (e.g. ${listAsync.slice(0, 5).join(', ')}...)`);

  // Test 4: options() & optionsSync()
  console.log('\n[4/7] Testing options() & optionsSync()...');
  const opt = cscc.optionsSync({ ssp: 2 });
  assert.ok(Array.isArray(opt.run) && opt.run.length > 0);
  assert.ok(Array.isArray(opt.rcp) && opt.rcp.length > 0);
  assert.ok(opt.dr.includes(3) && opt.dr.includes(5));
  console.log(`  ✓ Options computed dynamically (Runs: ${opt.run.length}, RCPs: ${opt.rcp.length}, DRs: ${opt.dr.join(', ')})`);

  // Test 5: getData() & getDataSync()
  console.log('\n[5/7] Testing getData() & getDataSync()...');
  const filter = { ssp: 2, rcp: 4.5, dr: 3 };
  
  const g0 = performance.now();
  const rowsAsync = await cscc.getData('IND', filter);
  const gAsyncTime = performance.now() - g0;

  const g1 = performance.now();
  const rowsSync = cscc.getDataSync('IND', filter);
  const gSyncTime = performance.now() - g1;

  assert.ok(rowsAsync.length > 0, 'Must return rows');
  assert.deepEqual(rowsAsync, rowsSync, 'Async and sync must return identical data rows');
  
  const sample = rowsAsync[0];
  assert.equal(sample.ssp, 'SSP2');
  assert.equal(sample.rcp, 'rcp45');
  assert.equal(sample.dr, 3);
  assert.equal(typeof sample.p50, 'number');
  assert.ok(sample.p16_7 <= sample.p50 && sample.p50 <= sample.p83_3, 'Percentiles must be ordered (p16.7 <= p50 <= p83.3)');
  console.log(`  ✓ Retrieved ${rowsAsync.length} scenarios for IND:`);
  console.log(`    Sample: [${sample.run}] p50 = $${sample.p50} / tCO2 (range: $${sample.p16_7} - $${sample.p83_3}, N = ${sample.n})`);
  console.log(`    Initial Read+Decode: ${gAsyncTime.toFixed(2)} ms | Cached Sync: ${gSyncTime.toFixed(3)} ms`);

  // Test 6: get() & getSync() (Exact scenario lookup)
  console.log('\n[6/7] Testing exact get() & getSync()...');
  const exactKey = {
    run: 'bhm_sr',
    dmgfuncpar: 'bootstrap',
    climate: 'expected',
    ssp: 2,
    rcp: 4.5,
    dr: 3,
  };
  const exactAsync = await cscc.get('USA', exactKey);
  const exactSync = cscc.getSync('USA', exactKey);
  assert.ok(exactAsync !== null);
  assert.deepEqual(exactAsync, exactSync);
  assert.equal(exactAsync.run, 'bhm_sr');
  assert.equal(exactAsync.ssp, 'SSP2');
  assert.equal(exactAsync.rcp, 'rcp45');
  console.log(`  ✓ Exact scenario lookup for USA: median $${exactAsync.p50} / tCO2`);

  // Test 7: Throughput benchmark
  console.log('\n[7/7] Performance & throughput smoke test...');
  const iters = 5000;
  const b0 = performance.now();
  for (let i = 0; i < iters; i++) {
    cscc.getSync('USA', exactKey);
  }
  const bTime = performance.now() - b0;
  const opsPerSec = Math.round((iters / bTime) * 1000);
  console.log(`  ✓ Executed ${iters.toLocaleString()} getSync() lookups in ${bTime.toFixed(1)} ms (${opsPerSec.toLocaleString()} ops/sec)`);

  console.log('\n' + '='.repeat(70));
  console.log('✓ ALL TESTS PASSED SUCCESSFULLY (100% Local, Zero Network Calls)');
  console.log('='.repeat(70));
}

run().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
