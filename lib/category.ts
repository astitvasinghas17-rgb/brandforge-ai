/**
 * lib/category.ts — evidence-gated inference shared by extract/voice/benchmark.
 *
 * Anti-template rule: NOTHING here defaults to "AI SaaS" / "SaaS" /
 * "Enterprise buyers" / "Developers". Every label requires observed support
 * from the live site (titles, meta, headings, nav labels, page copy), and
 * carries its evidence with it. Weak support → "not reliably determined".
 */
import type { Origin } from "./brand-extractor";

export interface PageInput {
  url: string;
  pageType: string;
  title?: string | null;
  description?: string | null;
  text: string;
}

export interface CategoryVerdict {
  category: string;
  confidence: number;
  evidence: string[];
  queryFragment: string; // e.g. "payment infrastructure" for "<Brand> <fragment> competitors"
  signals: string[]; // observable vocabulary used to relevance-check competitors
}

/** Broad, non-SaaS-centric category space. Order matters only for tie-breaks. */
const CATEGORIES: Array<{ name: string; fragment: string; patterns: RegExp[]; vocab: string[] }> = [
  { name: "Search", fragment: "search engine", patterns: [/search engine/i, /\bweb search\b/i, /search the web/i, /organiz\w+.{0,30}world'?s information/i], vocab: ["search", "search engine", "results", "query"] },
  { name: "Consumer Internet", fragment: "consumer internet service", patterns: [/for everyone/i, /people (use|love)/i, /billions of (people|users)/i], vocab: ["users", "people", "free", "app", "download"] },
  { name: "Financial Technology", fragment: "payment infrastructure", patterns: [/payment(s)? infrastructure/i, /financial (infrastructure|services|platform)/i, /\bbilling\b/i, /accept payments/i, /money movement/i], vocab: ["payment", "billing", "checkout", "transaction", "payout", "financial"] },
  { name: "Developer Tools", fragment: "developer tools", patterns: [/developer platform/i, /built for developers/i, /\bSDK\b/, /\bAPI-first\b/i, /for developers/i], vocab: ["api", "sdk", "developer", "docs", "deploy", "code"] },
  { name: "Project Management", fragment: "project management software", patterns: [/issue(s)? (tracking|triage|management)/i, /project (planning|tracking|management)/i, /\bkanban\b/i, /product development/i, /planning and building/i], vocab: ["project", "task", "issue", "sprint", "workflow", "roadmap"] },
  { name: "Productivity", fragment: "productivity workspace", patterns: [/connected workspace/i, /productivity/i, /notes? (app|software)/i, /\bwiki(s)?\b/i, /docs, .{0,20}projects/i], vocab: ["notes", "docs", "workspace", "wiki", "productivity", "organize"] },
  { name: "E-commerce", fragment: "e-commerce platform", patterns: [/e-?commerce/i, /storefront/i, /online store/i, /\bshop\b.*\bplatform\b/i], vocab: ["store", "shop", "cart", "checkout", "merchant"] },
  { name: "Media", fragment: "media platform", patterns: [/\bstreaming (service|platform)\b/i, /video (streaming|platform)/i, /music streaming/i, /\bpodcast network\b/i, /news (platform|publisher|organization|outlet)/i], vocab: ["watch", "stream", "video", "music", "episode", "publish"] },
  { name: "Education", fragment: "education platform", patterns: [/online (course|learning|school)/i, /\bcurriculum\b/i, /for (students|teachers|schools)/i], vocab: ["course", "learn", "student", "teacher", "class", "lesson"] },
  { name: "Healthcare", fragment: "healthcare software", patterns: [/health(care)? (platform|software|provider)/i, /patient/i, /\bHIPAA\b/i, /clinical/i], vocab: ["patient", "health", "clinical", "care", "medical"] },
  { name: "Hospitality", fragment: "hospitality service", patterns: [/hotel/i, /book (your|a) stay/i, /restaurant/i, /\breservation/i, /order (food|online)/i], vocab: ["hotel", "stay", "room", "menu", "reservation", "order"] },
  { name: "Retail", fragment: "retail brand", patterns: [/\bflagship store\b/i, /shop (the )?(collection|look)/i], vocab: ["shop", "collection", "store", "size", "fit"] },
  { name: "Government", fragment: "government service", patterns: [/\.gov\b/i, /government service/i, /federal|municipal/i], vocab: ["government", "citizen", "permit", "tax", "public"] },
  { name: "Nonprofit", fragment: "nonprofit organization", patterns: [/non-?profit/i, /donate/i, /museum/i, /foundation/i, /admission/i], vocab: ["donate", "museum", "exhibit", "foundation", "mission", "visit"] },
  { name: "Artificial Intelligence", fragment: "AI platform", patterns: [/\bAI-?native platform/i, /foundation model/i, /\bLLM (platform|app)/i, /machine learning platform/i, /AI (assistant|agent)s? (platform|suite|product)/i, /generative AI (platform|workspace|app)/i], vocab: ["ai", "model", "llm", "agent", "intelligent", "generate"] },
  { name: "Infrastructure", fragment: "cloud infrastructure", patterns: [/cloud infrastructure/i, /\bhosting\b/i, /deploy .*scale/i, /edge network/i, /serverless/i], vocab: ["deploy", "hosting", "cloud", "scale", "serverless", "edge"] },
  { name: "Sales & Marketing", fragment: "sales and marketing software", patterns: [/\bCRM\b/i, /email marketing/i, /marketing platform/i, /sales pipeline/i], vocab: ["sales", "marketing", "crm", "campaign", "leads"] },
  { name: "Security", fragment: "security software", patterns: [/cybersecurity/i, /threat (detection|protection)/i, /zero trust/i, /\bSOC ?2\b.*platform/i], vocab: ["security", "threat", "vulnerability", "compliance", "protect"] },
  { name: "Human Resources", fragment: "HR software", patterns: [/\bpayroll\b/i, /\brecruiting\b/i, /\bHR platform\b/i, /applicant tracking/i], vocab: ["hiring", "payroll", "employee", "recruit", "onboard"] },
  { name: "Communication", fragment: "communication platform", patterns: [/\bvideo conferencing\b/i, /team chat/i, /messaging (app|platform)/i], vocab: ["chat", "call", "video", "message", "meet"] },
];

function navLabels(text: string): string[] {
  const out: string[] = [];
  const re = /\[([^\]]{2,60})\]\((https?:[^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && out.length < 200) {
    const label = m[1].replace(/\(https?:[^)]+\)/g, "").trim();
    if (label.length >= 2 && !/^click|learn more|read more$/i.test(label)) out.push(label);
  }
  return out;
}

/**
 * First pattern occurrence that is NOT a navigation/product-list label.
 * Bare link labels ("AI for Developers", "News", "Pricing") describe site
 * chrome, not the brand — they must never drive category/audience verdicts.
 */
function firstRealMatch(text: string, pattern: RegExp, labels: string[], allowListItems = false): RegExpExecArray | null {
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  const re = new RegExp(pattern.source, flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const hit = m[0];
    const isLabel = labels.some((l) => l.toLowerCase().includes(hit.toLowerCase()) && hit.length >= 4);
    // list items ("* Google for Developers", "- Pricing") are site chrome, not statements
    const line = text.slice(0, m.index).split("\n").pop() ?? "";
    const isListItem = /^\s*([*•\-–—]|\d+[.)])\s+\S/.test(line) || /^\s*\|\s*/.test(line);
    if (!isLabel && (allowListItems || !isListItem)) return m;
    if (re.lastIndex === m.index) re.lastIndex += 1; // zero-length safety
  }
  return null;
}

function labelsOf(pages: PageInput[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const p of pages) map.set(p.url, navLabels(p.text));
  return map;
}

/**
 * Infer category from genuinely independent sources.
 * Requires support from ≥2 independent sources OR one explicit descriptor,
 * otherwise returns "Category not reliably determined".
 */
export function inferCategory(pages: PageInput[], brandName: string): CategoryVerdict {
  const home = pages[0];
  const homeText = home?.text ?? "";
  const labels = pages.flatMap((p) => navLabels(p.text));
  const labelBlob = labels.join(" | ");
  const headingBlob = homeText.split("\n").filter((l) => /^#{1,3}\s+/.test(l)).join(" ");
  const titleDesc = `${home?.title ?? ""} — title descriptor. ${home?.description ?? ""} — meta description.`;
  const aboutText = pages.filter((p) => p.pageType === "about").map((p) => p.text.slice(0, 4000)).join(" ");

  const labelsByPage = labelsOf(pages);
  const homeLabels = labelsByPage.get(home?.url ?? "") ?? [];
  // Namesake product rule: "<Brand> Search" named on the brand's own site is an
  // explicit category descriptor (covers minimal homepages like google.com).
  const escBrand = brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const namesakeSearch = brandName.length >= 3 ? new RegExp(`${escBrand}\\s+Search(\\s+engine)?`, "i") : null;
  const scored = CATEGORIES.map((cat) => {
    let score = 0;
    const ev: string[] = [];
    const srcs = new Set<string>();
    // explicit descriptors (title/meta/about) — strongest; nav labels excluded
    for (const pat of cat.patterns) {
      const src = pat.source;
      if (firstRealMatch(titleDesc, pat, homeLabels)) { score += 4; srcs.add("title/meta"); if (ev.length < 3) ev.push(`Explicit descriptor matches /${src}/ in page title or meta description`); }
      if (aboutText && firstRealMatch(aboutText, pat, labelsByPage.get(pages.find((p) => p.pageType === "about")?.url ?? "") ?? [])) { score += 3; srcs.add("about"); if (ev.length < 3) ev.push(`About-page copy matches /${src}/`); }
      if (headingBlob && firstRealMatch(headingBlob, pat, homeLabels)) { score += 2; srcs.add("headings"); if (ev.length < 3) ev.push(`Homepage headings match /${src}/`); }
    }
    if (cat.name === "Search" && namesakeSearch) {
      const allText = `${titleDesc}\n${aboutText}`.slice(0, 20000);
      if (firstRealMatch(allText, namesakeSearch, homeLabels)) {
        score += 4; srcs.add("namesake-product");
        ev.push(`Namesake product "${brandName} Search" named on the brand's own site`);
      }
    }
    // vocabulary breadth across pages
    let vocabHits = 0;
    const hitPages = new Set<string>();
    for (const v of cat.vocab) {
      const re = new RegExp(`\\b${v.replace(/ /g, "\\s+")}\\b`, "i");
      pages.forEach((p, i) => {
        if (re.test(p.text.slice(0, 12000))) { vocabHits += 1; hitPages.add(`${i}`); }
      });
    }
    if (vocabHits >= 3 && hitPages.size >= 2) {
      score += 2; srcs.add("cross-page-vocab");
      const shown = cat.vocab.filter((v) => new RegExp(`\\b${v.replace(/ /g, "\\s+")}\\b`, "i").test(homeText)).slice(0, 4);
      if (shown.length > 0) ev.push(`"${shown.join('", "')}" vocabulary across ${hitPages.size} pages`);
    }
    // nav labels
    const navHits = cat.vocab.filter((v) => new RegExp(`\\b${v}\\b`, "i").test(labelBlob));
    if (navHits.length >= 2) { score += 2; srcs.add("navigation"); ev.push(`Navigation labels include "${navHits.slice(0, 4).join('", "')}"`); }
    return { cat, score, ev, sources: srcs.size };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  // Gate: need ≥5 points AND ≥2 independent sources, with a clear margin over runner-up.
  if (top.score >= 5 && top.sources >= 2 && top.score - scored[1].score >= 2) {
    return {
      category: top.cat.name,
      confidence: Number(Math.min(0.92, 0.6 + top.sources * 0.08 + Math.min(3, top.score - 5) * 0.04).toFixed(2)),
      evidence: top.ev.slice(0, 3),
      queryFragment: top.cat.fragment,
      signals: top.cat.vocab,
    };
  }
  // Weak but non-zero signal: name the leader as low-confidence, still usable for search.
  if (top.score >= 3) {
    return {
      category: top.cat.name,
      confidence: 0.4,
      evidence: [...top.ev.slice(0, 2), "Support is thin — category used for discovery only, reported as low-confidence."],
      queryFragment: top.cat.fragment,
      signals: top.cat.vocab,
    };
  }
  return {
    category: "Category not reliably determined",
    confidence: 0.2,
    evidence: [`No category reached the evidence gate (best: ${top.cat.name} at score ${top.score}); refusing to guess.`],
    queryFragment: "",
    signals: [],
  };
}

/* ---------------- audience (explicit-first) ---------------- */

export interface AudienceVerdict {
  primary: string;
  secondary: string;
  evidenceItems: string[];
  confidence: number;
  origin: Origin;
}

const EXPLICIT_AUDIENCE: Array<{ label: string; res: RegExp[] }> = [
  { label: "Developers", res: [/for developers/i, /built for developers/i, /developer-first/i, /developer platform/i] },
  { label: "Product & engineering teams", res: [/for (product|engineering) teams/i, /built for (modern )?teams/i] },
  { label: "Enterprises", res: [/for enterprises?/i, /enterprise (plan|grade|ready)/i, /trusted by enterprises/i] },
  { label: "Businesses", res: [/for (internet )?businesses/i, /businesses of all sizes/i, /platform for businesses/i, /built for (internet )?business/i] },
  { label: "Small businesses", res: [/for small businesses?/i, /built for small business/i] },
  { label: "Startups", res: [/for startups/i, /built for startups/i] },
  { label: "Consumers", res: [/for everyone/i, /for consumers/i, /billions of (people|users)/i] },
  { label: "Students & educators", res: [/for students( & educators| and teachers)?/i, /for (schools|teachers|classrooms)/i] },
  { label: "Creators", res: [/for creators/i, /made for creators/i, /built for creators/i] },
  { label: "Marketers", res: [/for marketers/i, /built for (modern )?marketing teams/i] },
  { label: "Designers", res: [/for designers/i, /built for design teams/i] },
];

/** Audience only from explicit statements or strong multi-page support. */
export function inferAudience(pages: PageInput[]): AudienceVerdict {
  const labelsByPage = labelsOf(pages);
  const hits: Array<{ label: string; quote: string; source: string }> = [];
  // Product-name fragments ("AI for Developers", "News") in nav lists are NOT
  // audience statements. A match counts only inside a real sentence (≥8 words)
  // or on pricing/customer/proof pages where the context is the buyer
  // (plan tiers are legitimately list-shaped there).
  const PROOF_CONTEXT = new Set(["pricing", "customers", "contact"]);
  for (const p of pages) {
    const text = p.text;
    const labels = labelsByPage.get(p.url) ?? [];
    const proofPage = PROOF_CONTEXT.has(p.pageType);
    for (const cand of EXPLICIT_AUDIENCE) {
      for (const re of cand.res) {
        const m = firstRealMatch(text, re, labels, proofPage);
        if (!m) continue;
        if (hits.filter((h) => h.label === cand.label).length >= 2) continue;
        // testimonial filler ("for everyone involved") is not an audience statement
        const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 18);
        if (/^\s+(involved|interested|concerned)\b/i.test(after)) continue;
        const start = Math.max(0, (m.index ?? 0) - 120);
        const end = (m.index ?? 0) + m[0].length + 120;
        const sentence = text.slice(start, end).replace(/\s+/g, " ").trim();
        const words = sentence.split(" ").length;
        const proofCtx = PROOF_CONTEXT.has(p.pageType) || /trusted by|loved by|billions of|plan\b|pricing/i.test(sentence);
        if (words < 8 && !proofCtx) continue; // bare nav-list fragment — not a statement
        hits.push({ label: cand.label, quote: `"…${sentence.slice(0, 200)}…"`, source: p.url });
      }
    }
  }
  const byLabel = new Map<string, typeof hits>();
  for (const h of hits) byLabel.set(h.label, [...(byLabel.get(h.label) ?? []), h]);
  const ranked = [...byLabel.entries()].sort((a, b) => b[1].length - a[1].length);
  if (ranked.length > 0) {
    const [primary, ph] = ranked[0];
    const second = ranked[1];
    return {
      primary,
      secondary: second ? second[0] : "Not detected",
      evidenceItems: [
        ...ph.slice(0, 2).map((h) => `${h.quote} — ${h.source} [${pages.find((p) => p.url === h.source)?.pageType ?? "page"}]`),
        ...(second ? second[1].slice(0, 1).map((h) => `${h.quote} — ${h.source}`) : []),
      ],
      confidence: Number(Math.min(0.9, 0.6 + ph.length * 0.1 + (new Set(ph.map((h) => h.source)).size > 1 ? 0.1 : 0)).toFixed(2)),
      origin: "observed",
    };
  }
  return {
    primary: "Audience not reliably determined",
    secondary: "Not detected",
    evidenceItems: ["No explicit audience statements (for X / built for Y / plan tiers / customer proof) found across fetched pages; refusing to default to enterprise/developer."],
    confidence: 0.2,
    origin: "observed",
  };
}

/* ---------------- pain points (problem-language only) ---------------- */

export interface PainVerdict {
  points: string[];
  origin: Origin;
}

const PROBLEM_RES: RegExp[] = [
  /tired of ([^.]{4,80})/i,
  /frustrat\w* (with|by) ([^.]{4,80})/i,
  /struggl\w* (with|to) ([^.]{4,80})/i,
  /without the (hassle|need|pain)([^.]{0,60})/i,
  /no more ([^.]{4,80})/i,
  /say goodbye to ([^.]{4,80})/i,
  /stop (wasting|juggling|losing) ([^.]{4,80})/i,
  /hard to ([^.]{4,80})/i,
  /difficult to ([^.]{4,80})/i,
  /the problem( is|:)? ([^.]{4,100})/i,
  /pain(ful| points?)([^.]{0,80})/i,
];

/** Pain points only from observed problem-language, quoted with source. */
export function inferPains(pages: PageInput[], max = 5): PainVerdict {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    const text = p.text.replace(/\s+/g, " ");
    for (const re of PROBLEM_RES) {
      // fresh regex per page (global state safety: patterns are non-global)
      const m = text.match(re);
      if (m) {
        const quote = m[0].trim().slice(0, 140);
        const key = quote.toLowerCase().slice(0, 40);
        if (!seen.has(key) && out.length < max) {
          seen.add(key);
          out.push(`"${quote}" — ${p.url}`);
        }
      }
    }
    if (out.length >= max) break;
  }
  if (out.length > 0) return { points: out, origin: "observed" };
  return { points: ["Pain points not directly established from live evidence."], origin: "observed" };
}
