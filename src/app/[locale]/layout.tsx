import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Noto_Sans_Telugu } from 'next/font/google';
import { notFound } from 'next/navigation';
import '../globals.css';
import { LOCALES, LOCALE_TAGS, getDictionary, isLocale, type Locale } from '@/lib/i18n';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { siteUrl } from '@/lib/seo/metadata';
import { AdSenseScript } from '@/components/ads/AdSenseScript';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

const telugu = Noto_Sans_Telugu({
  subsets: ['telugu'],
  variable: '--font-telugu-sans',
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfaf7' },
    { media: '(prefers-color-scheme: dark)', color: '#191712' },
  ],
  // Never block pinch-zoom: some readers need it, and prices are the one thing on this
  // page nobody should have to squint at.
  maximumScale: 5,
};

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const d = getDictionary(locale);

  return {
    metadataBase: new URL(siteUrl()),
    title: {
      default: `${d.site.name} — ${d.site.tagline}`,
      template: `%s | ${d.site.name}`,
    },
    description: d.site.description,
    applicationName: d.site.name,
    formatDetection: { telephone: false },
    openGraph: {
      type: 'website',
      siteName: d.site.name,
      locale: LOCALE_TAGS[locale].replace('-', '_'),
    },
    robots: { index: true, follow: true },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const typed: Locale = locale;

  return (
    <html lang={LOCALE_TAGS[typed]} className={`${jakarta.variable} ${telugu.variable}`}>
      <body className="min-h-dvh flex flex-col">
        {/* Keyboard users should not have to tab through the whole nav to reach prices. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-lg focus:px-4 focus:py-2 focus:font-semibold"
          style={{ background: 'var(--brand)', color: 'white' }}
        >
          Skip to prices
        </a>
        <SiteHeader locale={typed} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter locale={typed} />
        <AdSenseScript />
      </body>
    </html>
  );
}
