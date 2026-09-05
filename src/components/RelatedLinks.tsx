import Link from 'next/link';

/**
 * Sibling links.
 *
 * These are not decoration - they are the crawl path. Deep pages like a single crop in a
 * single state are unreachable from the homepage, so without dense sibling linking the
 * long tail never gets indexed at all.
 */
export function RelatedLinks({
  groups,
}: {
  groups: { heading: string; links: { label: string; href: string }[] }[];
}) {
  const populated = groups.filter((g) => g.links.length > 0);
  if (populated.length === 0) return null;

  return (
    <div className="mt-12 space-y-8">
      {populated.map((group) => (
        <section key={group.heading}>
          <h2 className="text-xl font-extrabold tracking-tight">{group.heading}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {group.links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="tap rounded-xl border px-3.5 text-sm font-semibold transition-colors"
                  style={{
                    borderColor: 'var(--border)',
                    backgroundColor: 'var(--bg-raised)',
                  }}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
