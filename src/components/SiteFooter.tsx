import { getDictionary, type Locale } from '@/lib/i18n';

export function SiteFooter({ locale }: { locale: Locale }) {
  const d = getDictionary(locale);
  return (
    <footer
      className="mt-16 border-t px-4 py-10"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sunken)' }}
    >
      <div className="mx-auto max-w-6xl space-y-3">
        {/* Stated plainly rather than buried: these are third-party figures shown as
            received, and a farmer acting on them should confirm at the mandi. */}
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {d.footer.disclaimer}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
          {d.footer.builtWith}
        </p>
      </div>
    </footer>
  );
}
