import Link from 'next/link';
import { LOCALES, LOCALE_NAMES, getDictionary, type Locale } from '@/lib/i18n';

function Sprout({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      <path
        d="M12 21v-7.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M12 13.5C12 9.9 9.3 7 6 7c0 3.6 2.7 6.5 6 6.5Z"
        fill="currentColor"
        opacity="0.55"
      />
      <path d="M12 12.5C12 8.4 14.7 5 18 5c0 4.1-2.7 7.5-6 7.5Z" fill="currentColor" />
    </svg>
  );
}

/**
 * Sticky header. Deliberately a Server Component with no client JavaScript: the language
 * switch is a plain link, so the whole chrome costs zero bytes of runtime.
 */
export function SiteHeader({ locale }: { locale: Locale }) {
  const d = getDictionary(locale);
  const other = LOCALES.find((l) => l !== locale) ?? locale;

  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'color-mix(in oklab, var(--bg) 82%, transparent)',
      }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link
          href={`/${locale}`}
          className="tap -ml-2 gap-2.5 rounded-xl px-2 font-bold tracking-tight"
        >
          <span
            className="grid h-9 w-9 place-items-center rounded-xl"
            style={{ background: 'var(--brand)', color: 'white' }}
          >
            <Sprout className="h-5 w-5" />
          </span>
          <span className="text-[1.0625rem] leading-tight">{d.site.name}</span>
        </Link>

        <nav className="ml-auto flex items-center gap-1">
          <Link
            href={`/${locale}/states`}
            className="tap rounded-xl px-3 text-sm font-semibold"
            style={{ color: 'var(--text-muted)' }}
          >
            {d.nav.states}
          </Link>
          <Link
            href={`/${other}`}
            hrefLang={other}
            className="tap rounded-xl border px-3 text-sm font-semibold"
            style={{ borderColor: 'var(--border-strong)', color: 'var(--text)' }}
          >
            {LOCALE_NAMES[other]}
          </Link>
        </nav>
      </div>
    </header>
  );
}
