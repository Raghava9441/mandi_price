/**
 * Archives one price snapshot without rebuilding the catalog.
 *
 * This is the job to run hourly (upstream refreshes about once an hour). Prices that
 * roll off the upstream "current" view cannot be recovered by any query, so every run
 * that does not happen is history permanently lost.
 *
 *   npm run snapshot
 */
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crawlAll, loadEnvLocal } from './crawl';
import { writeSnapshot } from './snapshot-writer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  await loadEnvLocal();
  const { records, sourceUpdatedAt, nationalTotal } = await crawlAll({
    onProgress: (m) => console.log(m),
  });
  const path = await writeSnapshot(records, sourceUpdatedAt, root);
  console.log(`\narchived ${records.length}/${nationalTotal} records -> ${path}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
