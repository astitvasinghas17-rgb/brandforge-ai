const ENDPOINTS = [
  {
    name: "POST /api/brand/extract",
    purpose: "Core identity extraction — brand, logo (typed), role-assigned colors, observed typography, visual language, messaging, audience. Own pipeline: homepage + type-labelled internal pages + stylesheet/SVG asset evidence. Nothing shared with /voice or /benchmark.",
    input: `{\n  "url": "https://example.com"\n  // or { "company": "stripe" } — resolved via TinyFish Search\n}`,
    tinyfish: "Fetch homepage (markdown+links+images+metadata, ttl=0 live) → discover type-labelled pages (about/product/pricing/docs/help/blog/brand) → Fetch them → Fetch HTML → parse the site's own stylesheets, SVG fills, theme-color, webfont links for palette + font + logo evidence.",
    output: `{\n  "brand": { "name": "", "website": "", "description": "", "tagline": "" },\n  "logo": { "url": "", "type": "svg|png|favicon|…", "reason": "", "confidence": 0 },\n  "colors": [{ "hex": "", "rgb": "", "usage": "Primary|…", "source": "", "evidence": "" }],\n  "typography": { "heading": { "family": "", "weights": [] }, "body": {} },\n  "confidence": { "overall": 0, "evidenceCoverage": 0 },\n  "sources": [{ "url": "", "pageType": "homepage|about|…" }]\n}`,
  },
  {
    name: "POST /api/brand/voice",
    purpose: "Independent multi-page copy analysis — personality, formality, technical level, persuasion, recurring phrases with per-quote page sources, evidence-backed words-to-use/avoid. Different pages, different metrics, different output from /extract.",
    input: `{\n  "url": "https://example.com"\n}`,
    tinyfish: "Separate Fetch pass: homepage + up to 8 type-labelled internal pages (copy-heavy bias); n-gram repetition, CTA lexicon scan, register metrics — with per-page provenance on every example.",
    output: `{\n  "voice": { "overall": "", "personality": [], "formality": "", "technicalLevel": "" },\n  "messaging": { "corePromise": "", "recurringPhrases": [], "ctaStyle": "", "wordsToAvoid": [] },\n  "examples": [{ "original": "", "analysis": "", "source": "" }]\n}`,
  },
  {
    name: "POST /api/brand/benchmark",
    purpose: "Independent competitor workflow — categorizes target from observed copy, discovers competitors via Search, resolves listicles to OFFICIAL homepages (never listed as competitors), fetches each, returns per-competitor intelligence + target-vs-competitors matrix + honest failures.",
    input: `{\n  "url": "https://example.com"\n}`,
    tinyfish: "Fetch target → category from observed copy → 3 Search discovery queries → mine listicle outbound links for official domains (discovery evidence only) → Fetch each official homepage → compare positioning, audience, messaging, visuals, voice, CTAs.",
    output: `{\n  "targetBrand": "",\n  "competitors": [{ "name": "", "website": "", "category": "", "positioning": "",\n    "targetAudience": "", "headline": "", "voice": "", "ctaStyle": "",\n    "majorColors": [], "typography": "", "differentiatorsVsTarget": [],\n    "evidence": [], "confidence": 0 }],\n  "comparison": { "rows": [{ "dimension": "", "target": "", "competitors": [] }] },\n  "failures": [{ "website": "", "reason": "" }]\n}`,
  },
];

export default function ApiDocs() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-14">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-black/50">Developer API</p>
      <h1 className="mt-3 font-serif text-5xl tracking-tight">Three endpoints. One live web.</h1>
      <p className="mt-4 max-w-2xl text-black/70">
        BrandForge uses TinyFish to access and inspect live websites instead of relying on a static database
        of brand information. All credentials stay server-side in <span className="font-mono text-sm">lib/tinyfish.ts</span> —
        nothing secret ever reaches the browser.
      </p>
      <div className="mt-8 space-y-6">
        {ENDPOINTS.map((e) => (
          <div key={e.name} className="border border-black/10 bg-white card-ring">
            <div className="border-b border-black/10 bg-black px-6 py-4 text-white">
              <p className="font-mono text-sm font-bold">{e.name}</p>
              <p className="mt-1 text-sm text-white/70">{e.purpose}</p>
            </div>
            <div className="grid gap-0 md:grid-cols-2">
              <div className="border-b border-black/10 p-6 md:border-b-0 md:border-r">
                <p className="font-mono text-[11px] uppercase tracking-widest text-black/50">Input</p>
                <pre className="code mt-2 overflow-x-auto bg-[#fafaf8] p-4">{e.input}</pre>
                <p className="mt-4 font-mono text-[11px] uppercase tracking-widest text-black/50">TinyFish usage</p>
                <p className="mt-2 text-sm leading-relaxed text-black/75">{e.tinyfish}</p>
              </div>
              <div className="p-6">
                <p className="font-mono text-[11px] uppercase tracking-widest text-black/50">Output (shape)</p>
                <pre className="code mt-2 overflow-x-auto bg-[#fafaf8] p-4">{e.output}</pre>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 border border-black/10 bg-white p-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-black/50">curl</p>
        <pre className="code mt-2 overflow-x-auto bg-[#0c0d10] p-4 text-white">{`curl -X POST https://your-deploy/api/brand/extract \\\n  -H "Content-Type: application/json" \\\n  -d '{"url":"https://stripe.com"}'`}</pre>
      </div>
    </main>
  );
}
