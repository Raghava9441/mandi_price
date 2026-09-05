import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <p className="text-5xl font-extrabold tracking-tight" style={{ color: 'var(--brand)' }}>
        404
      </p>
      <h1 className="mt-4 text-2xl font-extrabold tracking-tight">
        We could not find that mandi or crop
      </h1>
      <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        The page may have moved, or the market may no longer be reporting prices. Start from
        your state and pick a crop from there.
      </p>
      <Link
        href="/en/states"
        className="tap mt-7 rounded-xl px-5 font-bold"
        style={{ backgroundColor: 'var(--brand)', color: 'white' }}
      >
        Browse states
      </Link>
    </div>
  );
}
