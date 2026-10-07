"use client";

import { useMemo, useState } from "react";

type Extract = any;
type Voice = any;
type Bench = any;

function copy(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function download(name: string, content: string, type = "application/json") {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function esc(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function OriginBadge({ origin }: { origin?: string }) {
  if (origin === "inferred") {
    return <span className="ml-2 border border-amber-600 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-amber-700">Inferred</span>;
  }
  return <span className="ml-2 bg-black px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-white">Observed</span>;
}

function buildExportJson(e: Extract, v: Voice | null, b: Bench | null, doDont: { do: string[]; dont: string[] }) {
  return {
    schemaVersion: "1.0",
    generatedAt: e.meta?.generatedAt,
    brand: e.brand,
    source: {
      resolvedUrl: e.meta?.resolvedUrl,
      resolveMethod: e.meta?.resolveMethod,
      tinyFishUsed: e.meta?.tinyFishUsed,
      pagesFetched: e.meta?.pagesFetched,
    },
    logo: e.logo,
    favicon: e.favicon,
    colors: e.colors,
    typography: e.typography,
    visualLanguage: e.visualStyle,
    voice: v?.voice ?? null,
    messaging: { ...e.messaging, voiceMessaging: v?.messaging ?? null, voiceExamples: v?.examples ?? [] },
    audience: { ...e.audience, voiceAudience: v?.audience ?? null },
    doDont: { ...doDont, note: "Inferred from observed copy — not official company guidelines." },
    benchmark: b ?? null,
    evidence: [...(e.evidence ?? []), ...((v?.evidence ?? []).map((x: any) => ({ ...x, endpoint: "voice" })))],
    confidence: e.confidence,
    sources: e.sources,
  };
}

function toMarkdown(e: Extract, v: Voice | null, b: Bench | null, doDont: { do: string[]; dont: string[] }): string {
  const L: string[] = [];
  L.push(`# ${e.brand?.name} — Brand Intelligence Report`);
  L.push(`Website: ${e.brand?.website} · Confidence: ${Math.round((e.confidence?.overall ?? 0) * 100)}% · Generated ${e.meta?.generatedAt ?? ""}`);
  L.push(`Resolution: ${e.meta?.resolveMethod ?? ""} · TinyFish: ${e.meta?.tinyFishUsed ? "live extraction" : "direct-fetch fallback"}`);
  L.push("");
  L.push(`> ${e.brand?.tagline ?? ""}`);
  L.push("");
  L.push(`## Overview\n${e.brand?.description ?? ""}`);
  L.push(`\n**Category:** ${e.brand?.category ?? "Category not reliably determined"} (confidence ${Math.round(((e.brand?.categoryConfidence ?? 0)) * 100)}%)`);
  (e.brand?.categoryEvidence ?? []).forEach((x: string) => L.push(`- evidence: ${x}`));
  L.push(`\n**Value proposition:** ${e.messaging?.primaryValueProposition ?? ""}`);
  L.push("\n## Logo");
  L.push(`- URL: ${e.logo?.url || "Not detected"}\n- Type: ${e.logo?.type}\n- Reason: ${e.logo?.reason}\n- Confidence: ${Math.round((e.logo?.confidence ?? 0) * 100)}%`);
  L.push("\n## Colors");
  if ((e.colors ?? []).length === 0) L.push("Not detected — insufficient CSS color evidence.");
  (e.colors ?? []).forEach((c: any) => L.push(`- ${c.usage}: ${c.hex} (${c.rgb}) — source: ${c.source} — ${c.evidence}`));
  L.push("\n## Typography");
  if (e.typography?.heading) L.push(`- Heading: ${e.typography.heading.family} (weights: ${(e.typography.heading.weights ?? []).join(", ")}) — ${e.typography.heading.evidence}`);
  if (e.typography?.body) L.push(`- Body: ${e.typography.body.family} (weights: ${(e.typography.body.weights ?? []).join(", ")}) — ${e.typography.body.evidence}`);
  if (!e.typography?.heading && !e.typography?.body) L.push("Not reliably detected from live evidence.");
  if (v) {
    L.push(`\n## Voice & Tone (endpoint 2, ${v.meta?.pagesAnalyzed} pages)`);
    L.push(v.voice?.overall ?? "");
    L.push(`- Personality: ${(v.voice?.personality ?? []).join(", ")} · Formality: ${v.voice?.formality} · Technical: ${v.voice?.technicalLevel}`);
    L.push(`- CTA style: ${v.messaging?.ctaStyle}`);
    L.push(`- Words to use: ${(v.messaging?.wordsToUse ?? []).join(", ")}`);
    L.push(`- Words to avoid: ${(v.messaging?.wordsToAvoid ?? []).join("; ")}`);
    (v.examples ?? []).forEach((x: any) => L.push(`  - "${x.original}" — ${x.analysis} [${x.source}]`));
  }
  L.push(`\n## Audience\n- Primary: ${e.audience?.primary}\n- Secondary: ${e.audience?.secondary}\n- Confidence: ${Math.round(((e.audience?.confidence ?? 0)) * 100)}%`);
  (e.audience?.evidenceItems ?? []).forEach((x: string) => L.push(`- evidence: ${x}`));
  if (v?.audience) {
    L.push(`- Voice audience: ${v.audience.likelyAudience}`);
    (v.audience.audiencePainPoints ?? []).forEach((p: string) => L.push(`- pain: ${p}`));
  }
  L.push("\n## Do / Don't (inferred, not official guidelines)");
  doDont.do.forEach((d) => L.push(`- DO: ${d}`));
  doDont.dont.forEach((d) => L.push(`- DON'T: ${d}`));
  if (b) {
    L.push(`\n## Benchmark (endpoint 3)`);
    L.push(b.targetSummary ?? "");
    (b.competitors ?? []).forEach((c: any) => {
      L.push(`\n### ${c.name} (${c.website})`);
      L.push(`- Positioning: ${c.positioning}\n- Audience: ${c.targetAudience}\n- Headline: ${c.headline}\n- Voice: ${c.voice}\n- CTA: ${c.ctaStyle}\n- Colors: ${(c.majorColors ?? []).join(", ") || "Not detected"}\n- Typography: ${c.typography}\n- Differentiators: ${(c.differentiatorsVsTarget ?? []).join("; ")}`);
    });
    (b.failures ?? []).forEach((f: any) => L.push(`- Skipped ${f.website}: ${f.reason}`));
    L.push(`\nDiscovery: ${b.discovery?.note}`);
  }
  L.push("\n## Evidence");
  (e.evidence ?? []).forEach((x: any) => L.push(`- [${x.provider} · ${x.origin}] ${x.source}: ${x.observed} — ${x.reason}`));
  return L.join("\n");
}

function toStandaloneHtml(e: Extract, v: Voice | null, b: Bench | null): string {
  const sw = (e.colors ?? []).map((c: any) => `<div style="border:1px solid #ddd;padding:12px"><div style="height:48px;background:${esc(c.hex)}"></div><b>${esc(c.hex)}</b><br><small>${esc(c.usage)} · ${esc(c.rgb)}</small><br><small>${esc(c.evidence)}</small></div>`).join("") || "<p>Not detected — insufficient CSS color evidence.</p>";
  const comps = (b?.competitors ?? []).map((c: any) => `<div style="border:1px solid #ddd;padding:12px;margin:8px 0"><b>${esc(c.name)}</b> <small>${esc(c.website)}</small><p><i>${esc(c.headline)}</i></p><p>${esc(c.positioning)}</p><p><small>Audience: ${esc(c.targetAudience)} · Voice: ${esc(c.voice)} · CTA: ${esc(c.ctaStyle)}</small></p></div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(e.brand?.name)} — Brand Guide</title></head><body style="font-family:sans-serif;max-width:780px;margin:40px auto;padding:0 20px;color:#111"><h1>${esc(e.brand?.name)}</h1><p><i>${esc(e.brand?.tagline ?? "")}</i></p><p>${esc(e.brand?.description ?? "")}</p><p><small>${esc(e.brand?.website ?? "")} · Confidence ${Math.round((e.confidence?.overall ?? 0) * 100)}% · ${esc(e.meta?.resolveMethod ?? "")}</small></p><h2>Logo</h2>${e.logo?.url ? `<img src="${esc(e.logo.url)}" alt="logo" style="max-height:64px"><p><small>Type: ${esc(e.logo.type)} · ${esc(e.logo.reason)}</small></p>` : "<p>Not detected.</p>"}<h2>Colors</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">${sw}</div><h2>Typography</h2><p>Heading: ${esc(e.typography?.heading?.family ?? "Not reliably detected")}<br>Body: ${esc(e.typography?.body?.family ?? "Not reliably detected")}<br><small>${esc(e.typography?.note ?? "")}</small></p><h2>Key messages</h2><ul>${(e.messaging?.keyMessages ?? []).map((m: string) => `<li>${esc(m)}</li>`).join("")}</ul>${v ? `<h2>Voice</h2><p>${esc(v.voice?.overall ?? "")}</p><p><small>CTA: ${esc(v.messaging?.ctaStyle ?? "")}</small></p>` : ""}${b ? `<h2>Benchmark</h2><p>${esc(b.targetSummary ?? "")}</p>${comps}<p><small>${esc(b.discovery?.note ?? "")}</small></p>` : ""}<h2>Evidence</h2><ul>${(e.evidence ?? []).map((x: any) => `<li><small>[${esc(x.provider)} · ${esc(x.origin)}] ${esc(x.source)} — ${esc(x.observed)}</small></li>`).join("")}</ul><p><small>Generated by BrandForge AI via TinyFish live-site extraction. Inferred guidance is not official company policy.</small></p></body></html>`;
}

export default function BrandReport({ extract, voice, bench }: { extract: Extract; voice: Voice | null; bench: Bench | null }) {
  const [copied, setCopied] = useState<string | null>(null);
  const conf = Math.round((extract.confidence?.overall ?? 0) * 100);

  const doDont = useMemo(() => {
    const vv = voice?.voice;
    const does: string[] = [];
    if (vv?.sentenceStyle?.includes("punchy")) does.push("Lead with short, outcome-led headlines");
    else does.push("Mirror the site's explanatory cadence — headline + supporting line");
    if ((voice?.messaging?.ctaStyle ?? "").toLowerCase().includes("trial") || (voice?.messaging?.ctaStyle ?? "").toLowerCase().includes("demo")) does.push("Use low-friction CTAs (trial/demo framing)");
    else does.push("Use the direct imperative CTAs observed on the live site");
    does.push(`Write at the observed register (${vv?.technicalLevel?.split("—")[0]?.trim() ?? "as observed"})`);
    does.push("Reuse recurring terminology instead of inventing synonyms");
    return {
      do: does.slice(0, 5),
      dont: [
        "Don't fabricate a logo — use the labelled candidate or favicon",
        "Don't claim fonts/colors beyond the stated confidence",
        "Don't present inferred guidance as official company guidelines",
        ...(voice?.messaging?.wordsToAvoid ?? []).filter((w: string) => !/insufficient evidence/i.test(w)).map((w: string) => `Avoid: ${w}`).slice(0, 2),
      ].slice(0, 5),
    };
  }, [voice]);

  const exportJson = useMemo(() => JSON.stringify(buildExportJson(extract, voice, bench, doDont), null, 2), [extract, voice, bench, doDont]);

  const typo = extract.typography ?? {};
  const fontCards = [
    typo.heading ? { ...typo.heading, label: "Heading font" } : null,
    typo.body && typo.body.family !== typo.heading?.family ? { ...typo.body, label: "Body font" } : null,
  ].filter(Boolean) as any[];

  return (
    <div className="fade-up mt-10 overflow-hidden border border-black/10 bg-white card-ring">
      {/* header */}
      <div className="border-b border-black/10 bg-[#0c0d10] px-8 py-8 text-white">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {extract.logo?.url ? (
              <img src={extract.logo.url} alt={`${extract.brand?.name} logo`} className="h-14 w-14 bg-white object-contain p-1.5" onError={(ev) => { (ev.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <div className="grid h-14 w-14 place-items-center bg-white font-serif text-2xl text-black">
                {(extract.brand?.name ?? "?")[0]}
              </div>
            )}
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">Brand Intelligence Report</p>
              <h2 className="font-serif text-3xl tracking-tight">{extract.brand?.name}</h2>
              <p className="mt-1 text-sm text-white/70">{extract.brand?.website} · {extract.meta?.pagesFetched} live page(s) · {extract.meta?.tinyFishUsed ? "TinyFish live extraction" : "Direct-fetch fallback (no key)"}</p>
              <p className="mt-1 font-mono text-[11px] text-white/50">{extract.meta?.resolveMethod}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-4xl font-bold">{conf}<span className="text-lg text-white/60">%</span></div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-white/60">confidence</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={() => { copy(exportJson); setCopied("json"); setTimeout(() => setCopied(null), 1500); }} className="bg-white px-3 py-1.5 font-mono text-xs font-semibold text-black hover:bg-white/85">{copied === "json" ? "Copied ✓" : "Copy JSON"}</button>
          <button onClick={() => download(`${extract.brand?.name ?? "brand"}-guide.json`, exportJson)} className="border border-white/30 px-3 py-1.5 font-mono text-xs text-white hover:bg-white/10">JSON ↓</button>
          <button onClick={() => download(`${extract.brand?.name ?? "brand"}-guide.md`, toMarkdown(extract, voice, bench, doDont), "text/markdown")} className="border border-white/30 px-3 py-1.5 font-mono text-xs text-white hover:bg-white/10">Markdown ↓</button>
          <button onClick={() => download(`${extract.brand?.name ?? "brand"}-guide.html`, toStandaloneHtml(extract, voice, bench), "text/html")} className="border border-white/30 px-3 py-1.5 font-mono text-xs text-white hover:bg-white/10">Brand HTML ↓</button>
        </div>
      </div>

      <div className="grid gap-0 md:grid-cols-[1fr_320px]">
        <div className="px-8 py-8">
          {/* 1 overview */}
          <section>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/50">01 — Brand overview <OriginBadge origin="observed" /></p>
            <p className="mt-2 font-serif text-xl italic leading-relaxed">“{extract.brand?.tagline || "No tagline isolated"}”</p>
            <p className="mt-3 leading-relaxed text-black/80">{extract.brand?.description}</p>
            <div className="mt-3 border border-black/10 bg-[#fafaf8] p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-black/50">Category (dynamically inferred — never defaulted) <OriginBadge origin="observed" /></p>
              <p className="mt-1 text-sm font-medium">{extract.brand?.category ?? "Category not reliably determined"} <span className="font-mono text-xs text-black/50">· confidence {Math.round(((extract.brand?.categoryConfidence ?? 0)) * 100)}%</span></p>
              {(extract.brand?.categoryEvidence ?? []).length > 0 && <p className="mt-1 font-mono text-[11px] leading-relaxed text-black/60">{(extract.brand.categoryEvidence ?? []).join(" · ")}</p>}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="border border-black/10 bg-[#fafaf8] p-4"><p className="font-mono text-[10px] uppercase tracking-widest text-black/50">Value proposition</p><p className="mt-1 text-sm font-medium">{extract.messaging?.primaryValueProposition}</p></div>
              <div className="border border-black/10 bg-[#fafaf8] p-4"><p className="font-mono text-[10px] uppercase tracking-widest text-black/50">Resolution</p><p className="mt-1 font-mono text-xs">{extract.meta?.resolveMethod}</p></div>
            </div>
          </section>

          {/* 3 colors */}
          <section className="mt-10">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/50">03 — Color palette <OriginBadge origin="observed" /></p>
              <button onClick={() => { copy(JSON.stringify(extract.colors, null, 2)); setCopied("pal"); setTimeout(() => setCopied(null), 1500); }} className="font-mono text-xs underline">{copied === "pal" ? "Copied ✓" : "Copy palette JSON"}</button>
            </div>
            {extract.colors?.length ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {extract.colors.map((c: any) => (
                  <div key={c.hex + c.usage} className="swatch border border-black/10">
                    <div className="h-20" style={{ background: c.hex }} />
                    <div className="p-3">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-black/50">{c.usage}</p>
                      <button onClick={() => { copy(c.hex); setCopied(c.hex); setTimeout(() => setCopied(null), 1200); }} className="font-mono text-sm font-bold hover:underline">{copied === c.hex ? "Copied ✓" : c.hex}</button>
                      <p className="font-mono text-[11px] text-black/60">{c.rgb} · {c.name}</p>
                      <p className="mt-1 font-mono text-[10px] text-black/50">src: {c.source}</p>
                      <p className="mt-1 text-[11px] leading-snug text-black/60">{c.evidence}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="mt-3 border border-dashed border-black/20 bg-[#fafaf8] p-4 text-sm text-black/60">Not detected — insufficient CSS color evidence on the live site. Nothing was invented to fill this section.</p>}
          </section>

          {/* 4 typography */}
          <section className="mt-10">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/50">04 — Typography <OriginBadge origin="observed" /></p>
            {fontCards.length ? (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {fontCards.map((f: any) => (
                    <div key={f.label} className="border border-black/10 p-4">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-black/50">{f.label} · {f.role}</p>
                      <p className="mt-1 text-2xl font-bold">{f.family}</p>
                      <p className="mt-2 text-black/70">The quick brown fox jumps over the lazy dog.</p>
                      <p className="mt-2 font-mono text-[11px] text-black/60">weights: {(f.weights ?? []).join(", ")}</p>
                      <p className="mt-1 font-mono text-[11px] text-black/60">confidence {Math.round((f.confidence ?? 0) * 100)}%</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-black/60">{typo.note}</p>
                {(typo.all ?? []).length > 2 && <p className="mt-1 font-mono text-[11px] text-black/50">Also observed: {(typo.all ?? []).slice(2).map((f: any) => f.family).join(", ")}</p>}
              </>
            ) : <p className="mt-3 border border-dashed border-black/20 bg-[#fafaf8] p-4 text-sm text-black/60">Not reliably detected from live evidence — no font-family, @font-face, or webfont references found. Nothing was invented.</p>}
          </section>

          {/* 5 visual */}
          <section className="mt-10">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/50">05 — Visual language <OriginBadge origin={extract.visualStyle?.origin} /></p>
            <div className="mt-3 flex flex-wrap gap-2">{(extract.visualStyle?.designKeywords ?? []).map((k: string) => <span key={k} className="border border-black/15 bg-[#fafaf8] px-2.5 py-1 font-mono text-xs">{k}</span>)}</div>
            <p className="mt-3 text-sm leading-relaxed text-black/80">{extract.visualStyle?.description}</p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {[["Shape language", extract.visualStyle?.shapeLanguage], ["Image style", extract.visualStyle?.imageStyle], ["Spacing", extract.visualStyle?.spacing]].map(([k, v]) => (
                <div key={k as string} className="border border-black/10 p-3"><dt className="font-mono text-[10px] uppercase tracking-widest text-black/50">{k}</dt><dd className="mt-1">{v as string}</dd></div>
              ))}
            </dl>
          </section>

          {/* 6 voice */}
          {voice && (
            <section className="mt-10">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/50">06 — Voice &amp; tone <span className="text-black/35">(endpoint 2 · {voice.meta?.pagesAnalyzed} pages)</span> <OriginBadge origin="observed" /></p>
              <p className="mt-2 text-sm leading-relaxed">{voice.voice?.overall}</p>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {[["Personality", (voice.voice?.personality ?? []).join(" · ")], ["Formality", voice.voice?.formality], ["Technical level", voice.voice?.technicalLevel], ["Emotional tone", (voice.voice?.emotionalTone ?? []).join(" · ")], ["Sentence style", voice.voice?.sentenceStyle], ["Persuasion", voice.voice?.persuasionStyle]].map(([k, v]) => (
                  <div key={k as string} className="border border-black/10 p-3"><p className="font-mono text-[10px] uppercase tracking-widest text-black/50">{k}</p><p className="mt-1">{v as string}</p></div>
                ))}
              </div>
              <div className="mt-3 border border-black/10 bg-[#fafaf8] p-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-black/50">CTA style</p>
                <p className="mt-1 text-sm">{voice.messaging?.ctaStyle}</p>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-black/50">Words to use (observed)</p>
                <p className="mt-1 font-mono text-xs">{(voice.messaging?.wordsToUse ?? []).join(" · ")}</p>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-black/50">Words to avoid</p>
                <p className="mt-1 font-mono text-xs">{(voice.messaging?.wordsToAvoid ?? []).join(" · ")}</p>
              </div>
              {(voice.examples ?? []).length > 0 && (
                <div className="mt-3 space-y-2">
                  {(voice.examples ?? []).map((x: any, i: number) => (
                    <div key={i} className="border-l-2 border-black bg-[#fafaf8] p-3">
                      <p className="text-sm italic">“{x.original}”</p>
                      <p className="mt-1 text-xs text-black/60">{x.analysis}</p>
                      <p className="mt-1 font-mono text-[10px] text-black/45">source: {x.source}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 7 messaging */}
          <section className="mt-10">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/50">07 — Key messaging <OriginBadge origin="observed" /></p>
            <ul className="mt-3 space-y-2">
              {(extract.messaging?.keyMessages ?? []).map((m: string, i: number) => (
                <li key={i} className="border-l-2 border-black pl-3 text-sm leading-relaxed">{m}</li>
              ))}
            </ul>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="border border-black/10 p-3"><p className="font-mono text-[10px] uppercase tracking-widest text-black/50">CTA patterns</p><p className="mt-1 font-mono text-xs">{(extract.messaging?.ctaPatterns ?? []).join(" · ") || "Not captured"}</p></div>
              <div className="border border-black/10 p-3"><p className="font-mono text-[10px] uppercase tracking-widest text-black/50">Important terms</p><p className="mt-1 font-mono text-xs">{(extract.messaging?.importantTerms ?? []).slice(0, 10).join(" · ") || "Not captured"}</p></div>
            </div>
            {voice && (
              <div className="mt-2 border border-black/10 p-3"><p className="font-mono text-[10px] uppercase tracking-widest text-black/50">Recurring phrases (multi-page)</p><p className="mt-1 font-mono text-xs">{(voice.messaging?.recurringPhrases ?? []).join(" · ")}</p></div>
            )}
          </section>

          {/* 8 audience */}
          <section className="mt-10">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/50">08 — Audience <OriginBadge origin={extract.audience?.origin} /></p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="border border-black/10 p-4"><p className="font-mono text-[10px] uppercase tracking-widest text-black/50">Primary</p><p className="mt-1 font-medium">{extract.audience?.primary}</p></div>
              <div className="border border-black/10 p-4"><p className="font-mono text-[10px] uppercase tracking-widest text-black/50">Secondary</p><p className="mt-1 font-medium">{extract.audience?.secondary}</p></div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-black/60">Evidence: {extract.audience?.evidence} <span className="font-mono">· confidence {Math.round(((extract.audience?.confidence ?? 0)) * 100)}%</span></p>
            {(extract.audience?.evidenceItems ?? []).length > 0 && (
              <ul className="mt-2 space-y-1">
                {(extract.audience.evidenceItems ?? []).slice(0, 3).map((q: string) => <li key={q} className="border-l-2 border-black/30 pl-2 font-mono text-[11px] leading-relaxed text-black/65">{q}</li>)}
              </ul>
            )}
            {voice && (voice.audience?.audiencePainPoints ?? []).length > 0 && (
              <div className="mt-2 border border-black/10 p-3"><p className="font-mono text-[10px] uppercase tracking-widest text-black/50">Pain points (problem-language only — never templated)</p><ul className="mt-1 list-disc space-y-1 pl-4 text-sm">{(voice.audience.audiencePainPoints ?? []).map((p: string) => <li key={p}>{p}</li>)}</ul>
              {(voice.audience?.audienceEvidence ?? []).length > 0 && <p className="mt-2 font-mono text-[11px] text-black/55">Audience evidence: {(voice.audience.audienceEvidence ?? []).join(" · ").slice(0, 300)}</p>}</div>
            )}
          </section>

          {/* 9 do/don't */}
          <section className="mt-10">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/50">09 — Do / Don&apos;t <OriginBadge origin="inferred" /></p>
            <p className="mt-1 text-xs text-black/50">Inferred from observed copy — not official company guidelines.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="border border-black/10 p-4"><p className="font-mono text-xs font-bold text-emerald-700">DO</p><ul className="mt-2 list-disc space-y-1 pl-4 text-sm">{doDont.do.map((d) => <li key={d}>{d}</li>)}</ul></div>
              <div className="border border-black/10 p-4"><p className="font-mono text-xs font-bold text-red-700">DON&apos;T</p><ul className="mt-2 list-disc space-y-1 pl-4 text-sm">{doDont.dont.map((d) => <li key={d}>{d}</li>)}</ul></div>
            </div>
          </section>

          {/* 10 benchmark */}
          {bench && (
            <section className="mt-10">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/50">10 — Competitive benchmark <span className="text-black/35">(endpoint 3 · official domains only)</span></p>
              <p className="mt-2 text-sm text-black/70">{bench.targetSummary}</p>
              {bench.targetCategory && <p className="mt-1 font-mono text-[11px] text-black/60">Target category: {bench.targetCategory.category} (confidence {Math.round((bench.targetCategory.confidence ?? 0) * 100)}%)</p>}
              <div className="mt-2 border border-black/10 bg-[#fafaf8] p-3 font-mono text-[11px] leading-relaxed text-black/60">
                <p><span className="font-bold text-black">Discovery:</span> {bench.discovery?.note}</p>
                {(bench.discovery?.queries ?? []).length > 0 && <p className="mt-1">Queries: {(bench.discovery.queries ?? []).join(" · ")}</p>}
                {(bench.discovery?.listiclesUsed ?? []).length > 0 && <p className="mt-1">Listicles mined (evidence only, not competitors): {(bench.discovery.listiclesUsed ?? []).map((u: string) => u.replace(/^https?:\/\//, "").split("/")[0]).join(", ")}</p>}
              </div>
              {(bench.competitors ?? []).map((c: any) => (
                <div key={c.website} className="mt-3 border border-black/10 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">{c.name} <OriginBadge origin="observed" /></p>
                    <p className="font-mono text-xs text-black/50">{c.website} · conf {Math.round((c.confidence ?? 0) * 100)}%</p>
                  </div>
                  <p className="mt-1 font-serif italic">“{c.headline}”</p>
                  <p className="mt-1 text-sm text-black/70">{c.positioning}</p>
                  <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    {[["Audience", c.targetAudience], ["Voice", c.voice], ["CTA", c.ctaStyle], ["Typography", c.typography]].map(([k, v]) => (
                      <div key={k as string} className="bg-[#fafaf8] p-2.5"><p className="font-mono text-[10px] uppercase tracking-widest text-black/50">{k}</p><p className="mt-0.5 text-[13px]">{(v as string) || "Not detected"}</p></div>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {(c.majorColors ?? []).map((h: string) => <span key={h} className="flex items-center gap-1 border border-black/10 px-1.5 py-0.5 font-mono text-[11px]"><span className="inline-block h-3 w-3 border border-black/20" style={{ background: h }} />{h}</span>)}
                    {(c.majorColors ?? []).length === 0 && <span className="font-mono text-[11px] text-black/50">colors: Not detected</span>}
                  </div>
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[13px] text-black/75">{(c.differentiatorsVsTarget ?? []).map((d: string) => <li key={d}>{d}</li>)}</ul>
                </div>
              ))}
              {(bench.competitors ?? []).length === 0 && <p className="mt-2 border border-dashed border-black/20 p-4 text-sm text-black/60">No competitors discovered — see discovery note above. Nothing was invented.</p>}
              {(bench.failures ?? []).length > 0 && (
                <div className="mt-2 border border-black/10 p-3"><p className="font-mono text-[10px] uppercase tracking-widest text-black/50">Skipped candidates (honest failures)</p>{(bench.failures ?? []).map((f: any) => <p key={f.website} className="mt-1 font-mono text-[11px] text-black/60">{f.website}: {f.reason}</p>)}</div>
              )}
              {(bench.comparison?.rows ?? []).length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-black/50">Target vs competitors</p>
                  <table className="mt-2 w-full border-collapse text-[13px]">
                    <thead><tr className="bg-black text-white"><th className="border border-black p-2 text-left font-mono text-[11px]">Dimension</th><th className="border border-black p-2 text-left font-mono text-[11px]">{bench.targetBrand} (target)</th>{(bench.competitors ?? []).map((c: any) => <th key={c.website} className="border border-black p-2 text-left font-mono text-[11px]">{c.name}</th>)}</tr></thead>
                    <tbody>{(bench.comparison.rows ?? []).map((r: any) => (
                      <tr key={r.dimension}><td className="border border-black/15 bg-[#fafaf8] p-2 font-mono text-[11px] font-bold">{r.dimension}</td><td className="border border-black/15 p-2">{r.target}</td>{(r.competitors ?? []).map((cell: string, i: number) => <td key={i} className="border border-black/15 p-2">{cell}</td>)}</tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* 11 evidence */}
          <section className="mt-10">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/50">11 — Evidence <span className="text-black/35">(why you can trust this)</span></p>
            <p className="mt-1 text-xs text-black/50"><span className="bg-black px-1 py-0.5 text-[10px] text-white">Observed</span> = seen live on the site · <span className="border border-amber-600 px-1 text-[10px] text-amber-700">Inferred</span> = derived, labelled as such · “Official” is never claimed unless a brand-guideline page says so.</p>
            <div className="mt-3 space-y-2">
              {(extract.evidence ?? []).map((x: any, i: number) => (
                <div key={i} className="border border-black/10 bg-[#fafaf8] p-3">
                  <p className="font-mono text-[11px]"><span className="bg-black px-1.5 py-0.5 text-white">{x.provider}</span> <OriginBadge origin={x.origin} /></p>
                  <p className="mt-1 font-mono text-[11px] text-black/60">{x.source}</p>
                  <p className="mt-1 text-sm">{x.observed}</p>
                  <p className="text-xs text-black/60">→ {x.reason}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* side rail */}
        <aside className="border-t border-black/10 bg-[#fafaf8] px-6 py-8 md:border-l md:border-t-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/50">02 — Logo <OriginBadge origin={extract.logo?.origin} /></p>
          <div className="mt-3 border border-black/10 bg-white p-4 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {extract.logo?.url ? <img src={extract.logo.url} alt="logo" className="mx-auto max-h-16 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <p className="font-mono text-xs">Not detected</p>}
            <p className="mt-2 font-mono text-[11px] font-bold text-black/70">type: {extract.logo?.type ?? "none"}</p>
            <p className="mt-1 text-[11px] leading-snug text-black/60">{extract.logo?.reason}</p>
            <p className="mt-1 font-mono text-[11px] text-black/60">confidence {Math.round((extract.logo?.confidence ?? 0) * 100)}%</p>
            {extract.logo?.url && <a href={extract.logo.url} target="_blank" rel="noreferrer" className="mt-1 block break-all font-mono text-[10px] underline">{extract.logo.url.slice(0, 60)}…</a>}
          </div>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-black/50">12 — Confidence</p>
          {[["Overall", extract.confidence?.overall], ["Colors", extract.confidence?.colors], ["Typography", extract.confidence?.typography], ["Voice", extract.confidence?.voice], ["Evidence coverage", extract.confidence?.evidenceCoverage]].map(([k, v]) => (
            <div key={k as string} className="mt-2"><div className="flex justify-between font-mono text-[11px]"><span>{k}</span><span>{Math.round(((v as number) ?? 0) * 100)}%</span></div>
              <div className="mt-1 h-1.5 bg-black/10"><div className="h-1.5 bg-black" style={{ width: `${Math.round(((v as number) ?? 0) * 100)}%` }} /></div></div>
          ))}
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-black/50">Sources · 13 — Export</p>
          <ul className="mt-2 space-y-1.5">
            {(extract.sources ?? []).map((s: any) => (
              <li key={s.url} className="font-mono text-[11px]"><span className="bg-black/10 px-1">{s.pageType ?? "page"}</span> <span className="bg-black/10 px-1">{s.provider}</span> <a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.url.replace(/^https?:\/\//, "").slice(0, 30)}</a></li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button onClick={() => download(`${extract.brand?.name ?? "brand"}-guide.json`, exportJson)} className="bg-black px-2.5 py-1.5 font-mono text-[11px] text-white">JSON ↓</button>
            <button onClick={() => download(`${extract.brand?.name ?? "brand"}-guide.md`, toMarkdown(extract, voice, bench, doDont), "text/markdown")} className="border border-black px-2.5 py-1.5 font-mono text-[11px]">MD ↓</button>
            <button onClick={() => download(`${extract.brand?.name ?? "brand"}-guide.html`, toStandaloneHtml(extract, voice, bench), "text/html")} className="border border-black px-2.5 py-1.5 font-mono text-[11px]">HTML ↓</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
