import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStates } from '@/lib/catalog';
import { formatNumber } from '@/lib/format';
import { getDictionary, isLocale, type Locale } from '@/lib/i18n';
import { alternates } from '@/lib/seo/metadata';
import { JsonLd, breadcrumbs } from '@/lib/seo/jsonld';
import { Breadcrumbs } from '@/components/Breadcrumbs';

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
    title: d.nav.states,
    description: d.site.description,
    alternates: alternates(locale, '/states'),
  };
}

export default async function StatesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const d = getDictionary(locale);
  const states = getStates();

  const crumbs = [
    { name: d.nav.home, path: `/${locale}` },
    { name: d.nav.states, path: `/${locale}/states` },
  ];

  return (
    <>
      <JsonLd data={breadcrumbs(crumbs)} />
      <div className="mx-auto max-w-4xl px-4 py-6">
        <Breadcrumbs items={crumbs} />
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{d.nav.states}</h1>

        <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
          {states.map((state) => {
            const markets = state.districts.reduce((n, dist) => n + dist.markets.length, 0);
            return (
              <li key={state.slug}>
                <Link
                  href={`/${locale}/state/${state.slug}`}
                  className="card card-link flex items-center gap-3 p-4"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{state.name}</span>
                    <span className="tabular block text-sm" style={{ color: 'var(--text-muted)' }}>
                      {formatNumber(markets)} {d.common.mandis} · {formatNumber(state.districts.length)}{' '}
                      {d.state.districts}
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
      </div>
    </>
  );
}
