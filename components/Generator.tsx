"use client";

import { useState } from "react";
import BrandReport from "./BrandReport";

const EXAMPLES = [
  { name: "Stripe", url: "https://stripe.com" },
  { name: "Linear", url: "https://linear.app" },
  { name: "Notion", url: "https://notion.so" },
];

const STAGES = [
  { id: "discover", label: "Website discovered", detail: "Resolving URL · TinyFish Search when given a name" },
  { id: "content", label: "Reading brand content", detail: "TinyFish Fetch: homepage markdown + links + images + metadata" },
  { id: "pages", label: "Following internal pages", detail: "TinyFish Fetch: about / product / pricing / help triangulation" },
  { id: "visual", label: "Detecting visual identity", detail: "TinyFish Fetch HTML: CSS colors, logo & favicon candidates" },
  { id: "voice", label: "Analyzing voice & messaging", detail: "POST /api/brand/voice across multiple live pages" },
  { id: "bench", label: "Benchmarking competitors", detail: "TinyFish Search discovery + TinyFish Fetch comparison" },
  { id: "build", label: "Building brand system", detail: "Normalizing evidence → structured JSON + report" },
];

export default function Generator({ initialUrl = "" }: { initialUrl?: string }) {
  const [input, setInput] = useState(initialUrl);
  const [running, setRunning] = useState(false);
  const [doneStages, setDoneStages] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [extract, setExtract] = useState<any>(null);
  const [voice, setVoice] = useState<any>(null);
  const [bench, setBench] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(url: string) {
    const q = (url || input).trim();
    if (!q) { setError("Enter a company URL or name first."); return; }
    setRunning(true); setError(null); setExtract(null); setVoice(null); setBench(null); setDoneStages([]);
    const mark = (id: string) => setDoneStages((d) => [...d, id]);
    try {
      setActive("discover"); await wait(500); mark("discover");
      setActive("content");
      const exRes = await fetch("/api/brand/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: q }) });
      const ex = await exRes.json();
      if (!exRes.ok) throw new Error(ex.error ?? "Extraction failed.");
      mark("content"); mark("pages"); mark("visual"); setActive("voice");
      setExtract(ex);
      const [vRes, bRes] = await Promise.all([
        fetch("/api/brand/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: q }) }),
        fetch("/api/brand/benchmark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: q }) }),
      ]);
      const v = await vRes.json(); if (vRes.ok) { setVoice(v); } mark("voice");
      const b = await bRes.json(); if (bRes.ok) { setBench(b); } mark("bench");
      setActive("build"); await wait(500); mark("build"); setActive(null);
      document.getElementById("report")?.scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
      setActive(null);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div id="generate">
      <form onSubmit={(e) => { e.preventDefault(); run(input); }} className="mt-8 flex flex-col gap-3 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="https://company.com  or  company name"
          spellCheck={false}
          className="h-14 flex-1 border border-black/15 bg-white px-5 text-[15px] outline-none placeholder:text-black/35 focus:border-black"
        />
        <button disabled={running} className="h-14 bg-black px-8 text-[15px] font-semibold text-white transition hover:bg-black/80 disabled:opacity-50">
          {running ? "Generating…" : "Generate Brand Guide"}
        </button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-black/50">Try an example:</span>
        {EXAMPLES.map((x) => (
          <button key={x.name} disabled={running} onClick={() => { setInput(x.url); run(x.url); }} className="border border-black/15 bg-white px-3 py-1.5 font-medium hover:border-black disabled:opacity-50">
            {x.name}
          </button>
        ))}
        <span className="text-xs text-black/40">Examples run through the same TinyFish pipeline — nothing is hardcoded.</span>
      </div>

      {error && (
        <div className="mt-5 border border-red-300 bg-red-50 px-5 py-4 text-sm">
          <p className="font-semibold text-red-800">Generation failed</p>
          <p className="mt-1 text-red-700">{error}</p>
          <button onClick={() => run(input)} className="mt-2 font-mono text-xs underline">Retry →</button>
        </div>
      )}

      {(running || doneStages.length > 0) && !extract && (
        <div className="mt-6 border border-black/10 bg-white p-6 card-ring">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/50">Analyzing website — live TinyFish stages</p>
          <ul className="mt-4 space-y-3">
            {STAGES.map((s) => {
              const done = doneStages.includes(s.id);
              const isActive = active === s.id;
              return (
                <li key={s.id} className="flex items-start gap-3 text-sm">
                  <span className={`mt-0.5 grid h-5 w-5 place-items-center font-mono text-xs ${done ? "bg-black text-white" : isActive ? "border border-black step-pulse" : "border border-black/20 text-black/30"}`}>
                    {done ? "✓" : isActive ? "●" : "○"}
                  </span>
                  <span>
                    <span className={done || isActive ? "font-semibold" : "text-black/40"}>{s.label}</span>
                    <span className="block font-mono text-[11px] text-black/50">{s.detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {extract && (
        <div id="report">
          <BrandReport extract={extract} voice={voice} bench={bench} />
        </div>
      )}
    </div>
  );
}

function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
