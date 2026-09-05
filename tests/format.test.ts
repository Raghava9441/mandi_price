import { describe, expect, it } from 'vitest';
import { convertPrice, daysOld, formatDate, formatPrice, todayIST } from '../src/lib/format';
import { DISPLAY_NAME_OVERRIDES, displayName, slugify, uniqueSlug } from '../src/lib/slug';

describe('unit conversion', () => {
  it('converts rupees per quintal to the other bases', () => {
    expect(convertPrice(2400, 'quintal')).toBe(2400);
    expect(convertPrice(2400, 'kg')).toBe(24);
    expect(convertPrice(2400, 'bag')).toBe(1200);
  });
});

describe('formatPrice', () => {
  it('uses Indian digit grouping, not thousands grouping', () => {
    // 1,23,456 - grouping in lakhs. Western grouping would misread at a glance.
    expect(formatPrice(123456)).toBe('1,23,456');
    expect(formatPrice(2450)).toBe('2,450');
  });

  it('keeps two decimals per kg, where whole rupees would erase the difference', () => {
    expect(formatPrice(2450, 'kg')).toBe('24.50');
  });

  it('renders an absent price as a dash, never as zero', () => {
    expect(formatPrice(null)).toBe('—');
  });
});

describe('formatDate', () => {
  it('formats an ISO calendar date without shifting the day', () => {
    // The bug this guards: `new Date('2026-09-05')` is UTC midnight, which renders as
    // 4 Sep for every user in India.
    expect(formatDate('2026-09-05')).toBe('5 Sep 2026');
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026');
  });

  it('passes through anything it cannot parse', () => {
    expect(formatDate('')).toBe('');
  });
});

describe('daysOld', () => {
  it('counts whole calendar days', () => {
    expect(daysOld('2026-09-05', '2026-09-05')).toBe(0);
    expect(daysOld('2026-09-04', '2026-09-05')).toBe(1);
    expect(daysOld('2026-08-31', '2026-09-05')).toBe(5);
  });

  it('returns null for an unparseable date', () => {
    expect(daysOld('05/09/2026')).toBeNull();
  });
});

describe('todayIST', () => {
  it('returns a YYYY-MM-DD calendar date', () => {
    expect(todayIST()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('slugify', () => {
  it('handles the awkward real values in this dataset', () => {
    expect(slugify('Bengal Gram(Gram)(Whole)')).toBe('bengal-gram-gram-whole');
    expect(slugify('Ravulapalem (Kothapeta APMC)')).toBe('ravulapalem-kothapeta-apmc');
    expect(slugify('Dr.B.R.A.Konaseema')).toBe('dr-b-r-a-konaseema');
    expect(slugify('Gorantla  APMC')).toBe('gorantla-apmc');
    expect(slugify('Red gram split/Arhar dal/Tur dal')).toBe('red-gram-split-arhar-dal-tur-dal');
  });
});

describe('uniqueSlug', () => {
  it('suffixes collisions instead of silently serving one place under another URL', () => {
    const taken = new Set<string>();
    expect(uniqueSlug('Central APMC', taken)).toBe('central-apmc');
    expect(uniqueSlug('Central  APMC', taken)).toBe('central-apmc-2');
    expect(uniqueSlug('Central-APMC', taken)).toBe('central-apmc-3');
  });
});

describe('displayName', () => {
  it('corrects the spellings the source gets wrong', () => {
    expect(displayName('Chattisgarh')).toBe('Chhattisgarh');
    expect(displayName('Uttrakhand')).toBe('Uttarakhand');
    expect(displayName('Pondicherry')).toBe('Puducherry');
  });

  it('collapses the stray double spaces the source ships', () => {
    expect(displayName('Gorantla  APMC')).toBe('Gorantla APMC');
  });

  it('leaves unknown values untouched', () => {
    expect(displayName('Andhra Pradesh')).toBe('Andhra Pradesh');
    expect(DISPLAY_NAME_OVERRIDES['Andhra Pradesh']).toBeUndefined();
  });
});
