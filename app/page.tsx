import Generator from "@/components/Generator";

export default function Home() {
  return (
    <main>
      {/* HERO */}
      <section className="editorial-grid border-b border-black/10">
        <div className="mx-auto max-w-6xl px-6 pb-14 pt-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-black/50">
            BrandForge AI · TinyFish Technical Bounty 001
          </p>
          <h1 className="mt-4 max-w-3xl font-serif text-5xl leading-[1.05] tracking-tight md:text-6xl">
            Extract a brand&apos;s identity from the live web.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-black/70">
            BrandForge uses <strong className="text-black">TinyFish Fetch + Search</strong> to inspect a company&apos;s
            live website — content, metadata, navigation, visual assets, CSS and font signals — then transforms
            raw evidence into structured brand intelligence a marketer, designer, developer, or AI system can reuse.
          </p>
          <Generator />
          <p className="mt-4 font-mono text-xs text-black/45">
            URL → TinyFish → Live Website → Evidence → Brand Intelligence → Structured Brand Guide
          </p>
        </div>
      </section>

      {/* HOW */}
      <section id="how" className="border-b border-black/10 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 md:grid-cols-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/50">How it works</p>
            <h2 className="mt-2 font-serif text-3xl tracking-tight">Evidence first.<br />Never invented.</h2>
            <p className="mt-3 text-sm leading-relaxed text-black/70">
              Every color, font, message, and audience claim links back to a live observation.
              Confidence scores say how sure we are — and &ldquo;Not detected&rdquo; is always preferred to hallucination.
            </p>
          </div>
          <div className="space-y-3 text-sm">
            {[
              ["TinyFish Fetch (homepage)", "Clean markdown + outbound links + image URLs + page metadata (favicon, og tags), ttl=0 for a live read."],
              ["Page discovery", "Same-origin about / product / pricing / help pages are ranked and fetched — beyond the homepage."],
              ["TinyFish Fetch (HTML)", "Raw HTML evidence for CSS color declarations, font-family stacks, webfont links, logo candidates."],
              ["TinyFish Search", "Company-name → official URL resolution, plus live competitor discovery for benchmarking."],
            ].map(([t, d]) => (
              <div key={t} className="border border-black/10 bg-[#fafaf8] p-4">
                <p className="font-mono text-xs font-bold">{t}</p>
                <p className="mt-1 text-black/70">{d}</p>
              </div>
            ))}
          </div>
          <div className="space-y-3 text-sm">
            <div className="border border-black bg-black p-5 text-white">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">Three independent endpoints</p>
              <ul className="mt-2 space-y-1 font-mono text-xs">
                <li>POST /api/brand/extract — full identity</li>
                <li>POST /api/brand/voice — multi-page voice</li>
                <li>POST /api/brand/benchmark — live competitors</li>
              </ul>
              <a href="/api-docs" className="mt-3 inline-block bg-white px-3 py-1.5 font-mono text-xs font-bold text-black">Read API docs →</a>
            </div>
            <div className="border border-black/10 p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/50">Bounty proof</p>
              <ul className="mt-2 space-y-1 text-[13px]">
                {["Works from URL", "Works from company name (TinyFish Search resolution)", "TinyFish Fetch performs live website extraction", "TinyFish Search performs discovery when needed", "Multi-page extraction (type-labelled internal pages)", "Evidence-backed results (Observed / Inferred labels)", "Structured reusable JSON (+ Markdown/HTML exports)", "Three independent meaningful endpoints", "Competitor discovery is dynamic (official domains only)", "Tested live: Stripe, Linear, Notion, Vercel", "JSON / Markdown / HTML exports carry real data", "No hardcoded brand results", "Confidence-aware extraction", "Graceful “Not detected” behavior — never invented"].map((x) => (
                  <li key={x}>✓ {x}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* API strip */}
      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-serif text-3xl tracking-tight">Built for teams <em className="italic">and</em> machines.</h2>
          <a href="/examples" className="border border-black px-4 py-2 text-sm font-semibold hover:bg-black hover:text-white">See example brands →</a>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[["For marketers", "Positioning, voice, CTAs, do/don't guidance — grounded in the site's own words."], ["For designers & devs", "Palette HEX/RGB with copy buttons, font stacks with evidence, logo candidates with confidence."], ["For AI systems", "Clean schemaVersion'd JSON export — drop it straight into prompts, themes, or pipelines."]].map(([t, d]) => (
            <div key={t} className="border border-black/10 bg-white p-5 card-ring">
              <p className="font-semibold">{t}</p>
              <p className="mt-1 text-sm text-black/70">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
