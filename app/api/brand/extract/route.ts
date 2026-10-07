import { NextResponse } from "next/server";
import { brandInputSchema, getInputString, validateExtractShape, errorStatusFor, friendlyError } from "@/lib/schemas";
import { extractBrand } from "@/lib/brand-extractor";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = brandInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
    }
    const input = getInputString(parsed.data);
    const result = await extractBrand(input);
    // Phase 11: guarantee the contracted shape before responding.
    const check = validateExtractShape(result);
    if (!check.ok) {
      return NextResponse.json({ error: `Extraction produced a malformed result (${check.issues.join("; ")}). Nothing was fabricated — please retry.` }, { status: 502 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Extraction failed.";
    return NextResponse.json({ error: friendlyError(msg) }, { status: errorStatusFor(msg) });
  }
}

export async function GET() {
  return NextResponse.json({
    name: "POST /api/brand/extract",
    purpose: "TinyFish-powered full brand extraction (identity + colors + typography + logo + messaging + audience, all evidence-backed). Fetches homepage + type-labelled internal pages + stylesheet/SVG asset evidence.",
    input: { url: "https://example.com" },
    tinyfish: "Fetch homepage (markdown+links+images+metadata, ttl=0 live) → discover type-labelled internal pages (about/product/pricing/docs/help/blog/brand) → Fetch them → Fetch HTML → parse site stylesheets/SVG fills for palette + fonts.",
  });
}
