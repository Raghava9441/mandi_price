/**
 * URL slugs.
 *
 * Source values are messy - `Bengal Gram(Gram)(Whole)`, `Ravulapalem (Kothapeta APMC)`,
 * `Dr.B.R.A.Konaseema`, `Gorantla  APMC` (double space) - and several state names are
 * misspelled upstream (`Chattisgarh`, `Uttrakhand`, `Pondicherry`). Slugs are therefore
 * generated from the source value and mapped back through the catalog rather than being
 * reconstructed by un-slugifying, which would be lossy and ambiguous.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * Make a slug unique within a namespace by appending -2, -3, ... on collision.
 * Two different markets really can slugify identically, and a colliding slug would
 * silently serve one market's prices under the other's URL.
 */
export function uniqueSlug(value: string, taken: Set<string>): string {
  const base = slugify(value) || 'item';
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  const slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

/**
 * Display names for values the source spells wrongly or inconsistently.
 * Keyed by the exact upstream value; anything absent is shown as-is.
 */
export const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  Chattisgarh: 'Chhattisgarh',
  Uttrakhand: 'Uttarakhand',
  Pondicherry: 'Puducherry',
  Orissa: 'Odisha',
  'NCT of Delhi': 'Delhi',
  'Jammu and Kashmir': 'Jammu & Kashmir',
  'Andaman and Nicobar': 'Andaman & Nicobar Islands',
};

export function displayName(apiValue: string): string {
  return DISPLAY_NAME_OVERRIDES[apiValue] ?? apiValue.replace(/\s{2,}/g, ' ').trim();
}
