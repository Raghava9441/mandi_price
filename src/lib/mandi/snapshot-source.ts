import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import type { MandiSource } from './source';
import type { Facets, PricePage, PriceQuery, PriceRecord } from './types';
import { loadCatalog } from '../catalog';

/**
 * Serves prices from the archived NDJSON snapshots instead of the live API.
 *
 * Two jobs:
 *  1. Development and CI without burning API quota - the upstream rate-limits hard, and
 *     a hot-reload loop will exhaust a key in minutes.
 *  2. A working proof that the `MandiSource` seam is real. This implementation shares no
 *     code with `ApiSource`, yet every page renders unchanged against it, which is the
 *     same swap phase 3 makes when Postgres arrives.
 *
 * Enable with `MANDI_SOURCE=snapshot`.
 */
export class SnapshotSource implements MandiSource {
  readonly name = 'snapshot';
  private cache: { records: PriceRecord[]; file: string; updatedAt: string | null } | null = null;

  constructor(private readonly dir = join(process.cwd(), 'snapshots')) {}

  private async load() {
    if (this.cache) return this.cache;

    /*
     * Snapshots are gitignored, so this directory does not exist on a deployment host.
     * Setting MANDI_SOURCE=snapshot in a hosted environment is therefore always a
     * misconfiguration - and a bare ENOENT for "scandir /vercel/path0/snapshots" gives
     * no hint of that, so say it plainly.
     */
    let entries: string[];
    try {
      entries = await readdir(this.dir);
    } catch {
      throw new Error(
        `MANDI_SOURCE=snapshot is set, but there is no snapshots directory at ${this.dir}. ` +
          'Snapshots are local-only (gitignored), so this mode cannot work on a deployment ' +
          'host: unset MANDI_SOURCE there so the app uses the live API, or run ' +
          '`npm run snapshot` locally.',
      );
    }

    const files = entries
      .filter((f) => f.endsWith('.ndjson.gz'))
      .sort()
      .reverse();
    if (files.length === 0) {
      throw new Error(
        `No snapshots in ${this.dir}. Run \`npm run snapshot\` (or \`npm run catalog\`) first.`,
      );
    }

    const file = files[0];
    const records: PriceRecord[] = [];
    const stream = createReadStream(join(this.dir, file)).pipe(createGunzip());
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      records.push(JSON.parse(line) as PriceRecord);
    }

    // The filename is the upstream `updated` timestamp, so freshness stays honest -
    // the UI must not present archived prices as if they were just fetched.
    const stamp = file.replace('.ndjson.gz', '');
    const iso = stamp.replace(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})$/,
      '$1-$2-$3T$4:$5:$6Z',
    );
    const parsed = new Date(iso);

    this.cache = {
      records,
      file,
      updatedAt: Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(),
    };
    return this.cache;
  }

  async getPrices(query: PriceQuery): Promise<PricePage> {
    const { records, updatedAt } = await this.load();

    // Case-insensitive exact match, mirroring the upstream `.keyword` semantics rather
    // than the fuzzy behaviour of the bare fields.
    const eq = (a: string, b: string | undefined) =>
      b === undefined || b === '' || a.toLowerCase() === b.toLowerCase();

    const matched = records.filter(
      (r) =>
        eq(r.state, query.state) &&
        eq(r.district, query.district) &&
        eq(r.market, query.market) &&
        eq(r.commodity, query.commodity) &&
        eq(r.variety, query.variety) &&
        eq(r.grade, query.grade),
    );

    const limit = query.limit ?? matched.length;
    return {
      records: matched.slice(0, limit),
      total: matched.length,
      truncated: matched.length > limit,
      updatedAt,
      fetchedAt: new Date().toISOString(),
    };
  }

  async getFacets(): Promise<Facets> {
    return (await loadCatalog()).facets;
  }
}
