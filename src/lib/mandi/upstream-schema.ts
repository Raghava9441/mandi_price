import { z } from 'zod';

/**
 * Zod schemas for the raw data.gov.in envelope.
 *
 * The upstream is loosely typed and inconsistent: `limit` and `offset` come back as
 * strings, prices arrive as either numbers or numeric strings, and missing prices show
 * up as '', '-', 'NR' or 0. Everything is coerced here so the rest of the app only ever
 * sees the clean domain types.
 */

/** Coerce a price cell to a number, or null when it carries no usable value. */
const priceCell = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const trimmed = v.trim();
    if (trimmed === '' || trimmed === '-' || trimmed.toUpperCase() === 'NR') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  });

const text = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => (v === null || v === undefined ? '' : String(v).trim()));

export const upstreamRecordSchema = z.object({
  state: text,
  district: text,
  market: text,
  commodity: text,
  variety: text,
  grade: text,
  arrival_date: text,
  min_price: priceCell,
  max_price: priceCell,
  modal_price: priceCell,
});

export type UpstreamRecord = z.infer<typeof upstreamRecordSchema>;

export const upstreamEnvelopeSchema = z.object({
  /** 'ok' on success. Absent or otherwise on failure - even when HTTP status is 200. */
  status: z.string().optional(),
  /** 'Resource lists' on success; a serialised error blob on failure. */
  message: z.unknown().optional(),
  total: z.coerce.number().optional(),
  count: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
  /** Epoch seconds of the last dataset refresh. */
  updated: z.coerce.number().optional(),
  records: z.array(z.unknown()).optional(),
});

export type UpstreamEnvelope = z.infer<typeof upstreamEnvelopeSchema>;
