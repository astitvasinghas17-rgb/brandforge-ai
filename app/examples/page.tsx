import Generator from "@/components/Generator";

const BRANDS = [
  { name: "Stripe", url: "https://stripe.com", blurb: "Payments infrastructure for the internet." },
  { name: "Linear", url: "https://linear.app", blurb: "Purpose-built issue tracking for product teams." },
  { name: "Notion", url: "https://notion.so", blurb: "Connected workspace for docs, wikis, and projects." },
  { name: "Vercel", url: "https://vercel.com", blurb: "Frontend cloud platform — arbitrary-site proof beyond the big three." },
];

export default function ExamplesPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-14">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-black/50">Live demo · same pipeline, zero hardcoding</p>
      <h1 className="mt-3 font-serif text-5xl tracking-tight">Four brands, one engine.</h1>
      <p className="mt-4 max-w-2xl text-black/70">
        These URLs are <strong className="text-black">test inputs only</strong> — every data point in a generated
        guide is produced <strong className="text-black">live</strong> by the TinyFish extraction pipeline
        (<span className="font-mono text-sm">POST /api/brand/extract</span> + <span className="font-mono text-sm">/voice</span> + <span className="font-mono text-sm">/benchmark</span>).
        No brand data is hardcoded anywhere in BrandForge — paste any other URL and it works the same way.
        Each report&apos;s Evidence section (§11) shows exactly which live pages and providers produced it.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {BRANDS.map((b) => (
          <div key={b.name} className="border border-black/10 bg-white p-6 card-ring">
            <p className="font-serif text-2xl">{b.name}</p>
            <p className="mt-1 font-mono text-xs text-black/50">{b.url}</p>
            <p className="mt-3 text-sm text-black/75">{b.blurb}</p>
            <p className="mt-3 border-t border-black/10 pt-3 font-mono text-[11px] leading-relaxed text-black/60">generated live · evidence in §11</p>
            <a href={`/#generate`} className="mt-4 inline-block bg-black px-4 py-2 text-sm font-semibold text-white">Generate {b.name} guide →</a>
          </div>
        ))}
      </div>

      <div className="mt-12 border border-black/10 bg-white p-6 card-ring">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-black/50">Run one inline — live TinyFish extraction</p>
        <Generator initialUrl="https://stripe.com" />
      </div>
    </main>
  );
}
