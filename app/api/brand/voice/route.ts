import { NextResponse } from "next/server";
import { brandInputSchema, getInputString, errorStatusFor, friendlyError } from "@/lib/schemas";
import { analyzeVoice } from "@/lib/brand-voice";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = brandInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
    }
    const result = await analyzeVoice(getInputString(parsed.data));
    if (!result || !result.voice || !Array.isArray(result.examples)) {
      return NextResponse.json({ error: "Voice analysis produced a malformed result. Nothing was fabricated — please retry." }, { status: 502 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Voice analysis failed.";
    return NextResponse.json({ error: friendlyError(msg) }, { status: errorStatusFor(msg) });
  }
}

export async function GET() {
  return NextResponse.json({
    name: "POST /api/brand/voice",
    purpose: "Independent multi-page voice analysis: personality, formality, technical level, persuasion, recurring phrases with per-quote sources, evidence-backed words-to-use/avoid. A different cut from /extract — no shared computation.",
    input: { url: "https://example.com" },
    tinyfish: "Fetch homepage + type-labelled internal pages (about/product/pricing/docs/help/blog) via TinyFish Fetch; analyzes headlines, CTAs, product and help copy with per-page provenance.",
  });
}
