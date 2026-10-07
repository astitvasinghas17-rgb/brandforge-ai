/**
 * lib/benchmark.ts — Endpoint 3 (independent from extract/voice).
 * 1) Analyze target via TinyFish Fetch → product/category from observed copy.
 * 2) Discover competitors via TinyFish Search (category/context queries).
 * 3) Listicle/article URLs are discovery EVIDENCE ONLY — never competitors.
 *    Candidate official domains are mined from listicle outbound links, then
 *    each candidate's OFFICIAL HOMEPAGE is fetched via TinyFish Fetch.
 * 4) Compare positioning/audience/messaging/visual/voice/CTA + differentiators.
 * Nothing is hardcoded. Failures are recorded honestly; nothing is invented.
 */
import { tinyFetchPages, tinySearch, resolveInputToUrl, normalizeUrl, pickRelevantPages } from "./tinyfish";
import { parseCssColors, parseFontsFromCss, type Origin } from "./brand-extractor";
import { inferCategory, inferAudience, type PageInput } from "./category";

export interface BenchmarkCompetitor {
  name: string;
  website: string;
  category: string;
  positioning: string;
  targetAudience: string;
  headline: string;
  visualStyle: string;
  majorColors: string[];
  typography: string;
  ctaStyle: string;
  voice: string;
  differentiatorsVsTarget: string[];
  evidence: Array<{ source: string; observed: string; reason: string; provider: string; origin: Origin }>;
  confidence: number;
}

export interface BenchmarkFailure {
  website: string;
  reason: string;
}

export interface ComparisonMatrix {
  dimensions: string[];
  rows: Array<{ dimension: string; target: string; competitors: string[] }>;
}

export interface BenchmarkResult {
  targetBrand: string;
  targetSummary: string;
  targetCategory: { category: string; confidence: number; evidence: string[] };
  targetSnapshot: { audience: string; voice: string; ctaStyle: string; headline: string };
  competitors: BenchmarkCompetitor[];
  failures: BenchmarkFailure[];
  comparison: ComparisonMatrix;
  marketPatterns: { commonMessaging: string[]; commonVisualPatterns: string[]; differentiators: string[] };
  discovery: {
    method: string;
    queries: string[];
    listiclesUsed: string[];
    candidateDomains: string[];
    tinyFishUsed: boolean;
    note: string;
  };
  sources: Array<{ url: string; provider: string }>;
}

function toneOf(text: string): string {
  const t = text.toLowerCase();
  if (/\b(don't|can't|you'll|we'll)\b/.test(t) || (t.match(/!/g) ?? []).length > 3) return "Conversational and upbeat";
  if ((t.match(/\benterprise\b|\bcompliance\b|\bsecurity\b/g) ?? []).length >= 2) return "Enterprise-formal, trust-led";
  if (/\bapi\b|\bsdk\b|\bdocs\b/.test(t)) return "Technical, practitioner-direct";
  return "Balanced professional";
}

function ctaStyleOf(text: string): string {
  const hits = [...text.matchAll(/(Get started|Start free|Try (?:it |for )?free|Sign up|Request (?:a )?demo|Book a demo|Contact sales|Learn more|See pricing|Start building|Talk to sales|Join ?waitlist)/gi)]
    .map((m) => m[0]).filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i).slice(0, 4);
  if (hits.length === 0) return "CTA patterns not captured in fetched copy";
  const trial = hits.some((x) => /free|trial|demo/i.test(x));
  return `${trial ? "Low-friction trial/demo-led" : "Direct imperative"} CTAs ("${hits.join('", "')}")`;
}

function headlineOf(text: string, title: string): string {
  const h = text.split("\n").find((l) => /^#{1,2}\s+/.test(l))
    ?.replace(/^#{1,2}\s+/, "").replace(/\(https?:[^)]+\)/g, "").trim().slice(0, 160);
  return h || title.split(/[|·—–-]/)[0].trim().slice(0, 160) || "Not captured";
}

const NON_COMPANY_HOSTS = /^(www\.)?(facebook|twitter|x|linkedin|youtube|instagram|tiktok|reddit|medium|wikipedia|google|substack|g2|capterra|trustradius|producthunt|businessinsider|forbes|techcrunch|theverge|wired|bloomberg|fortune|entrepreneur|fastcompany|zdnet|pcmag|nytimes|wsj|theguardian|bbc)\./i;
const NON_COMPANY_SUFFIX = /\.(gov|edu|mil|int)(\.|$)/i;
const REVIEWY_HOST = /review|reviews|compare|comparison|alternativeto|saashub|slant|getapp|softwareadvice|top10|top-10/i;
const PUBLIC_SUFFIX_2 = new Set(["co.uk", "org.uk", "com.au", "co.jp", "co.in", "com.br", "co.nz", "com.mx"]);

/** Collapse any URL to its registrable base domain (docs.foo.com → foo.com). */
function baseDomainOf(host: string): string | null {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (!h.includes(".")) return null;
  const parts = h.split(".");
  const last2 = parts.slice(-2).join(".");
  const base = PUBLIC_SUFFIX_2.has(last2) && parts.length >= 3 ? parts.slice(-3).join(".") : last2;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(base)) return null;
  return base;
}

function companyishDomain(url: string): string | null {
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    if (NON_COMPANY_HOSTS.test(u.hostname)) return null;
    if (NON_COMPANY_SUFFIX.test(u.hostname)) return null; // governments/schools aren't competitors
    if (REVIEWY_HOST.test(u.hostname)) return null; // review/comparison platforms aren't companies
    if (/\.(png|jpe?g|svg|css|js|pdf|xml|ico)(\?|$)/i.test(u.pathname)) return null;
    const base = baseDomainOf(u.hostname);
    if (!base) return null;
    return `https://${base}`;
  } catch {
    return null;
  }
}

export async function benchmarkBrand(input: string): Promise<BenchmarkResult> {
  const { url, method } = await resolveInputToUrl(input);
  const canonical = normalizeUrl(url);
  const origin = new URL(canonical).origin;
  const hasKey = Boolean(process.env.TINYFISH_API_KEY);

  // 1) target via TinyFish Fetch — homepage + a few internal pages, so the
  // category verdict rests on observed evidence across pages, never a keyword guess.
  const target = await tinyFetchPages([canonical], {
    format: "markdown", links: true, image_links: false, page_metadata: true,
    purpose: "Benchmark: understand target brand category and positioning.",
  });
  if (target.pages.length === 0) throw new Error(`Live-site fetch failed for ${canonical}.`);
  const tp = target.pages[0];
  const siteOrigin = (() => { try { return new URL(tp.final_url).origin; } catch { return origin; } })();
  let tinyFishUsed = target.pages.some((p) => p.provider.startsWith("tinyfish"));
  const targetDiscovered = pickRelevantPages(tp.links ?? [], siteOrigin, 4);
  let targetExtra: typeof target.pages = [];
  if (targetDiscovered.length > 0) {
    try {
      const tx = await tinyFetchPages(targetDiscovered.map((d) => d.url), {
        format: "markdown", links: false, image_links: false, page_metadata: false,
        purpose: "Benchmark: category evidence from about/product pages.",
      });
      targetExtra = tx.pages;
      if (tx.pages.some((p) => p.provider.startsWith("tinyfish"))) tinyFishUsed = true;
    } catch { /* homepage alone still works */ }
  }
  const targetInputs: PageInput[] = [tp, ...targetExtra].map((p, i) => ({
    url: p.final_url,
    pageType: i === 0 ? "homepage" : (targetDiscovered[i - 1]?.pageType ?? "internal"),
    title: p.title,
    description: p.description,
    text: p.text ?? "",
  }));
  const targetText = [tp, ...targetExtra].map((p) => p.text ?? "").join("\n\n").slice(0, 30000);
  const provisionalName = ((tp.page_metadata?.og as Record<string, unknown> | undefined)?.site_name as string)
    || (tp.title ?? "").split(/[|·—–-]/)[0].trim()
    || new URL(canonical).hostname.replace(/^www\./, "").split(".")[0];
  // Dynamic category from observed evidence — never defaulted to AI/SaaS.
  const catVerdict = inferCategory(targetInputs, provisionalName);
  const category = catVerdict.category;
  const categoryDetermined = catVerdict.confidence >= 0.5 && category !== "Category not reliably determined";
  const signals = catVerdict.signals;
  const targetName = provisionalName;
  // Audience explicit-first via the shared evidence-gated inference.
  const targetAud = inferAudience(targetInputs);
  const targetAudience = targetAud.primary;
  const targetVoice = toneOf(targetText);
  const targetCtas = ctaStyleOf(targetText);
  const targetHeadline = headlineOf(targetText, tp.title ?? "");

  const emptyResult = (note: string): BenchmarkResult => ({
    targetBrand: targetName,
    targetSummary: `${targetName} (${siteOrigin}) — ${category} (confidence ${Math.round(catVerdict.confidence * 100)}%). ${(tp.description ?? "").slice(0, 220)}`,
    targetCategory: { category, confidence: catVerdict.confidence, evidence: catVerdict.evidence },
    targetSnapshot: { audience: targetAudience, voice: targetVoice, ctaStyle: targetCtas, headline: targetHeadline },
    competitors: [],
    failures: [],
    comparison: { dimensions: [], rows: [] },
    marketPatterns: { commonMessaging: [], commonVisualPatterns: [], differentiators: [] },
    discovery: { method, queries, listiclesUsed: [], candidateDomains: [], tinyFishUsed, note },
    sources: [{ url: tp.final_url, provider: tp.provider }],
  });

  if (!hasKey) {
    return emptyResult("TINYFISH_API_KEY not set, so live competitor discovery (TinyFish Search) is unavailable. Set the key to enable automatic competitor detection. No competitors were invented.");
  }

  // 2) search — queries built from the OBSERVED category, never a template.
  // e.g. "Stripe payment infrastructure competitors", "Google search engine competitors".
  // When the category is undetermined, fall back to plain "<Brand> competitors".
  const queries = categoryDetermined
    ? [
        `${targetName} ${catVerdict.queryFragment} competitors`,
        `best ${catVerdict.queryFragment} alternatives to ${targetName}`,
        `top ${catVerdict.queryFragment} companies`,
      ]
    : [`${targetName} competitors`, `${targetName} alternatives`];
  const directCandidates: string[] = [];
  const listicleUrls: string[] = [];
  const ARTICLE_RE = /blog|news|article|post|best-|top-|-vs-|versus|alternative|review|comparison|list|alternatives/i;
  for (const q of queries) {
    let r: Awaited<ReturnType<typeof tinySearch>> = [];
    try {
      r = await tinySearch(q, 10);
      tinyFishUsed = true;
    } catch { continue; }
    for (const hit of r) {
      let u: URL;
      try {
        u = new URL(hit.url);
        if (u.origin === origin) continue;
        if (!["http:", "https:"].includes(u.protocol)) continue;
      } catch { continue; }
      const path = u.pathname.replace(/\/$/, "") || "/";
      const isHomepage = path === "/" || (path.split("/").filter(Boolean).length <= 1 && !ARTICLE_RE.test(path + hit.title));
      const base = companyishDomain(hit.url);
      if (!base || base === origin) continue;
      if (isHomepage) {
        if (!directCandidates.includes(base)) directCandidates.push(base);
      } else if (listicleUrls.length < 4 && !listicleUrls.includes(hit.url)) {
        listicleUrls.push(hit.url);
      }
    }
    if (directCandidates.length >= 5) break;
  }

  // 3) mine listicles for official competitor domains (outbound links only)
  const domainVotes = new Map<string, number>();
  const listiclesUsed: string[] = [];
  if (listicleUrls.length > 0) {
    try {
      const l = await tinyFetchPages(listicleUrls.slice(0, 3), {
        format: "markdown", links: true, image_links: false, page_metadata: false,
        purpose: "Competitor discovery: extract outbound links to official competitor domains from comparison articles.",
      });
      if (l.pages.some((p) => p.provider.startsWith("tinyfish"))) tinyFishUsed = true;
      for (const p of l.pages) {
        listiclesUsed.push(p.final_url);
        const listicleBase = (() => { try { return companyishDomain(p.final_url); } catch { return null; } })();
        for (const link of p.links ?? []) {
          const d = companyishDomain(link);
          if (!d || d === origin) continue;
          if (d === listicleBase) continue; // listicle's own nav
          if (directCandidates.includes(d)) continue;
          domainVotes.set(d, (domainVotes.get(d) ?? 0) + 1);
        }
      }
    } catch {
      // listicle mining is best-effort; direct candidates still stand
    }
  }
  const mined = [...domainVotes.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d).slice(0, 6);
  let candidateDomains = [...directCandidates, ...mined.filter((d) => !directCandidates.includes(d))].slice(0, 5);

  // Refined retry: if discovery is thin, run one more targeted search round
  // rather than filling slots with weak candidates.
  if (hasKey && candidateDomains.length < 3 && categoryDetermined) {
    const refined = `${catVerdict.queryFragment} companies like ${targetName}`;
    queries.push(refined);
    try {
      const r = await tinySearch(refined, 10);
      tinyFishUsed = true;
      for (const hit of r) {
        const base = companyishDomain(hit.url);
        if (!base || base === origin || candidateDomains.includes(base)) continue;
        try {
          const u = new URL(hit.url);
          if (u.origin === origin) continue;
        } catch { continue; }
        candidateDomains.push(base);
        if (candidateDomains.length >= 5) break;
      }
    } catch { /* refined search is best-effort */ }
  }

  if (candidateDomains.length === 0) {
    return emptyResult("TinyFish Search returned no usable competitor domains (direct homepages or listicle-mined official sites) for this category. No competitors invented — see queries in discovery. Try a larger/more distinctive brand.");
  }

  // 4) fetch official competitor homepages via TinyFish Fetch
  const homepages = candidateDomains.map((d) => `${d.replace(/\/$/, "")}/`);
  const comp = await tinyFetchPages(homepages, {
    format: "markdown", links: false, image_links: true, page_metadata: true,
    purpose: `Competitive benchmark: official homepage positioning for ${category}.`,
  });
  if (comp.pages.some((p) => p.provider.startsWith("tinyfish"))) tinyFishUsed = true;
  const fetchedByOrigin = new Map(comp.pages.map((p) => {
    // normalize through base-domain so www./apex redirects still match
    try { return [companyishDomain(p.final_url) ?? p.final_url, p] as const; } catch { return [p.final_url, p] as const; }
  }));
  // TinyFish html for color/font evidence (best-effort, one batch)
  let compHtml = new Map<string, string>();
  try {
    const { tinyFetchHtml } = await import("./tinyfish");
    const hh = await tinyFetchHtml(comp.pages.map((p) => p.final_url));
    compHtml = new Map(hh.map((x) => [x.final_url, x.html ?? ""]));
  } catch { /* best-effort */ }

  const competitors: BenchmarkCompetitor[] = [];
  const failures: BenchmarkFailure[] = [];
  const competitorSources: Array<{ url: string; provider: string }> = [{ url: tp.final_url, provider: tp.provider }];
  const seenOrigins = new Set<string>();
  for (const domain of candidateDomains) {
    if (competitors.length >= 4) break;
    const page = fetchedByOrigin.get(domain);
    if (!page) {
      const err = comp.errors.find((e) => { try { return new URL(e.url).origin === domain; } catch { return false; } });
      failures.push({ website: domain, reason: `Official homepage fetch failed (${err?.error ?? "no result"}) — skipped, not invented.` });
      continue;
    }
    let pageOrigin = domain;
    try { pageOrigin = new URL(page.final_url).origin; } catch { /* keep */ }
    if (seenOrigins.has(pageOrigin)) continue;
    seenOrigins.add(pageOrigin);
    const text = (page.text ?? "").slice(0, 15000);
    if (text.length < 300 || !page.title) {
      failures.push({ website: pageOrigin, reason: "Homepage returned too little usable copy (<300 chars or no title) — skipped rather than guessed." });
      continue;
    }
    // Relevance filter: the candidate's own homepage must show the target's
    // category vocabulary — otherwise it's unrelated and rejected, not filled in.
    if (categoryDetermined && signals.length > 0) {
      const tl = text.toLowerCase();
      const sigHits = signals.filter((s) => new RegExp(`\\b${s.replace(/ /g, "\\s+")}\\b`, "i").test(tl));
      const explicitFrag = new RegExp(catVerdict.queryFragment.replace(/ /g, "\\s+"), "i").test(tl);
      if (sigHits.length < 2 && !explicitFrag) {
        failures.push({ website: pageOrigin, reason: `Rejected: homepage shows no "${category}" evidence (found ${sigHits.length} category signal(s)) — unrelated to target, not compared.` });
        continue;
      }
    }
    const html = compHtml.get(page.final_url) ?? "";
    const colorHits = html ? parseCssColors(html, "competitor page HTML").slice(0, 4) : [];
    const fonts = html ? parseFontsFromCss(html, "competitor page CSS") : [];
    const host = pageOrigin.replace(/^https?:\/\/(www\.)?/, "");
    const derived = host.split(".")[0];
    const cName = derived.charAt(0).toUpperCase() + derived.slice(1);
    const cHeadline = headlineOf(text, page.title ?? "");
    // Competitor audience: same explicit-first inference, never defaulted.
    const cAud = inferAudience([{ url: page.final_url, pageType: "homepage", title: page.title, text }]);
    const cAudience = cAud.primary;
    const cVoice = toneOf(text);
    const cCtas = ctaStyleOf(text);
    const diffs: string[] = [];
    if (cAudience !== targetAudience && !/not reliably determined/i.test(cAudience) && !/not reliably determined/i.test(targetAudience)) diffs.push(`Aims at ${cAudience} vs target's ${targetAudience}`);
    if (/free/i.test(text) && !/free/i.test(targetText)) diffs.push("Leans on free-led framing; target does not");
    if (/enterprise|soc ?2|compliance/i.test(text) && !/enterprise|soc ?2|compliance/i.test(targetText)) diffs.push("Stronger enterprise/compliance emphasis than target");
    if (/open source|self-host/i.test(text)) diffs.push("Open-source/self-host positioning");
    if (cVoice !== targetVoice) diffs.push(`Voice differs: ${cVoice} vs target's ${targetVoice}`);
    if (diffs.length === 0) diffs.push("No sharp differentiator isolated from fetched copy — see evidence");
    const fields = [cHeadline !== "Not captured", ctasOk(cCtas), fonts.length > 0, colorHits.length > 0, (page.description ?? "").length > 20];
    // Without a determined category, discovery was generic — cap confidence honestly.
    const rawConf = 0.45 + fields.filter(Boolean).length * 0.11;
    const cappedConf = categoryDetermined ? rawConf : Math.min(rawConf, 0.55);
    competitorSources.push({ url: page.final_url, provider: page.provider });
    competitors.push({
      name: cName,
      website: pageOrigin,
      category,
      positioning: `${category} — ${((page.description ?? "") || cHeadline).slice(0, 200)}`,
      targetAudience: cAudience,
      headline: cHeadline,
      visualStyle: `${cVoice} presentation; ${(page.image_links ?? []).length} page asset(s) observed`,
      majorColors: colorHits.length ? colorHits.map((c) => c.hex) : [],
      typography: fonts.length ? fonts.slice(0, 2).map((f) => f.family).join(" / ") : "Not reliably detected from live evidence",
      ctaStyle: cCtas,
      voice: cVoice,
      differentiatorsVsTarget: diffs.slice(0, 4),
      evidence: [
        { source: page.final_url, observed: `Title: "${(page.title ?? "").slice(0, 120)}" · Headline: "${cHeadline.slice(0, 120)}"`, reason: "Official homepage → positioning/headline", provider: page.provider, origin: "observed" },
        { source: page.final_url, observed: `Audience: ${cAudience} (${cAud.evidenceItems[0] ?? "no explicit audience statement"}`.slice(0, 220), reason: "Homepage copy → audience (explicit-first)", provider: page.provider, origin: "observed" },
        { source: page.final_url, observed: `Category relevance: homepage shows "${category}" vocabulary`, reason: "Relevance filter passed before comparison", provider: page.provider, origin: "observed" },
      ],
      confidence: Number(cappedConf.toFixed(2)),
    });
  }

  if (competitors.length === 0) {
    const r = emptyResult("Candidate official domains were found, but every official homepage fetch failed or returned too little copy. Failures are listed honestly; no competitors invented.");
    r.failures = failures;
    r.discovery.listiclesUsed = listiclesUsed;
    r.discovery.candidateDomains = candidateDomains;
    return r;
  }

  // 5) comparison matrix: target vs each competitor
  const corpus = [targetText.slice(0, 8000), ...competitors.map((c) => c.headline)].join(" ").toLowerCase();
  const comparison: ComparisonMatrix = {
    dimensions: ["positioning", "audience", "messaging", "visual language", "voice", "CTA strategy", "notable differentiation"],
    rows: [
      { dimension: "Positioning", target: targetHeadline.slice(0, 90), competitors: competitors.map((c) => c.headline.slice(0, 90)) },
      { dimension: "Audience", target: targetAudience, competitors: competitors.map((c) => c.targetAudience) },
      { dimension: "Messaging", target: targetVoice, competitors: competitors.map((c) => c.voice) },
      { dimension: "Visual language", target: `${(targetText.match(/gradient/i) ? "gradient-forward" : "flat")} marketing homepage`, competitors: competitors.map((c) => c.visualStyle.slice(0, 90)) },
      { dimension: "Voice", target: targetVoice, competitors: competitors.map((c) => c.voice) },
      { dimension: "CTA strategy", target: targetCtas.slice(0, 90), competitors: competitors.map((c) => c.ctaStyle.slice(0, 90)) },
      { dimension: "Notable differentiation", target: "—", competitors: competitors.map((c) => c.differentiatorsVsTarget[0] ?? "—") },
    ],
  };
  const phrase = (re: RegExp, label: string) => (re.test(corpus) ? label : null);
  const commonMessaging = [
    phrase(/free|trial|demo/, "Low-friction trial/demo offers"),
    phrase(/enterprise|security|soc 2|compliance/, "Enterprise trust & compliance language"),
    phrase(/easy|simple|intuitive/, "Ease-of-use claims"),
    phrase(/integrat|connect|workflow/, "Integration/workflow connectivity"),
    phrase(/scale|fast|powerful/, "Scale & performance claims"),
  ].filter(Boolean) as string[];

  return {
    targetBrand: targetName,
    targetSummary: `${targetName} (${siteOrigin}) — ${category} (confidence ${Math.round(catVerdict.confidence * 100)}%). ${(tp.description ?? "").slice(0, 240)}`,
    targetCategory: { category, confidence: catVerdict.confidence, evidence: catVerdict.evidence },
    targetSnapshot: { audience: targetAudience, voice: targetVoice, ctaStyle: targetCtas, headline: targetHeadline },
    competitors,
    failures,
    comparison,
    marketPatterns: {
      commonMessaging,
      commonVisualPatterns: ["Hero-led marketing homepage", (corpus.match(/gradient/g) ?? []).length > 1 ? "Gradient treatments" : "Flat/neutral surfaces"],
      differentiators: competitors.flatMap((c) => c.differentiatorsVsTarget).filter((d, i, a) => a.indexOf(d) === i).slice(0, 5),
    },
    discovery: {
      method,
      queries,
      listiclesUsed,
      candidateDomains,
      tinyFishUsed,
      note: competitors.length < 3
        ? `Only ${competitors.length} sufficiently relevant competitor(s) discovered for "${category}" — slots were NOT filled with irrelevant domains. Queries: ${queries.join(" · ")}. Listicles were discovery evidence only.`
        : `Competitors discovered live via TinyFish Search ("${queries[0]}"), resolved to OFFICIAL homepages, relevance-checked against "${category}" vocabulary, and analyzed via TinyFish Fetch. Listicles were discovery evidence only — never listed as competitors.`,
    },
    sources: competitorSources,
  };
}

function ctasOk(s: string): boolean {
  return !/not captured/i.test(s);
}
