import Link from 'next/link';

export function Breadcrumbs({ items }: { items: { name: string; path: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={item.path} className="flex items-center gap-1">
              {last ? (
                <span aria-current="page" className="truncate">{item.name}</span>
              ) : (
                <>
                  <Link href={item.path} className="hover:underline">
                    {item.name}
                  </Link>
                  <span aria-hidden="true" style={{ color: 'var(--text-faint)' }}>/</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
