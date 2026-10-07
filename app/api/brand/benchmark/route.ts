import { NextResponse } from "next/server";
import { brandInputSchema, getInputString, errorStatusFor, friendlyError } from "@/lib/schemas";
import { benchmarkBrand } from "@/lib/benchmark";

export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = brandInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
    }
    const result = await benchmarkBrand(getInputString(parsed.data));
    if (!result || typeof result.targetBrand !== "string" || !Array.isArray(result.competitors)) {
      return NextResponse.json({ error: "Benchmark produced a malformed result. Nothing was fabricated — please retry." }, { status: 502 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Benchmark failed.";
    return NextResponse.json({ error: friendlyError(msg) }, { status: errorStatusFor(msg) });
  }
}

export async function GET() {
  return NextResponse.json({
    name: "POST /api/brand/benchmark",
    purpose: "Independent competitor workflow: categorizes the target from observed copy, discovers competitors live via TinyFish Search, resolves listicles to OFFICIAL competitor homepages (never listed as competitors), fetches each via TinyFish Fetch, and returns per-competitor intelligence + a target-vs-competitors comparison matrix.",
    input: { url: "https://example.com" },
    tinyfish: "Fetch target → Search category competitors → mine listicles for official domains (discovery evidence only) → Fetch each official homepage → compare positioning, audience, messaging, visuals, voice, CTAs.",
  });
}
