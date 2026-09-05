# Mandi Rates

Daily APMC mandi prices for every commodity and market in India, from the Government of
India's Agmarknet feed on [data.gov.in][resource]. Built for farmers deciding **where to
sell today**, not for browsing a dataset.

Next.js 16 (App Router, React 19) · TypeScript strict · Tailwind v4 · English + Telugu.

---

## What the upstream API can and cannot do

This drove nearly every design decision, and none of it is in the official documentation.
All of it was measured against the live API and is pinned by the tests in `tests/live/`.

| Behaviour | Consequence for this app |
|---|---|
| **Plain `filters[x]` is fuzzy, not exact.** `filters[market]=Kuppam APMC` returns **3,911** rows (every market containing the token "APMC"); `filters[market.keyword]=Kuppam APMC` returns **1**. `filters[state]=Andhra Pradesh` also matches Himachal/Madhya/Uttar Pradesh. | **Every filter must use `.keyword`.** Enforced by the `FILTERABLE` allow-list in `api-source.ts` and asserted in the tests. This is the easiest way to ship silently wrong prices. |
| **Unknown filter keys are ignored silently**, returning the full unfiltered set with HTTP 200. | A typo'd filter looks like success. Hence the allow-list rather than free-form keys. |
| **`sort[...]` is ignored.** | All sorting is ours (`lib/mandi/derive.ts`). |
| **`filters[arrival_date]` is ignored. There is no queryable history** — only "now" exists, and yesterday's prices are gone for good. | Trends are impossible from the API alone. `npm run snapshot` archives NDJSON so history accrues from day one. |
| **`offset + limit` is capped at 10,000** (Elasticsearch `max_result_window`), and the national dataset is ~11.6k rows. Exceeding it returns **HTTP 200 with a 500 error in the body**. | The full dataset cannot be paged flat. All crawling is sharded by `state.keyword`. HTTP status alone is never trusted — the body is checked. |
| **`limit` is capped at 100.** Asking for more silently drops the page to 10 rows. | Paging advances by the length actually returned, never by the limit requested. |
| **Refreshes roughly hourly.** | Page cache TTL is 30 minutes. |
| **State spellings are non-standard**: `Chattisgarh`, `Uttrakhand`, `Pondicherry`, and **`Keralam`** (not "Kerala" — that one alone is ~640 records a day). | The state list is discovered from the data and reconciled against the national total, never hardcoded. Display names are corrected in `lib/slug.ts`. |

[resource]: https://data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070

## Getting started

```bash
npm install
```

Add your data.gov.in API key to `.env.local` (register free at https://data.gov.in):

```
DATA_GOV_API_KEY=your_key_here
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Without a key the scripts fall back to the public demo key, which rate-limits hard enough
that a full crawl usually comes back with incomplete shards. The app itself will not start
without a key — `ApiSource` refuses to construct.

Build the catalog (states, districts, markets, commodities), then run the app:

```bash
npm run catalog
npm run dev
```

## Commands

```bash
npm run dev         # dev server
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm test            # unit tests (no network)
npm run test:live   # contract tests against the real API - needs a key
npm run catalog     # rebuild src/data/catalog.json + write a snapshot
npm run snapshot    # archive a price snapshot only (run this hourly)
```

## Deploying

Set these on the host (Vercel, or anywhere else):

| Variable | Value |
|---|---|
| `DATA_GOV_API_KEY` | **Required.** Your data.gov.in key. |
| `NEXT_PUBLIC_SITE_URL` | **Required.** The real origin, e.g. `https://mandi-price.vercel.app`. Canonicals, hreflang and sitemaps are wrong without it. |
| `MANDI_SOURCE` | **Do not set this in a hosted environment.** `snapshot` reads local gzipped files that are gitignored and therefore never exist on the host; the build fails with a missing `snapshots/` directory. It is a local development mode only. |
| `PRERENDER_PRICE_PAGES` | Optional, default `12`. |
| `PRERENDER_MANDI_PAGES` | Optional, default `0`. |

### Diagnosing "Prices could not be loaded right now"

That message has several very different causes which look identical on the page. Hit
`/api/health` on the deployment — it makes one real upstream call and reports what
happened, without revealing the key:

```bash
curl https://your-deployment.vercel.app/api/health
```

| What it shows | What it means |
|---|---|
| `upstream.kind: "configuration"` | `DATA_GOV_API_KEY` is not set on the host. |
| `apiKey.hadSurroundingJunk: true` | The key was pasted with quotes or a trailing newline. Upstream rejects that with a 403 that looks exactly like an outage. |
| `apiKey.length` ≠ 56 | The value is not a single valid key. |
| `snapshotModeMisconfigured: true` | `MANDI_SOURCE=snapshot` is set on the host; remove it. |
| `upstream.kind: "upstream"` with HTTP 429/403 | Genuine rate limiting from data.gov.in. |
| `upstream.ok: true` | The API is fine — any stale "unavailable" page is cached; redeploy to clear it. |

Note that after fixing an environment variable you should **redeploy**, not just wait.
Prerendered pages hold whatever they rendered at build time until the next revalidation.

**Why the prerender counts are so low.** Every prerendered price or mandi page costs one
upstream request during the build, and data.gov.in rate-limits hard — it returns 429 and
then 403 well before a few hundred requests. Prerendering the whole catalog does not just
make builds slow, it makes them *fail*. Everything not prerendered is still served:
`dynamicParams` plus `revalidate` render the long tail on first request and cache it from
there. Raise these only with a key that has headroom, and measure the build.

Upstream failures degrade rather than break: a page that cannot reach the API renders a
"prices could not be loaded" state and is replaced with real data on the next
revalidation, so a bad minute on a government API never fails a deploy. That state is
kept distinct from "no arrivals reported today" — conflating an outage with a quiet
market would tell the reader something false.

## Architecture

```
routes (RSC)  ->  lib/mandi/index.ts  ->  MandiSource  ->  ApiSource  ->  data.gov.in
                       (getSource)                        (phase 3: DbSource -> Postgres)
```

Pages never call `fetch` or touch upstream shapes. Everything goes through the
`MandiSource` interface, so replacing the API with a database is a one-file change.

- **`lib/mandi/api-source.ts`** — the only place that talks to data.gov.in. `.keyword`
  filters, Zod coercion, window guards, retry policy, dedupe.
- **`lib/mandi/derive.ts`** — sorting, ranking and summary stats the API refuses to do.
- **`lib/catalog.ts` + `src/data/catalog.json`** — generated; the API has no aggregation
  endpoint, so "which crops trade in Andhra Pradesh?" is otherwise unanswerable. Drives
  dropdowns, `generateStaticParams`, sitemaps and slug → filter-value resolution.
- **`lib/mandi/index.ts`** imports `server-only`. That is what keeps the API key out of the
  browser bundle — do not remove it.

### Snapshots

`npm run snapshot` writes `snapshots/<timestamp>.ndjson.gz` (~200 KB). Run it hourly.
This is the only way this project will ever have price history: the upstream feed forgets
yesterday, and no amount of later effort can backfill a day that was not captured.

## Design notes

Mobile-first, for cheap Android phones used outdoors.

- **The modal price is the headline**, never the maximum. Modal is where most of the
  volume actually traded; the maximum usually reflects a small lot of top grade and would
  set an expectation most sellers will not be paid.
- **Absence is stated, never zeroed.** A mandi that did not trade reads "no arrivals
  reported today" — showing ₹0 would suggest the crop is worthless.
- **Unit switch** between ₹/quintal, ₹/kg and ₹/50 kg bag. The feed is quintals; farmers
  often reckon in kg or bags, and a bare "2,450" is misreadable by a factor of 100.
- **One client island** (`PriceBoard`). Everything else is a Server Component, so the page
  works on a slow connection and the JS budget stays small.
- **Telugu is partial** and needs a native-speaker review before launch — the i18n layer
  falls back to English per key, so untranslated strings degrade rather than break.

## SEO

- URLs carry no date: the page *is* today and updates in place, accumulating authority
  instead of splitting it across daily URLs.
- ISR, with the top pages pre-built via `generateStaticParams` and the long tail rendered
  on demand.
- Every page ships **data-derived prose** and an FAQ, not just a table — bare templated
  tables get treated as thin doorway pages, which is how programmatic SEO sites get
  demoted wholesale.
- Structured data is `Dataset` + `ItemList` + `FAQPage` + `BreadcrumbList`. Deliberately
  **not** `Product`/`Offer`: a mandi quote is not a product this site sells, Google will
  not grant price rich-results for it, and faking Offers at this scale invites a spam
  action.
- Sitemaps are sharded one file per state (the 50k URL cap), with reciprocal hreflang.
- `?sort=` and `?unit=` are disallowed in `robots.txt` and canonicalised away.

## Roadmap

- **Phase 2** — complete Telugu, WhatsApp share, localStorage watchlist and offline
  last-known prices, national commodity pages, compare view.
- **Phase 3** — Postgres behind the same `MandiSource` interface; import the archived
  NDJSON; then price trends, "cheapest/dearest mandi this week", real search, and alerts.

## Data licence

Prices are published by the Directorate of Marketing & Inspection (Agmarknet) via
data.gov.in under the [Government Open Data License – India][licence]. They are shown as
received; verify with your mandi before trading.

[licence]: https://data.gov.in/government-open-data-license-india
