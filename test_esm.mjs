import assert from 'node:assert/strict';
import cscc, { getData, getSync, readySync, countries } from './src/index.mjs';

console.log('Testing ESM imports...');
const meta = readySync();
assert.equal(meta.countries, 170);

const list = await countries();
assert.equal(list.length, 170);

const rows = await getData('IND', { ssp: 2, rcp: 4.5, dr: 3 });
assert.ok(rows.length > 0);

const single = getSync('USA', {
  run: 'bhm_sr',
  dmgfuncpar: 'bootstrap',
  climate: 'expected',
  ssp: 2,
  rcp: 4.5,
  dr: 3,
});
assert.ok(single !== null);
assert.equal(single.run, 'bhm_sr');

console.log('✓ ESM imports test passed successfully!');
