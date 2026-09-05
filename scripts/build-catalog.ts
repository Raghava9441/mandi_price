/**
 * Generates `src/data/catalog.json` - the list of every state, district, market and
 * commodity in the dataset, with stable URL slugs.
 *
 * Also writes a timestamped NDJSON snapshot. That snapshot is the whole reason to run
 * this on a schedule rather than once: the upstream resource only ever exposes "now" and
 * silently ignores `filters[arrival_date]`, so yesterday's prices are unrecoverable the
 * moment they roll off. Archiving from day one is what makes the phase-3 trend features
 * launch with real history instead of an empty chart.
 *
 *   npm run catalog
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crawlAll, loadEnvLocal } from './crawl';
import { displayName, uniqueSlug } from '../src/lib/slug';
import type { Catalog, CatalogDistrict, CatalogMarket, CatalogState } from '../src/lib/catalog';
import { writeSnapshot } from './snapshot-writer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  await loadEnvLocal();
  const started = Date.now();
  /*
   * MANDI_STATES="Andhra Pradesh,Telangana" builds a partial catalog quickly - useful for
   * local development and when the shared demo key is rate-limited. An environment
   * variable rather than a CLI flag because npm re-splits argv on spaces, which mangles
   * multi-word state names like "Tamil Nadu".
   */
  const stateFilter = process.env.MANDI_STATES?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (stateFilter?.length) {
    console.log(`partial build, states: ${stateFilter.join(', ')}`);
  }

  const result = await crawlAll({
    onProgress: (m) => console.log(m),
    states: stateFilter?.length ? stateFilter : undefined,
  });
  const { records, nationalTotal, sourceUpdatedAt, stateTotals, shortfall, incomplete } = result;

  console.log(`\ncrawled ${records.length} unique records in ${Math.round((Date.now() - started) / 1000)}s`);

  // --- Aggregate -----------------------------------------------------------------
  interface StateAcc {
    api: string;
    districts: Map<string, { api: string; markets: Map<string, string> }>;
    commodities: Set<string>;
    count: number;
  }
  const states = new Map<string, StateAcc>();
  const commodityCounts = new Map<string, number>();

  for (const r of records) {
    let state = states.get(r.state);
    if (!state) {
      state = { api: r.state, districts: new Map(), commodities: new Set(), count: 0 };
      states.set(r.state, state);
    }
    state.count++;
    state.commodities.add(r.commodity);

    const districtKey = r.district || 'Unknown';
    let district = state.districts.get(districtKey);
    if (!district) {
      district = { api: districtKey, markets: new Map() };
      state.districts.set(districtKey, district);
    }
    district.markets.set(r.market, r.market);

    commodityCounts.set(r.commodity, (commodityCounts.get(r.commodity) ?? 0) + 1);
  }

  // --- Slugs ---------------------------------------------------------------------
  const commoditySlugs = new Map<string, string>();
  const takenCommodity = new Set<string>();
  const commodities = [...commodityCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([api, recordCount]) => {
      const slug = uniqueSlug(api, takenCommodity);
      commoditySlugs.set(api, slug);
      return { slug, api, name: displayName(api), recordCount };
    });

  const takenState = new Set<string>();
  const catalogStates: CatalogState[] = [...states.values()]
    .sort((a, b) => b.count - a.count || a.api.localeCompare(b.api))
    .map((state) => {
      const stateSlug = uniqueSlug(displayName(state.api), takenState);
      // Slugs are unique within a state, since the URL is /{state}/{market}.
      const takenDistrict = new Set<string>();
      const takenMarket = new Set<string>();

      const districts: CatalogDistrict[] = [...state.districts.values()]
        .sort((a, b) => a.api.localeCompare(b.api))
        .map((district) => {
          const districtSlug = uniqueSlug(displayName(district.api), takenDistrict);
          const markets: CatalogMarket[] = [...district.markets.keys()]
            .sort((a, b) => a.localeCompare(b))
            .map((marketApi) => ({
              slug: uniqueSlug(displayName(marketApi), takenMarket),
              api: marketApi,
              name: displayName(marketApi),
              districtSlug,
            }));
          return {
            slug: districtSlug,
            api: district.api,
            name: displayName(district.api),
            markets,
          };
        });

      return {
        slug: stateSlug,
        api: state.api,
        name: displayName(state.api),
        districts,
        commoditySlugs: [...state.commodities]
          .map((c) => commoditySlugs.get(c))
          .filter((s): s is string => Boolean(s))
          .sort(),
        recordCount: state.count,
      };
    });

  const catalog: Catalog = {
    generatedAt: new Date().toISOString(),
    sourceUpdatedAt,
    states: catalogStates,
    commodities,
  };

  const outPath = join(root, 'src', 'data', 'catalog.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

  const snapshotPath = await writeSnapshot(records, sourceUpdatedAt, root);

  // --- Report --------------------------------------------------------------------
  const marketCount = catalogStates.reduce(
    (n, s) => n + s.districts.reduce((m, d) => m + d.markets.length, 0),
    0,
  );
  const districtCount = catalogStates.reduce((n, s) => n + s.districts.length, 0);
  const oversized = [...stateTotals.entries()].filter(([, t]) => t > 10_000);

  console.log('\n--- catalog ---');
  console.log(`states      ${catalogStates.length}`);
  console.log(`districts   ${districtCount}`);
  console.log(`markets     ${marketCount}`);
  console.log(`commodities ${commodities.length}`);
  console.log(`records     ${records.length} (upstream reported ${nationalTotal})`);
  console.log(`written     ${outPath}`);
  console.log(`snapshot    ${snapshotPath}`);

  // A deliberate partial build is short by definition; only warn on a full run.
  if (shortfall > 0 && !stateFilter?.length) {
    console.warn(
      `\nWARNING: ${shortfall} records are in states the crawl never identified. ` +
        'Some pages will be missing. Re-run; if it persists, the discovery scan needs work.',
    );
  }
  if (incomplete.length > 0) {
    console.warn(
      `\nWARNING: ${incomplete.length} state shard(s) came back short (usually a rate ` +
        'limit). The catalog is still usable, but re-run with your own DATA_GOV_API_KEY ' +
        `for full coverage:\n  ${incomplete
          .map((i) => `${i.state}: ${i.got}/${i.expected}`)
          .join('\n  ')}`,
    );
  }
  if (oversized.length > 0) {
    console.warn(
      `\nWARNING: these state shards exceed the 10,000 result window and are being ` +
        `truncated - shard them by district too:\n  ${oversized
          .map(([s, t]) => `${s} (${t})`)
          .join('\n  ')}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
