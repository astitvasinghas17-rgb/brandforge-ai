import { z } from "zod";

export const brandInputSchema = z.object({
  url: z.string().min(2).max(500).optional(),
  input: z.string().min(2).max(500).optional(),
  company: z.string().min(2).max(200).optional(),
}).refine((d) => d.url || d.input || d.company, {
  message: 'Provide "url" (or "input"/"company" for a company name).',
});


export type BrandInput = z.infer<typeof brandInputSchema>;

export function getInputString(b: BrandInput): string {
  return (b.url ?? b.input ?? b.company ?? "").trim();
}

/* ---------------- output schemas (Phase 11: stable reusable JSON) ---------------- */

const originSchema = z.enum(["observed", "inferred"]);

export const evidenceItemSchema = z.object({
  source: z.string(),
  observed: z.string(),
  reason: z.string(),
  provider: z.string(),
  origin: originSchema,
});

export const colorSchema = z.object({
  name: z.string(),
  hex: z.string(),
  rgb: z.string(),
  usage: z.string(),
  source: z.string(),
  evidence: z.string(),
  confidence: z.number(),
  origin: originSchema,
});

export const fontSchema = z.object({
  family: z.string(),
  role: z.string(),
  weights: z.array(z.string()),
  sources: z.array(z.string()),
  evidence: z.string(),
  confidence: z.number(),
  origin: originSchema,
});

export const logoSchema = z.object({
  url: z.string(),
  type: z.string(),
  reason: z.string(),
  evidence: z.string(),
  source: z.string(),
  confidence: z.number(),
  origin: originSchema,
});

/** Validates an extraction result's load-bearing shape. Never throws. */
export function validateExtractShape(result: unknown): { ok: boolean; issues: string[] } {  if (!result || typeof result !== "object") return { ok: false, issues: ["result is not an object"] };
  const r = result as Record<string, unknown>;
  const issues: string[] = [];
  const brand = r.brand as Record<string, unknown> | undefined;
  if (!brand || typeof brand.name !== "string" || !brand.name) issues.push("brand.name missing");
  if (!Array.isArray(r.colors)) issues.push("colors[] missing");
  else {
    for (const c of r.colors as unknown[]) {
      if (colorSchema.safeParse(c).success === false) { issues.push("a color entry is malformed"); break; }
    }
  }
  if (logoSchema.safeParse(r.logo).success === false) issues.push("logo malformed");
  if (!Array.isArray(r.evidence)) issues.push("evidence[] missing");
  if (!r.meta || typeof (r.meta as Record<string, unknown>).resolvedUrl !== "string") issues.push("meta.resolvedUrl missing");
  return { ok: issues.length === 0, issues };
}

/** Maps pipeline errors to HTTP status codes (Phase 12). Never crashes. */
export function errorStatusFor(msg: string): number {
  if (/Blocked host|Only http|Invalid|Could not resolve/i.test(msg)) return 400;
  if (/HTTP 429|rate.?limit|RATE_LIMIT_EXCEEDED/i.test(msg)) return 503;
  if (/TinyFish Search HTTP|TinyFish Fetch HTTP 5|timeout|timed out|aborted/i.test(msg)) return 504;
  return 502;
}

/** User-facing error text: explains what happened, never a stack trace, never fake data. */
export function friendlyError(msg: string): string {
  if (/HTTP 429|rate.?limit|RATE_LIMIT_EXCEEDED/i.test(msg)) {
    return "TinyFish rate limit reached — please wait a few seconds and retry. Nothing was fabricated; no partial brand data is returned.";
  }
  return msg;
}
