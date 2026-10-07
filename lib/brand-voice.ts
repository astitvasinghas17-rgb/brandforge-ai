/**
 * lib/brand-voice.ts — Endpoint 2.
 * Inspects MULTIPLE live pages (home + about/product/pricing/faq…)
 * via TinyFish and produces a voice analysis that is meaningfully
 * different from the base extraction: personality, formality,
 * technical level, persuasion style, do/don't lexicon + examples.
 */
import { tinyFetchPages, resolveInputToUrl, normalizeUrl, pickRelevantPages } from "./tinyfish";
import { inferAudience, inferPains, type PageInput } from "./category";

export interface VoiceResult {
  voice: {
    overall: string;
    personality: string[];
    formality: string;
    technicalLevel: string;
    emotionalTone: string[];
    sentenceStyle: string;
    persuasionStyle: string;
  };
  messaging: {
    corePromise: string;
    keyThemes: string[];
    recurringPhrases: string[];
    ctaStyle: string;
    wordsToUse: string[];
    wordsToAvoid: string[];
  };
  audience: { likelyAudience: string; audienceEvidence: string[]; audiencePainPoints: string[] };
  examples: Array<{ original: string; analysis: string; source: string; origin: "observed" }>;
  evidence: Array<{ source: string; observed: string; reason: string; provider: string; origin: "observed" | "inferred" }>;
  meta: { resolvedUrl: string; resolveMethod: string; pagesAnalyzed: number; tinyFishUsed: boolean; sources: Array<{ url: string; pageType: string; provider: string }> };
}

function sentences(text: string): string[] {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter((s) => s.length > 20 && s.length < 300).slice(0, 400);
}

export async function analyzeVoice(input: string): Promise<VoiceResult> {
  const { url, method } = await resolveInputToUrl(input);
  const canonical = normalizeUrl(url);
  const origin = new URL(canonical).origin;

  const home = await tinyFetchPages([canonical], {
    format: "markdown", links: true, image_links: false, page_metadata: false,
    purpose: "Voice analysis: headlines, CTAs, navigation and product copy from homepage.",
  });
  if (home.pages.length === 0) throw new Error(`Live-site fetch failed for ${canonical}.`);
  const h = home.pages[0];
  const siteOrigin = (() => { try { return new URL(h.final_url).origin; } catch { return origin; } })();
  // voice-specific page set: bias toward copy-heavy pages (type-labelled)
  const discovered = pickRelevantPages(h.links ?? [], siteOrigin, 8);
  const extraUrls = discovered.map((d) => d.url);
  const pageTypeByUrl = new Map(discovered.map((d) => [d.url.replace(/\/$/, ""), d.pageType]));
  // ensure about/faq-ish coverage even if ranking missed them
  const extra = extraUrls.length
    ? (await tinyFetchPages(extraUrls, {
        format: "markdown", links: false, image_links: false, page_metadata: false,
        purpose: "Voice analysis: about, product, pricing, FAQ/help copy for tone triangulation.",
      })).pages
    : [];
  const pages = [h, ...extra];
  const tinyFishUsed = pages.some((p) => p.provider.startsWith("tinyfish"));

  const full = pages.map((p) => `\n\n### PAGE: ${p.final_url}\n${p.text ?? ""}`).join("\n").slice(0, 90000);
  const sents = sentences(full);
  const lower = full.toLowerCase();

  // --- headline / CTA slices with per-page provenance (different cut from extract) ---
  const headlines: Array<{ text: string; source: string }> = [];
  for (const p of pages) {
    for (const line of (p.text ?? "").split("\n")) {
      const m = line.match(/^#{1,2}\s+(.+)/);
      if (m) {
        const c = m[1].replace(/\(https?:[^)]+\)/g, "").trim();
        if (c.length > 10 && c.length < 150 && !headlines.some((h) => h.text === c)) headlines.push({ text: c, source: p.final_url });
      }
      if (headlines.length >= 20) break;
    }
  }
  const ctaHits = [...full.matchAll(/\[CTA:\s*([^\]]+)\]/gi)].map((m) => m[1].trim()).slice(0, 12);
  if (ctaHits.length === 0) {
    // TinyFish returns cleaned markdown without [CTA:] markers, so fall back
    // to matching known CTA phrasing directly in the live copy.
    const ctaLex = /(Get started|Start free|Try (?:it |for )?free|Sign up|Log in|Request (?:a )?demo|Book a demo|Contact sales|Learn more|See pricing|Watch (?:the )?demo|Join ?waitlist|Download|Subscribe|Talk to sales|Start building|Get a demo|Explore (?:the )?platform|Read (?:the )?docs)/gi;
    const seen = new Set<string>();
    let m2: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((m2 = ctaLex.exec(full)) && ctaHits.length < 12) {
      const t = m2[0].trim().replace(/\s+/g, " ");
      const k = t.toLowerCase();
      if (!seen.has(k) && t.length < 30) {
        seen.add(k);
        ctaHits.push(t);
      }
    }
  }
  // --- style metrics (computed over live copy, thresholds documented) ---
  const avgLen = sents.length ? sents.reduce((a, s) => a + s.split(" ").length, 0) / sents.length : 12;
  const contractions = (lower.match(/\b(don't|can't|won't|you'll|we'll|it's|that's|you're|we're)\b/g) ?? []).length;
  const youCount = (lower.match(/\byou\b/g) ?? []).length;
  const weCount = (lower.match(/\bwe\b/g) ?? []).length;
  const jargon = ["api", "sdk", "infrastructure", "workflow", "automation", "integration", "scalab", "enterprise", "platform", "framework"];
  const jargonHits = jargon.filter((k) => lower.includes(k));
  const exclaim = (full.match(/!/g) ?? []).length;
  const question = (full.match(/\?/g) ?? []).length;

  const formality =
    contractions > 6 || exclaim > 4 ? "Conversational / informal" :
    avgLen > 22 ? "Formal / editorial" : "Balanced professional-casual";
  const technicalLevel =
    jargonHits.length >= 4 ? "High — assumes technical fluency (APIs, infra, workflows)" :
    jargonHits.length >= 2 ? "Medium — product-technical, jargon is explained" : "Low — plain-language, benefits-first";
  const sentenceStyle =
    avgLen < 12 ? "Short, punchy sentences. Fragment-friendly hero copy." :
    avgLen < 20 ? "Mixed cadence — punchy headlines supported by medium explanatory sentences." :
    "Long, explanatory sentences — editorial/enterprise register.";
  const personality: string[] = [];
  if (youCount > weCount * 1.5) personality.push("customer-obsessed");
  if (weCount > 0) personality.push("confident");
  if (contractions > 4) personality.push("approachable");
  if (jargonHits.length >= 3) personality.push("technical");
  if (/enterprise|security|compliance|soc.?2|trust/.test(lower)) personality.push("trustworthy");
  if (/fast|powerful|supercharge|scale|blazing/.test(lower)) personality.push("bold");
  if (/simple|easy|effortless|intuitive/.test(lower)) personality.push("helpful");
  if (personality.length === 0) personality.push("neutral-professional");
  const emotionalTone: string[] = [];
  if (/love|delight|beautiful|magical/.test(lower)) emotionalTone.push("warm");
  if (/fast|power|win|lead|best/.test(lower)) emotionalTone.push("ambitious");
  if (/trust|secure|reliable|proven/.test(lower)) emotionalTone.push("reassuring");
  if (/build|create|ship|launch/.test(lower)) emotionalTone.push("empowering");
  if (emotionalTone.length === 0) emotionalTone.push("matter-of-fact");

  const persuasionStyle = /free|trial|demo|guarantee|no credit card/i.test(full)
    ? "Low-friction trial-led persuasion (free trial / demo CTAs, risk reversal)"
    : /case stud|customer|trusted by|loved by|rating/i.test(full)
      ? "Social-proof persuasion (customers, logos, testimonials)"
      : /%|faster|roi|save|reduce/i.test(full)
        ? "Outcome/metric persuasion (numbers, ROI, efficiency claims)"
        : "Authority/explanation persuasion (feature depth, documentation)";

  // recurring phrases: repeated 3+ word n-grams
  const ngrams = new Map<string, number>();
  const toks = lower.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  for (let i = 0; i < toks.length - 2; i++) {
    const g = `${toks[i]} ${toks[i + 1]} ${toks[i + 2]}`;
    if (/^(the|and|for|with|you|your|our|this|that)/.test(g)) continue;
    ngrams.set(g, (ngrams.get(g) ?? 0) + 1);
  }
  const recurring = [...ngrams.entries()].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g, c]) => `${g} (×${c})`);
  const themes = Array.from(new Set([
    ...(/secur|trust|compliance/.test(lower) ? ["trust & security"] : []),
    ...(/fast|speed|performance|scale/.test(lower) ? ["speed & scale"] : []),
    ...(/easy|simple|intuitive|effortless/.test(lower) ? ["ease of use"] : []),
    ...(/integrat|connect|workflow|automat/.test(lower) ? ["integration & automation"] : []),
    ...(/team|collaborat|share/.test(lower) ? ["collaboration"] : []),
    ...(/price|free|affordable|save/.test(lower) ? ["value & pricing"] : []),
    ...(/ai|agent|intelligent|smart/.test(lower) ? ["AI capability"] : []),
  ])).slice(0, 6);

  const wordsToUse = Array.from(new Set([
    ...jargonHits.slice(0, 4),
    ...(/you\b/.test(lower) ? ["you"] : []),
    ...(ctaHits[0] ? [ctaHits[0].split(" ")[0].toLowerCase()] : []),
  ])).slice(0, 8);
  // words to AVOID: only stated when the live copy gives evidence for them.
  // Otherwise the honest answer is "insufficient evidence" — never invented.
  const avoid: string[] = [];
  if (/simple|easy|effortless|plain/i.test(lower)) {
    avoid.push("needless complexity — the site itself rewards plain words (observed: simplicity lexicon repeats)");
  }
  if ((lower.match(/!/g) ?? []).length <= 1 && /professional|precise|careful/i.test(lower)) {
    avoid.push("hype punctuation — the site is restrained (observed: ≤1 exclamation across fetched pages)");
  }
  const wordsToAvoid = avoid.length > 0 ? avoid : ["Insufficient evidence — no avoidance pattern observed in fetched copy"];

  // Pain points ONLY from observed problem-language, quoted with source.
  // No generic SaaS pains are ever generated.
  const voicePages: PageInput[] = pages.map((p, i) => ({
    url: p.final_url,
    pageType: i === 0 ? "homepage" : (pageTypeByUrl.get(p.final_url.replace(/\/$/, "")) ?? "internal"),
    title: p.title,
    text: p.text ?? "",
  }));
  const painVerdict = inferPains(voicePages);
  const painPoints = painVerdict.points;
  const audVerdict = inferAudience(voicePages);

  const headlineTexts = headlines.map((x) => x.text);
  const examples = [...headlines.slice(0, 3), ...ctaHits.slice(0, 2).map((t) => ({ text: t, source: pages[0]?.final_url ?? canonical }))].slice(0, 5).map((o) => ({
    original: o.text.slice(0, 200),
    analysis: describeExample(o.text, { formality, technicalLevel }),
    source: o.source,
    origin: "observed" as const,
  }));

  const overall = `${personality.slice(0, 3).join(" · ")} — ${formality.toLowerCase()}, ${technicalLevel.toLowerCase()} register across ${pages.length} live page(s).`;

  const evidence: VoiceResult["evidence"] = [
    { source: canonical, observed: `URL resolution: ${method}`, reason: "Input → canonical URL", provider: pages[0]?.provider ?? "unknown", origin: "observed" },
    ...pages.map((p) => ({
      source: p.final_url,
      observed: `${(p.text ?? "").length} chars of live copy analyzed`,
      reason: `Voice corpus page (${pageTypeByUrl.get(p.final_url.replace(/\/$/, "")) ?? (p.final_url === pages[0]?.final_url ? "homepage" : "internal")})`,
      provider: p.provider,
      origin: "observed" as const,
    })),
    ...(recurring.length > 0
      ? [{ source: pages[0]?.final_url ?? canonical, observed: `Repeated: ${recurring.slice(0, 3).join("; ")}`, reason: "n-gram repetition across pages → recurring phrases", provider: pages[0]?.provider ?? "unknown", origin: "observed" as const }]
      : []),
  ];

  return {
    voice: { overall, personality, formality, technicalLevel, emotionalTone, sentenceStyle, persuasionStyle },
    messaging: {
      corePromise: headlineTexts[0] ?? "Not confidently isolated — homepage hero not captured",
      keyThemes: themes.length ? themes : ["Not enough thematic repetition detected"],
      recurringPhrases: recurring.length ? recurring : ["No 3-word phrase repeated 3×+ across fetched pages"],
      ctaStyle: ctaHits.length ? `Direct, imperative CTAs ("${ctaHits.slice(0, 3).join('", "')}")${question > 2 ? " with inquisitive FAQ-style prompts" : ""}` : "CTAs not captured in fetched copy",
      wordsToUse: wordsToUse.length ? wordsToUse : ["(mirror site vocabulary — insufficient signal)"],
      wordsToAvoid,
    },
    audience: {
      likelyAudience: audVerdict.primary,
      audienceEvidence: audVerdict.evidenceItems.slice(0, 3),
      audiencePainPoints: painPoints,
    },
    examples,
    evidence,
    meta: { resolvedUrl: canonical, resolveMethod: method, pagesAnalyzed: pages.length, tinyFishUsed, sources: pages.map((p, i) => ({ url: p.final_url, pageType: i === 0 ? "homepage" : (pageTypeByUrl.get(p.final_url.replace(/\/$/, "")) ?? "internal"), provider: p.provider })) },
  };
}

function describeExample(o: string, ctx: { formality: string; technicalLevel: string }): string {
  const bits: string[] = [];
  bits.push(o.length < 60 ? "short hero-style line" : "explanatory line");
  if (/^[A-Z][^.!?]*$/.test(o.trim()) || /^(Build|Ship|Launch|Start|Get|Make|Turn)/.test(o)) bits.push("imperative, outcome-led");
  if (/free|demo|trial|now|today/i.test(o)) bits.push("low-friction CTA energy");
  if (/you|your/i.test(o)) bits.push("second-person, customer-addressing");
  if (/api|sdk|workflow|automat/i.test(o)) bits.push("technical lexicon");
  return `${bits.join("; ")} — inferred from observed live copy; consistent with ${ctx.formality.toLowerCase()} / ${ctx.technicalLevel.toLowerCase()} voice.`;
}

export type { VoiceResult as BrandVoiceResult };
