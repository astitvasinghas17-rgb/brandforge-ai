import { NextResponse } from "next/server";
import { getTinyFishStatus } from "@/lib/tinyfish";

export async function GET() {
  return NextResponse.json({
    ...getTinyFishStatus(),
    endpoints: ["POST /api/brand/extract", "POST /api/brand/voice", "POST /api/brand/benchmark"],
    docs: "All live-website reads flow through lib/tinyfish.ts. No API keys are ever sent to the browser.",
  });
}
