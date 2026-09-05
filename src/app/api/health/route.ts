import { NextResponse } from 'next/server';
import { ApiSource } from '@/lib/mandi/api-source';
import { ConfigError } from '@/lib/mandi/source';
import { catalogMeta, getStates } from '@/lib/catalog';

/**
 * Deployment diagnostics.
 *
 * "Prices could not be loaded" has several very different causes - a missing API key, a
 * key pasted with stray quotes, an upstream outage, a rate limit, or the host being
 * blocked - and they are indistinguishable from the rendered page. This endpoint makes
 * one real upstream call and reports exactly what came back.
 *
 * It deliberately reveals no secrets: whether a key is present and how long it is (which
 * is what catches a trailing newline or wrapping quotes), never the key itself.
 * `robots.txt` disallows /api/.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const raw = process.env.DATA_GOV_API_KEY ?? '';
  const trimmed = raw.trim().replace(/^['"]+|['"]+$/g, '');

  const diagnostics: Record<string, unknown> = {
    source: process.env.MANDI_SOURCE === 'snapshot' ? 'snapshot' : 'data.gov.in',
    // Set on a deployment host, `snapshot` cannot work: those files are gitignored.
    snapshotModeMisconfigured: process.env.MANDI_SOURCE === 'snapshot' && !!process.env.VERCEL,
    apiKey: {
      present: trimmed.length > 0,
      length: trimmed.length,
      // A mismatch means the value has surrounding whitespace or quotes, which upstream
      // rejects with a 403 that looks exactly like an outage.
      hadSurroundingJunk: raw.length !== trimmed.length,
    },
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
    catalog: {
      states: getStates().length,
      ...catalogMeta(),
    },
  };

  const started = Date.now();
  try {
    const source = new ApiSource();
    const page = await source.getPrices({ state: 'Andhra Pradesh', commodity: 'Tomato', limit: 5 });
    diagnostics.upstream = {
      ok: true,
      ms: Date.now() - started,
      records: page.records.length,
      total: page.total,
      updatedAt: page.updatedAt,
    };
  } catch (error) {
    diagnostics.upstream = {
      ok: false,
      ms: Date.now() - started,
      kind: error instanceof ConfigError ? 'configuration' : 'upstream',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const healthy = (diagnostics.upstream as { ok: boolean }).ok;
  return NextResponse.json(diagnostics, {
    status: healthy ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}
