/**
 * example.js
 * 
 * Complete API demonstration for cscc-local.
 * Covers every method, parameter, and feature in both Async and Sync modes.
 *
 * RUN THIS EXAMPLE:
 *   node example.js
 */
'use strict';

const cscc = require('.');

async function main() {
  console.log('='.repeat(75));
  console.log('  cscc-local: Comprehensive API Guide & Live Demonstration');
  console.log('='.repeat(75));

  // =========================================================================
  // 1. ready() & readySync()
  // =========================================================================
  // Initializes schema metadata and shared dictionaries.
  // Both async and sync versions return the same release info.
  console.log('\n--- [1] cscc.ready() & cscc.readySync() ---');
  
  const metaAsync = await cscc.ready();
  const metaSync = cscc.readySync();
  
  console.log('Dataset Info:');
  console.log(`  • Format Version : ${metaAsync.formatVersion}`);
  console.log(`  • Data Version   : ${metaAsync.dataVersion}`);
  console.log(`  • Total Countries: ${metaAsync.countries} ISO3 codes`);
  console.log(`  • Scenarios/Ctry : ${metaAsync.rows.toLocaleString()} combinations`);
  console.log(`  • Schema Hash    : ${metaAsync.schemaHash.slice(0, 16)}...`);

  // =========================================================================
  // 2. countries() & countriesSync()
  // =========================================================================
  // Returns a sorted array of all 170 available ISO-3166-1 alpha-3 country codes.
  console.log('\n--- [2] cscc.countries() & cscc.countriesSync() ---');

  const countryList = cscc.countriesSync(); // or await cscc.countries()
  console.log(`Total available countries: ${countryList.length}`);
  console.log(`Sample codes: ${countryList.slice(0, 10).join(', ')} ... ${countryList.slice(-5).join(', ')}`);

  // =========================================================================
  // 3. options(filter?) & optionsSync(filter?)
  // =========================================================================
  // Returns available scenario dimensions.
  // If an active filter is supplied, it dynamically computes the remaining valid choices.
  console.log('\n--- [3] cscc.options() & cscc.optionsSync() ---');

  // A. All globally available options:
  const allOptions = cscc.optionsSync();
  console.log('Available Damage Models (run):', allOptions.run);
  console.log('Available Climate Uncertainty:', allOptions.climate);
  console.log('Available SSP Scenarios       :', allOptions.ssp);
  console.log('Available RCP Forcing Levels  :', allOptions.rcp);
  console.log('Available Constant Discount % :', allOptions.dr.filter((d) => d !== null));

  // B. Filter-aware options (e.g. What choices exist if we restrict to SSP2?):
  const narrowedOptions = cscc.optionsSync({ ssp: 2 });
  console.log('Options available under SSP2 : RCPs =', narrowedOptions.rcp);

  // =========================================================================
  // 4. getData(iso3, filter?) [Async]
  // =========================================================================
  // Decodes the country's binary file from disk and returns matching rows.
  // Supports single values, arrays (OR), numbers or string spellings (e.g. 2 or 'SSP2', 4.5 or 'rcp45').
  console.log('\n--- [4] cscc.getData(iso3, filter) [Async] ---');

  const indRows = await cscc.getData('IND', {
    ssp: 2,          // Accepts 2 or 'SSP2'
    rcp: [4.5, 6.0], // Arrays match ANY of the values (OR logic)
    dr: 3,           // 3% constant discount rate
  });

  console.log(`Retrieved ${indRows.length} scenarios for India (IND):`);
  console.log('First result row:');
  console.log(indRows[0]);
  /*
   * Row Schema Explanation:
   *  - run       : Economic damage specification (e.g. 'bhm_lr', 'bhm_sr', 'djo_richpoor')
   *  - dmgfuncpar: Damage function parameterization ('bootstrap' or 'estimates')
   *  - climate   : Climate model uncertainty ('expected' or 'uncertain')
   *  - ssp       : Shared Socioeconomic Pathway ('SSP1'..'SSP5')
   *  - rcp       : Representative Concentration Pathway ('rcp45', 'rcp60', 'rcp85')
   *  - dr        : Constant discount rate % (e.g. 3, 5), or null for Ramsey discounting
   *  - prtp      : Pure rate of time preference (Ramsey discounting), or null
   *  - eta       : Elasticity of marginal utility (Ramsey discounting), or null
   *  - p16_7     : 16.7th percentile country-level social cost of carbon ($/tCO2)
   *  - p50       : 50.0th percentile (median) CSCC ($/tCO2)
   *  - p83_3     : 83.3th percentile CSCC ($/tCO2)
   *  - n         : Sample size of Monte Carlo simulation runs
   */

  // =========================================================================
  // 5. getDataSync(iso3, filter?) [Synchronous]
  // =========================================================================
  // Synchronous version of getData. Ideal for calculation pipelines and tight loops
  // where using 'await' introduces unnecessary Promise overhead.
  console.log('\n--- [5] cscc.getDataSync(iso3, filter) [Synchronous] ---');

  const usaRowsSync = cscc.getDataSync('USA', {
    run: 'bhm_sr',
    ssp: 2,
    rcp: 4.5,
    dr: 3,
  });

  console.log(`Retrieved ${usaRowsSync.length} rows for USA synchronously (no await).`);
  usaRowsSync.forEach((r) => {
    const p16 = r.p16_7 !== null ? `$${r.p16_7.toFixed(2)}` : 'N/A';
    const p83 = r.p83_3 !== null ? `$${r.p83_3.toFixed(2)}` : 'N/A';
    console.log(`  • [${r.dmgfuncpar}, ${r.climate}]: median = $${r.p50.toFixed(2)}/tCO2 (range: ${p16} - ${p83})`);
  });

  // =========================================================================
  // 6. get(iso3, key) & getSync(iso3, key)
  // =========================================================================
  // Pinpoints EXACTLY ONE scenario combination.
  // Requires: run, dmgfuncpar, climate, ssp, rcp, and EITHER dr OR (prtp and eta).
  // Returns single CsccRow object or null if scenario doesn't exist.
  console.log('\n--- [6] cscc.get() & cscc.getSync() [Exact Point Lookup] ---');

  // A. Constant discount rate query:
  const pointConstant = cscc.getSync('USA', {
    run: 'bhm_sr',
    dmgfuncpar: 'bootstrap',
    climate: 'expected',
    ssp: 2,
    rcp: 4.5,
    dr: 3,
  });
  console.log('Constant Discount Query (USA, DR 3%):');
  console.log(`  Median: $${pointConstant.p50.toFixed(2)} / tCO2 (N = ${pointConstant.n})`);

  // B. Ramsey discounting query (prtp + eta instead of dr):
  const pointRamsey = await cscc.get('USA', {
    run: 'bhm_sr',
    dmgfuncpar: 'bootstrap',
    climate: 'expected',
    ssp: 2,
    rcp: 4.5,
    prtp: 1,  // Pure rate of time preference = 1%
    eta: 0.7, // Elasticity of marginal utility = 0.7
  });
  console.log('Ramsey Discount Query (USA, PRTP 1%, ETA 0.7):');
  console.log(`  Median: $${pointRamsey.p50.toFixed(2)} / tCO2 (dr is ${pointRamsey.dr})`);

  // =========================================================================
  // 7. prefetch(iso3) & prefetchSync(iso3)
  // =========================================================================
  // Pre-loads one or more countries into memory cache so subsequent queries
  // resolve instantly from RAM without reading from disk.
  console.log('\n--- [7] cscc.prefetch() & cscc.prefetchSync() ---');

  // Pre-load single or multiple countries
  cscc.prefetchSync(['CHN', 'DEU', 'GBR']);
  console.log('Prefetched CHN, DEU, GBR into memory cache.');

  // Subsequent queries are instant memory hits:
  const tStart = performance.now();
  const chnData = cscc.getDataSync('CHN', { ssp: 2, rcp: 4.5 });
  const tDuration = performance.now() - tStart;
  console.log(`Queried prefetched CHN (${chnData.length} rows) in ${tDuration.toFixed(3)} ms!`);

  // =========================================================================
  // 8. configure(options) & clearCache()
  // =========================================================================
  // Configures client settings or resets in-memory cache.
  console.log('\n--- [8] cscc.configure() & cscc.clearCache() ---');

  // Inspect current config:
  const currentConfig = cscc.configure();
  console.log('Active Configuration:');
  console.log(`  • dataDir   : ${currentConfig.dataDir}`);
  console.log(`  • maxCached : ${currentConfig.maxCached}`);

  // You can set maxCached (LRU cache size limit, default Infinity):
  cscc.configure({ maxCached: 50 });

  // Clear memory cache whenever needed:
  cscc.clearCache();
  console.log('Memory cache cleared successfully.');

  // =========================================================================
  // 9. Error Handling with DataApiError & ERROR_CODES
  // =========================================================================
  // All errors thrown by cscc-local are typed DataApiError instances.
  console.log('\n--- [9] Error Handling ---');

  try {
    // Attempt to query an invalid ISO code
    cscc.getDataSync('INVALID_CODE');
  } catch (err) {
    if (err instanceof cscc.DataApiError) {
      console.log(`Caught typed error: [${err.code}] ${err.message}`);
      console.log('Error details:', err.details);
    }
  }

  try {
    // Attempt an invalid filter field
    cscc.getDataSync('USA', { invalid_field: 123 });
  } catch (err) {
    if (err instanceof cscc.DataApiError) {
      console.log(`Caught validation error: [${err.code}] ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(75));
  console.log('  Demonstration Completed Successfully!');
  console.log('='.repeat(75));
}

main().catch(console.error);
