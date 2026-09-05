import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCommodities, getStates } from '@/lib/catalog';
import { formatNumber } from '@/lib/format';
import { getDictionary, isLocale, t, type Locale } from '@/lib/i18n';
import { alternates } from '@/lib/seo/metadata';
import { JsonLd, webSite } from '@/lib/seo/jsonld';

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDictionary(locale);
  return {
    title: `${d.site.name} — ${d.site.tagline}`,
    description: d.site.description,
    alternates: alternates(locale, '/'),
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const d = getDictionary(locale);

  const states = getStates();
  const commodities = getCommodities();
  const marketCount = states.reduce(
    (n, s) => n + s.districts.reduce((m, dist) => m + dist.markets.length, 0),
    0,
  );

  return (
    <>
      <JsonLd data={webSite(d.site.name, d.site.description)} />

      <section className="hero-mesh border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
          <h1 className="max-w-2xl text-[2.125rem] font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
            {d.home.heading}
          </h1>
          <p
            className="mt-4 max-w-xl text-base leading-relaxed sm:text-lg"
            style={{ color: 'var(--text-muted)' }}
          >
            {t(d.home.sub, { markets: formatNumber(marketCount) })}
          </p>

          {states.length > 0 && (
            <div className="mt-7 flex flex-wrap gap-2">
              {states.slice(0, 6).map((state) => (
                <Link
                  key={state.slug}
                  href={`/${locale}/state/${state.slug}`}
                  className="tap rounded-xl px-4 text-sm font-bold shadow-sm transition-transform active:scale-[0.98]"
                  style={{ backgroundColor: 'var(--brand)', color: 'white' }}
                >
                  {state.name}
                </Link>
              ))}
              <Link
                href={`/${locale}/states`}
                className="tap rounded-xl border px-4 text-sm font-bold"
                style={{ borderColor: 'var(--border-strong)' }}
              >
                {d.common.viewAll} →
              </Link>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 py-10">
        {states.length === 0 ? (
          <div className="card p-6">
            <p className="font-semibold">{d.home.noCatalog}</p>
          </div>
        ) : (
          <>
            <section>
              <h2 className="text-xl font-extrabold tracking-tight">{d.home.popularCrops}</h2>
              <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {commodities.slice(0, 12).map((commodity) => {
                  // Link into the biggest state that actually trades it, so the first
                  // click always lands on a page with prices rather than an empty one.
                  const state = states.find((s) => s.commoditySlugs.includes(commodity.slug));
                  if (!state) return null;
                  return (
                    <li key={commodity.slug}>
                      <Link
                        href={`/${locale}/prices/${state.slug}/${commodity.slug}`}
                        className="card card-link flex items-center gap-3 p-4"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold">{commodity.name}</span>
                          <span className="block truncate text-sm" style={{ color: 'var(--text-muted)' }}>
                            {state.name}
                          </span>
                        </span>
                        <span aria-hidden="true" style={{ color: 'var(--text-faint)' }}>
                          →
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="mt-12">
              <h2 className="text-xl font-extrabold tracking-tight">{d.home.browseStates}</h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {states.map((state) => (
                  <li key={state.slug}>
                    <Link
                      href={`/${locale}/state/${state.slug}`}
                      className="tap rounded-xl border px-3.5 text-sm font-semibold"
                      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-raised)' }}
                    >
                      {state.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </>
  );
}
