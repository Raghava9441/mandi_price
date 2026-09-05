import { createGzip } from 'node:zlib';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import type { PriceRecord } from '../src/lib/mandi/types';

/**
 * Append-only price history.
 *
 * The upstream resource is a live "current prices" view: it has no queryable history and
 * silently ignores date filters, so once a day rolls over those quotes are gone for good.
 * Nothing here can be backfilled later, which is why snapshots run from day one even
 * though the database itself is a phase-3 concern. One gzipped NDJSON file per run,
 * roughly 200 KB - cheap insurance against an irreplaceable loss.
 */
export async function writeSnapshot(
  records: PriceRecord[],
  sourceUpdatedAt: string | null,
  root: string,
): Promise<string> {
  const stamp = (sourceUpdatedAt ?? new Date().toISOString()).replace(/[:.]/g, '-').slice(0, 19);
  const dir = join(root, 'snapshots');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${stamp}.ndjson.gz`);

  const lines = records.map((r) => `${JSON.stringify(r)}\n`);
  await pipeline(Readable.from(lines), createGzip(), createWriteStream(path));
  return path;
}
