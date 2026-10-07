/**
 * lib/brand-extractor.ts — Endpoint 1 pipeline.
 * USER URL → validation → TinyFish live fetch → page discovery →
 * raw evidence → normalization → brand intelligence → structured JSON.
 * No hardcoded brand data. All conclusions carry evidence + confidence.
 */
import {
  tinyFetchPages,
  tinyFetchHtml,
  resolveInputToUrl,
  pickRelevantPages,
  discoverPageAssets,
  normalizeUrl,
  type TinyPage,
} from "./tinyfish";
import { inferCategory, inferAudience, type PageInput } from "./category";

export type Origin = "observed" | "inferred";

export interface EvidenceItem {
  source: string;
  observed: string;
  reason: string;
  provider: string;
  origin: Origin;
}

export interface BrandColor {
  name: string;
  hex: string;
  rgb: string;
  usage: "Primary" | "Secondary" | "Accent" | "Background" | "Surface" | "Text" | "Border" | string;
  source: string;
  evidence: string;
  confidence: number;
  origin: Origin;
}

export interface BrandFont {
  family: string;
  role: string;
  weights: string[];
  sources: string[];
  evidence: string;
  confidence: number;
  origin: Origin;
}

export interface BrandExtractResult {
  brand: { name: string; website: string; description: string; tagline: string; category: string; categoryConfidence: number; categoryEvidence: string[] };
  logo: { url: string; type: string; reason: string; evidence: string; source: string; confidence: number; origin: Origin };
  favicon: string;
  colors: BrandColor[];
  typography: { heading: BrandFont | null; body: BrandFont | null; all: BrandFont[]; note: string };
  visualStyle: { description: string; designKeywords: string[]; shapeLanguage: string; imageStyle: string; spacing: string; origin: Origin };
  messaging: { primaryValueProposition: string; keyMessages: string[]; ctaPatterns: string[]; importantTerms: string[] };
  audience: { primary: string; secondary: string; evidence: string; evidenceItems: string[]; confidence: number; origin: Origin };
  confidence: { overall: number; colors: number; typography: number; voice: number; evidenceCoverage: number };
  sources: Array<{ url: string; pageType: string; provider: string; title?: string | null }>;
  evidence: EvidenceItem[];
  meta: { resolvedUrl: string; resolveMethod: string; tinyFishUsed: boolean; pagesFetched: number; generatedAt: string };
}

/* ---------------- helpers ---------------- */

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
function guessName(pages: TinyPage[], url: string): { name: string; evidence: string } {
  const home = pages[0];
  const og = (home?.page_metadata?.og ?? {}) as Record<string, unknown>;
  const ogSite = typeof og.site_name === "string" ? og.site_name : null;
  if (ogSite && ogSite.length > 1) return { name: ogSite, evidence: `og:site_name = "${ogSite}" (${home.url})` };
  const title = (home?.title ?? "").trim();
  if (title) {
    const cleaned = title.split(/[|·—–-]/)[0].trim();
    if (cleaned.length >= 2 && cleaned.length <= 60)
      return { name: cleaned, evidence: `HTML <title> = "${title}" (${home.url})` };
  }
  const h = hostname(url);
  const base = h.split(".")[0];
  const cap = base.charAt(0).toUpperCase() + base.slice(1);
  return { name: cap, evidence: `Derived from hostname "${h}" (weak signal)` };
}

function extractHeadings(markdown: string, max = 12): string[] {
  const out: string[] = [];
  for (const line of markdown.split("\n")) {
    const m = line.match(/^#{1,3}\s+(.+)/);
    if (m) {
      const t = m[1].replace(/\(https?:[^)]+\)/g, "").trim();
      if (t.length > 8 && t.length < 160 && !out.includes(t)) out.push(t);
    }
    if (out.length >= max) break;
  }
  return out;
}

function extractCtas(pages: TinyPage[]): string[] {
  const ctas = new Set<string>();
  const re = /\[CTA:\s*([^\]]+)\]|(Get started|Start free|Try (it |for )?free|Sign up|Log in|Request (a )?demo|Book a demo|Contact sales|Learn more|See pricing|Watch (the )?demo|Join waitlist|Download|Subscribe|Talk to sales|Start building)/gi;
  for (const p of pages) {
    const text = (p.text ?? "").slice(0, 30000);
    let m: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((m = re.exec(text)) && ctas.size < 12) {
      const t = (m[1] ?? m[0]).trim();
      if (t.length > 2 && t.length < 40) ctas.add(t.replace(/\s+/g, " "));
    }
  }
  return [...ctas].slice(0, 8);
}

function topTerms(pages: TinyPage[], brandName: string, max = 10): string[] {
  const freq = new Map<string, number>();
  const stop = new Set("the,a,an,and,or,for,with,your,you,our,we,are,is,to,of,in,on,by,from,as,at,be,that,this,it,its,into,more,all,any,can,will,just,not,but,their,they,them,home,page,menu,search,cart,login,signup".split(","));
  for (const p of pages) {
    const words = (p.text ?? "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/);
    for (let i = 0; i < words.length - 1 && freq.size < 4000; i++) {
      const a = words[i];
      if (a.length < 4 || stop.has(a) || a === brandName.toLowerCase()) continue;
      // bigrams + strong singletons
      const b = words[i + 1];
      if (b && b.length >= 4 && !stop.has(b)) {
        const bi = `${a} ${b}`;
        freq.set(bi, (freq.get(bi) ?? 0) + 1);
      }
      freq.set(a, (freq.get(a) ?? 0) + 0.4);
    }
  }
  return [...freq.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([t]) => t);
}

/* ---- color science (evidence-backed, no hallucination) ---- */

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

function colorName(hex: string): string {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max - min < 0.08) {
    if (l > 0.92) return "Near-white";
    if (l < 0.12) return "Near-black";
    if (l > 0.7) return "Light gray";
    if (l < 0.3) return "Charcoal";
    return "Neutral gray";
  }
  const d = max - min;
  const hue = max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  if (hue < 15 || hue >= 345) return "Red";
  if (hue < 45) return "Orange";
  if (hue < 75) return "Amber";
  if (hue < 150) return "Green";
  if (hue < 180) return "Teal";
  if (hue < 210) return "Sky";
  if (hue < 250) return "Blue";
  if (hue < 290) return "Indigo";
  if (hue < 330) return "Purple";
  return "Pink";
}

/* ---- color science (evidence-backed, no hallucination) ---- */

function normalizeHex(h: string): string | null {
  let s = h.trim().toLowerCase();
  if (s.length === 4) s = "#" + s.slice(1).split("").map((c) => c + c).join("");
  return /^#[0-9a-f]{6}$/.test(s) ? s.toUpperCase() : null;
}

function rgbToHex(r: number, g: number, b: number): string | null {
  if ([r, g, b].some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
  return ("#" + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")).toUpperCase();
}

function hslToHex(h: number, s: number, l: number): string | null {
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return null;
  h = ((h % 360) + 360) % 360;
  s = Math.min(100, Math.max(0, s)) / 100;
  l = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Extract one color literal (hex / rgb() / hsl()) from a CSS value string. */
function literalToHex(value: string, vars: Map<string, string>): string | null {
  const v = value.trim().toLowerCase();
  const hex = v.match(/#[0-9a-f]{3,8}\b/)?.[0];
  if (hex) return normalizeHex(hex.slice(0, 7));
  const rgb = v.match(/rgba?\(\s*(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})/);
  if (rgb) return rgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  const hsl = v.match(/hsla?\(\s*(\d{1,3})[,\s]+(\d{1,3})%?[,\s]+(\d{1,3})%?/);
  if (hsl) return hslToHex(Number(hsl[1]), Number(hsl[2]), Number(hsl[3]));
  const ref = v.match(/var\(\s*(--[\w-]+)/)?.[1];
  if (ref && vars.has(ref)) return literalToHex(vars.get(ref)!, vars);
  return null;
}

export interface ColorHit {
  hex: string;
  count: number;
  weight: number;
  contexts: string[];
  props: string[];
}

/**
 * Parse real CSS (stylesheet text or surviving <style>/inline CSS):
 * CSS variables, background/color/border/fill/stroke declarations,
 * rgb()/hsl() literals. Property-aware weighting: UI paint properties
 * (background, color, fill) count more than incidental mentions.
 */
export function parseCssColors(css: string, sourceLabel: string): ColorHit[] {
  const vars = new Map<string, string>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]{1,80})/g)) {
    vars.set(m[1].toLowerCase(), m[2]);
  }
  const hits = new Map<string, ColorHit>();
  const push = (hex: string | null, prop: string, weight: number) => {
    if (!hex) return;
    const e = hits.get(hex) ?? { hex, count: 0, weight: 0, contexts: [], props: [] };
    e.count += 1;
    e.weight += weight;
    const ctx = `${sourceLabel}${prop ? ` · ${prop}` : ""}`;
    if (!e.contexts.includes(ctx) && e.contexts.length < 3) e.contexts.push(ctx.slice(0, 100));
    if (prop && !e.props.includes(prop)) e.props.push(prop);
    hits.set(hex, e);
  };
  // property-aware declarations
  const PROP_W: Array<[RegExp, number, string]> = [
    [/background(?:-color)?/i, 2, "background"],
    [/(?<!background-)color/i, 2, "color"],
    [/border(?:-\w+)?-color|outline-color/i, 1.5, "border"],
    [/fill/i, 2, "fill"],
    [/stroke|stop-color/i, 1.5, "stroke"],
  ];
  for (const m of css.matchAll(/([a-zA-Z-]+)\s*:\s*([^;{}]{1,120})/g)) {
    const prop = m[1].toLowerCase();
    for (const [re, w, label] of PROP_W) {
      if (re.test(prop)) {
        const hex = literalToHex(m[2], vars);
        if (hex) push(hex, label, w);
        break;
      }
    }
  }
  // any remaining bare hex literals (weight 0.5 — observed but role unknown)
  for (const m of css.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
    const hex = normalizeHex(m[0]);
    if (hex && !hits.has(hex)) push(hex, "", 0.5);
  }
  return [...hits.values()].sort((a, b) => b.weight - a.weight || b.count - a.count);
}

/** Legacy HTML-surface color scan (inline styles, utility classes, theme-color). */
export function extractColors(html: string): Array<{ hex: string; count: number; contexts: string[] }> {
  const fromCss = parseCssColors(html, "page HTML");
  return fromCss.map((h) => ({ hex: h.hex, count: h.count, contexts: h.contexts }));
}

function hueOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 0.08) return -1; // neutral
  const d = max - min;
  return max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/** Assign Primary/Secondary/Accent/Background/Text/Border roles by colorimetry, not position. */
function assignRoles(hits: ColorHit[]): BrandColor[] {
  const pool = [...hits].sort((a, b) => b.weight - a.weight || b.count - a.count).slice(0, 20);
  const used = new Set<string>();
  const out: BrandColor[] = [];
  const take = (pred: (h: ColorHit) => boolean, usage: BrandColor["usage"], minWeight = 0): ColorHit | null => {
    const c = pool.find((h) => !used.has(h.hex) && h.weight >= minWeight && pred(h));
    if (c) { used.add(c.hex); }
    return c ?? null;
  };
  const mk = (h: ColorHit, usage: BrandColor["usage"]): BrandColor => {
    const multi = h.contexts.length > 1;
    return {
      name: colorName(h.hex),
      hex: h.hex,
      rgb: hexToRgb(h.hex),
      usage,
      source: h.contexts[0] ?? "page CSS",
      evidence: `Observed ${h.count}× (${h.props.length ? h.props.join("/") : "UI paint"}) in ${h.contexts[0] ?? "page CSS"}.`,
      confidence: Number(Math.min(0.95, 0.3 + Math.min(h.weight, 14) / 16 + (multi ? 0.08 : 0)).toFixed(2)),
      origin: "observed",
    };
  };
  const bg = take((h) => luminance(h.hex) > 0.9, "Background", 1);
  if (bg) out.push(mk(bg, "Background"));
  const text = take((h) => luminance(h.hex) < 0.16, "Text", 1);
  if (text) out.push(mk(text, "Text"));
  const primary = take((h) => hueOf(h.hex) >= 0, "Primary", 1.5);
  if (primary) out.push(mk(primary, "Primary"));
  const pHue = primary ? hueOf(primary.hex) : -999;
  const secondary = take((h) => { const hu = hueOf(h.hex); return hu >= 0 && Math.abs(hu - pHue) > 25; }, "Secondary", 1.5);
  if (secondary) out.push(mk(secondary, "Secondary"));
  const accent = take((h) => { const hu = hueOf(h.hex); return hu >= 0 && Math.abs(hu - pHue) > 25; }, "Accent", 1);
  if (accent) out.push(mk(accent, "Accent"));
  const border = take((h) => luminance(h.hex) > 0.6 && hueOf(h.hex) < 0, "Border", 1);
  if (border) out.push(mk(border, "Border"));
  // fill remaining slots with strongest leftovers as Surface/Highlight
  for (const h of pool) {
    if (out.length >= 7 || used.has(h.hex) || h.weight < 1) continue;
    used.add(h.hex);
    out.push(mk(h, out.some((c) => c.usage === "Surface") ? "Highlight" : "Surface"));
  }
  const order = ["Primary", "Secondary", "Accent", "Background", "Surface", "Text", "Highlight", "Border"];
  return out.sort((a, b) => order.indexOf(a.usage) - order.indexOf(b.usage));
}

async function fetchText(url: string, capBytes = 500000, timeoutMs = 12000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "BrandForgeAI/1.0 (+brand-guide-generator)" } });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > capBytes) return null;
      const ct = res.headers.get("content-type") ?? "";
      if (/^image\//i.test(ct) && !/svg/i.test(ct)) return null;
      return new TextDecoder().decode(buf);
    } finally {
      clearTimeout(t);
    }
  } catch {
    return null;
  }
}

/* ---- typography (observed only — never inferred from popularity) ---- */

const GENERIC_STACKS = /^(sans-serif|serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-monospace|inherit|initial|unset|-apple-system|blinkmacsystemfont|segoe ui|roboto|helvetica|arial)$/i;

function cleanFamily(f: string): string | null {
  const c = f.replace(/['"]/g, "").trim().replace(/\s+/g, " ");
  if (!c || c.length > 60 || GENERIC_STACKS.test(c)) return null;
  if (/^\d/.test(c) || /^(var|calc|inherit)/i.test(c)) return null;
  return c;
}

export interface FontEvidence {
  family: string;
  weights: string[];
  contexts: string[]; // e.g. "stylesheet /assets/x.css · selector h1"
  headingCtx: number;
  bodyCtx: number;
}

/** Parse font-family/weight/@font-face from real CSS text. */
export function parseFontsFromCss(css: string, sourceLabel: string): FontEvidence[] {
  const map = new Map<string, FontEvidence>();
  const touch = (fam: string, ctx: string, weight?: string, heading = false, body = false) => {
    const e = map.get(fam) ?? { family: fam, weights: [], contexts: [], headingCtx: 0, bodyCtx: 0 };
    if (weight && !e.weights.includes(weight) && e.weights.length < 8) e.weights.push(weight);
    const c = `${sourceLabel}${ctx ? ` · ${ctx}` : ""}`.slice(0, 110);
    if (!e.contexts.includes(c) && e.contexts.length < 3) e.contexts.push(c);
    if (heading) e.headingCtx += 1;
    if (body) e.bodyCtx += 1;
    map.set(fam, e);
  };
  // rule blocks with selectors
  for (const m of css.matchAll(/([^{}@]{1,160})\{\s*([^{}]{1,800}?font-family\s*:\s*([^;{}]{1,160}))/gi)) {
    const selector = m[1].replace(/\/\*.*?\*\//g, "").trim().slice(-80);
    const stack = m[3];
    const first = cleanFamily(stack.split(",")[0]);
    if (!first) continue;
    const wm = m[2].match(/font-weight\s*:\s*([^;}{]{1,20})/i)?.[1]?.trim();
    const heading = /h[1-6]|heading|display|title|\.h-|hero/i.test(selector);
    const body = /body|p\b|article|paragraph|\.prose|content/i.test(selector);
    touch(first, `selector "${selector.slice(0, 60)}"`, wm, heading, body);
  }
  // @font-face declarations (strong observed evidence a family ships on the site)
  for (const m of css.matchAll(/@font-face\s*\{([^{}]{1,1200})\}/gi)) {
    const body = m[1];
    const fam = cleanFamily((body.match(/font-family\s*:\s*([^;}]{1,80})/i)?.[1] ?? "").split(",")[0] ?? "");
    if (!fam) continue;
    const w = body.match(/font-weight\s*:\s*([^;}]{1,30})/i)?.[1]?.trim();
    touch(fam, "@font-face", w);
  }
  return [...map.values()];
}

function fontType(family: string): string {
  return /serif/i.test(family) && !/sans/i.test(family) ? "serif" : "sans-serif";
}

/* ---- logo (observed assets only) ---- */

export interface LogoCandidate {
  url: string;
  type: string;
  reason: string;
  evidence: string;
  confidence: number;
}

function assetType(url: string, isFavicon: boolean): string {
  if (isFavicon) return "favicon";
  const m = url.toLowerCase().match(/\.(svg|png|webp|avif|gif|jpe?g)(\?|$)/);
  return m ? m[1].replace("jpg", "jpeg") : "other";
}

export function pickLogoFromCandidates(
  headerImages: Array<{ src: string; alt: string; inHeader: boolean }>,
  imageLinks: string[],
  brandName: string,
  favicon: string,
  ogImage: string | null,
  pageUrl: string
): LogoCandidate {
  const scored = new Map<string, { score: number; reasons: string[] }>();
  const add = (u: string, s: number, r: string) => {
    const e = scored.get(u) ?? { score: 0, reasons: [] };
    e.score += s;
    if (!e.reasons.includes(r)) e.reasons.push(r);
    scored.set(u, e);
  };
  const bn = brandName.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const { src, alt, inHeader } of headerImages) {
    const u = src.toLowerCase();
    if (inHeader) add(src, 30, "inside <header>/<nav> region");
    if (/logo/.test(u)) add(src, 50, 'filename/url contains "logo"');
    if (/brand|wordmark|logotype|site-logo/.test(u)) add(src, 30, "brand/wordmark filename signal");
    if (alt && /logo|brand/.test(alt.toLowerCase())) add(src, 40, `img alt="${alt.slice(0, 60)}"`);
    if (alt && bn && alt.toLowerCase().replace(/[^a-z0-9]/g, "").includes(bn) && bn.length > 2) add(src, 25, "alt text matches brand name");
    if (/\.svg(\?|$)/.test(u)) add(src, 15, "vector (SVG) format");
    if (/icon|favicon|avatar|sprite|og-image|hero|banner|screenshot|placeholder/.test(u)) add(src, -25, "generic/decorative filename penalty");
    if (src.length > 200) add(src, -10, "overlong URL penalty");
  }
  for (const u of imageLinks ?? []) {
    if (scored.has(u)) continue;
    if (/logo/.test(u.toLowerCase())) add(u, 45, 'filename/url contains "logo" (page资产)');
  }
  const ranked = [...scored.entries()].sort((a, b) => b[1].score - a[1].score);
  if (ranked.length > 0 && ranked[0][1].score >= 40) {
    const [u, e] = ranked[0];
    return {
      url: u,
      type: assetType(u, false),
      reason: `Logo asset: ${e.reasons.join("; ")} (score ${e.score})`,
      evidence: `Observed <img src="${u.length > 120 ? u.slice(0, 120) + "…" : u}" on ${pageUrl}`,
      confidence: Number(Math.min(0.95, 0.55 + e.score / 250).toFixed(2)),
    };
  }
  if (favicon) {
    return {
      url: favicon,
      type: "favicon",
      reason: "No header/logo asset isolated — falling back to the site favicon, explicitly labelled as favicon (not confirmed logo)",
      evidence: `rel=icon link → ${favicon} (${pageUrl})`,
      confidence: 0.35,
    };
  }
  if (ogImage) {
    return {
      url: ogImage,
      type: assetType(ogImage, false),
      reason: "No logo or favicon isolated — og:image social asset, explicitly labelled candidate (not confirmed logo)",
      evidence: `og:image → ${ogImage} (${pageUrl})`,
      confidence: 0.3,
    };
  }
  if (ranked.length > 0) {
    const [u, e] = ranked[0];
    return {
      url: u, type: assetType(u, false),
      reason: `Weak candidate only (score ${e.score}): ${e.reasons.join("; ")} — unverified as logo`,
      evidence: `Best available image on ${pageUrl}`,
      confidence: 0.25,
    };
  }
  return { url: "", type: "none", reason: "Not detected — no <img>, favicon, or og:image found", evidence: `No image assets on fetched pages (${pageUrl})`, confidence: 0 };
}

/* ---- main pipeline ---- */

export async function extractBrand(input: string): Promise<BrandExtractResult> {
  const { url, method } = await resolveInputToUrl(input);
  const canonical = normalizeUrl(url);
  const origin = new URL(canonical).origin;
  const tinyFishUsedHolder = { value: true };

  // 1) TinyFish live fetch: homepage (markdown + links + images + metadata)
  const first = await tinyFetchPages([canonical], {
    format: "markdown",
    links: true,
    image_links: true,
    page_metadata: true,
    purpose: "Brand extraction: identity, navigation, messaging, visual assets, about/product pages discovery.",
  });
  if (first.pages.length === 0) {
    const err = first.errors[0];
    throw new Error(err ? `Live-site fetch failed (${err.error})${err.status ? ` [HTTP ${err.status}]` : ""} for ${canonical}. The site may block bots, require login, or be unreachable.` : `Live-site fetch returned nothing for ${canonical}.`);
  }
  const home = first.pages[0];
  tinyFishUsedHolder.value = first.pages.some((p) => p.provider.startsWith("tinyfish"));
  // Follow site migrations (e.g. notion.so → notion.com): the LIVE final URL
  // defines the site identity for discovery, not the requested URL.
  const siteOrigin = (() => { try { return new URL(home.final_url).origin; } catch { return origin; } })();

  // 2) Discover + fetch relevant internal pages (about/product/pricing/docs/help/…).
  // Discovery comes from TinyFish's live link graph; each page is type-labelled.
  const discovered = pickRelevantPages(home.links ?? [], siteOrigin, 7);
  let extra: TinyPage[] = [];
  const extraTypes = new Map<string, string>();
  if (discovered.length > 0) {
    const r = await tinyFetchPages(discovered.map((d) => d.url), {
      format: "markdown",
      links: false,
      image_links: true,
      page_metadata: true,
      purpose: "Brand voice + messaging evidence from about/product/pricing/help pages.",
    });
    extra = r.pages;
    for (const d of discovered) {
      try { extraTypes.set(new URL(d.url).toString(), d.pageType); } catch { /* ignore */ }
      const noSlash = d.url.replace(/\/$/, "");
      extraTypes.set(noSlash, d.pageType);
    }
    if (r.pages.some((p) => p.provider.startsWith("tinyfish"))) tinyFishUsedHolder.value = true;
  }
  const pages = [home, ...extra];
  const pageTypeOf = (p: TinyPage, idx: number): string => {
    if (idx === 0) return "homepage";
    return extraTypes.get(p.final_url) ?? extraTypes.get(p.url) ?? extraTypes.get(p.final_url.replace(/\/$/, "")) ?? "internal";
  };

  // 3) Visual evidence.
  // TinyFish cleaned HTML carries copy/structure; its CSS is stripped, so:
  //  (a) parse whatever CSS survives in TinyFish HTML,
  //  (b) ONE raw-HTML asset-discovery fetch (labelled direct:asset-discovery)
  //      to locate the site's own stylesheets/SVGs/logo imgs, then parse those.
  let html = home.html ?? "";
  try {
    const apiKey = process.env.TINYFISH_API_KEY;
    if (apiKey) {
      const h = await tinyFetchHtml([home.final_url || canonical]);
      if (h[0]?.html) html = h[0].html;
    }
  } catch {
    // keep fallback html
  }
  const assets = await discoverPageAssets(home.final_url || canonical, siteOrigin).catch(() => null);
  const cssTexts: Array<{ css: string; label: string }> = [];
  if (html) cssTexts.push({ css: html, label: "page HTML" });
  const assetCssUrls = (assets?.stylesheets ?? []).slice(0, 3);
  for (const cssUrl of assetCssUrls) {
    const css = await fetchText(cssUrl);
    if (css) {
      const short = (() => { try { return new URL(cssUrl).pathname.slice(-48); } catch { return cssUrl.slice(-48); } })();
      cssTexts.push({ css, label: `stylesheet ${short}` });
    }
  }
  // merge color hits across all CSS sources (weights add up = repeated UI use)
  const merged = new Map<string, ColorHit>();
  for (const { css, label } of cssTexts) {
    for (const h of parseCssColors(css, label)) {
      const e = merged.get(h.hex) ?? { hex: h.hex, count: 0, weight: 0, contexts: [], props: [] };
      e.count += h.count;
      e.weight += h.weight;
      for (const c of h.contexts) if (!e.contexts.includes(c) && e.contexts.length < 3) e.contexts.push(c);
      for (const p of h.props) if (!e.props.includes(p)) e.props.push(p);
      merged.set(h.hex, e);
    }
  }
  // inline SVG fills + theme-color: explicit brand paint, high weight
  for (const f of assets?.svgFills ?? []) {
    const hex = normalizeHex(f);
    if (!hex) continue;
    const e = merged.get(hex) ?? { hex, count: 0, weight: 0, contexts: [], props: [] };
    e.count += 1; e.weight += 2;
    if (!e.contexts.includes("inline SVG fill")) e.contexts.push("inline SVG fill");
    if (!e.props.includes("fill")) e.props.push("fill");
    merged.set(hex, e);
  }
  if (assets?.themeColor) {
    const hex = normalizeHex(assets.themeColor);
    if (hex) {
      const e = merged.get(hex) ?? { hex, count: 0, weight: 0, contexts: [], props: [] };
      e.count += 3; e.weight += 6;
      e.contexts.unshift("meta theme-color");
      merged.set(hex, e);
    }
  }
  const colorHits = [...merged.values()].sort((a, b) => b.weight - a.weight || b.count - a.count);
  const colors = assignRoles(colorHits);
  const colorConf = colors.length === 0 ? 0.1 : Number((colors.reduce((a, c) => a + c.confidence, 0) / colors.length).toFixed(2));

  // typography: observed families only, with weights + heading/body roles
  const fontMap = new Map<string, FontEvidence>();
  for (const { css, label } of cssTexts) {
    for (const f of parseFontsFromCss(css, label)) {
      const e = fontMap.get(f.family) ?? { family: f.family, weights: [], contexts: [], headingCtx: 0, bodyCtx: 0 };
      for (const w of f.weights) if (!e.weights.includes(w)) e.weights.push(w);
      for (const c of f.contexts) if (!e.contexts.includes(c) && e.contexts.length < 3) e.contexts.push(c);
      e.headingCtx += f.headingCtx; e.bodyCtx += f.bodyCtx;
      fontMap.set(f.family, e);
    }
  }
  // Google-Fonts <link> references (observed webfont loading)
  const gfRe = /fonts\.googleapis\.com\/css[^"'\s]*family=([^"'\s:;&]+)/gi;
  for (const { css, label } of cssTexts) {
    let gm: RegExpExecArray | null;
    while ((gm = gfRe.exec(css))) {
      const fam = decodeURIComponent(gm[1]).replace(/\+/g, " ").trim();
      const clean = cleanFamily(fam);
      if (clean && !fontMap.has(clean)) {
        fontMap.set(clean, { family: clean, weights: [], contexts: [`Google Fonts stylesheet (${label})`], headingCtx: 0, bodyCtx: 0 });
      }
    }
  }
  for (const fl of assets?.fontLinks ?? []) {
    const fam = decodeURIComponent(fl.split("family=")[1]?.split("&")[0]?.split(":")[0] ?? "").replace(/\+/g, " ");
    const clean = fam ? cleanFamily(fam) : null;
    if (clean && !fontMap.has(clean)) fontMap.set(clean, { family: clean, weights: [], contexts: ["Google Fonts <link> (observed)"], headingCtx: 0, bodyCtx: 0 });
  }
  const fontEvs = [...fontMap.values()].sort((a, b) => (b.headingCtx + b.bodyCtx + b.contexts.length) - (a.headingCtx + a.bodyCtx + a.contexts.length));
  const toBrandFont = (f: FontEvidence, role: string): BrandFont => ({
    family: f.family,
    role,
    weights: f.weights.length ? f.weights.slice(0, 6) : ["not observed"],
    sources: f.contexts,
    evidence: `${f.family} (${fontType(f.family)}) in ${f.contexts[0] ?? "page CSS"}${f.weights.length ? ` · weights ${f.weights.slice(0, 4).join(", ")}` : ""}`,
    confidence: Number(Math.min(0.9, 0.45 + f.contexts.length * 0.12 + (f.weights.length ? 0.08 : 0)).toFixed(2)),
    origin: "observed",
  });
  const headingEv = fontEvs.find((f) => f.headingCtx > 0) ?? fontEvs[0] ?? null;
  const bodyEv = fontEvs.find((f) => f !== headingEv && (f.bodyCtx > 0 || f.contexts.length > 0)) ?? fontEvs[1] ?? null;
  const typoConfidence = fontEvs.length === 0 ? 0.15 : 0.72;
  const typography = {
    heading: headingEv ? toBrandFont(headingEv, "heading") : null,
    body: bodyEv ? toBrandFont(bodyEv, "body") : (headingEv ? toBrandFont(headingEv, "body (same family observed)") : null),
    all: fontEvs.slice(0, 6).map((f) => toBrandFont(f, f.headingCtx > f.bodyCtx ? "heading-leaning" : f.bodyCtx > 0 ? "body-leaning" : "general")),
    note: fontEvs.length > 0
      ? "Families below were OBSERVED in live CSS/webfont evidence. Heading/body roles follow selector context; where roles can't be separated the same observed family is reported for both."
      : "Not reliably detected from live evidence — no font-family, @font-face, or webfont references found.",
  };
  const combinedText = pages.map((p) => p.text ?? "").join("\n\n").slice(0, 80000);

  // ---- intelligence ----
  const { name, evidence: nameEv } = guessName(pages, canonical);
  const description = (home.description ?? "").trim() || combinedText.split("\n").find((l) => l.trim().length > 60)?.trim().slice(0, 300) || "Not detected";
  const headings = extractHeadings(home.text ?? "");
  const tagline = headings[0] ?? (home.title ?? "").split(/[|·—]/)[0].trim() ?? "Not detected";
  const ctas = extractCtas(pages);
  const terms = topTerms(pages, name);

  const logo = pickLogoFromCandidates(
    assets?.headerImages ?? [],
    pages.flatMap((p) => p.image_links ?? []),
    name,
    (typeof home.page_metadata?.favicon === "string" && home.page_metadata.favicon) || "",
    typeof (home.page_metadata?.og as Record<string, unknown> | undefined)?.image === "string"
      ? ((home.page_metadata?.og as Record<string, unknown>).image as string)
      : null,
    home.final_url
  );
  const favicon =
    (typeof home.page_metadata?.favicon === "string" && home.page_metadata.favicon) ||
    new URL("/favicon.ico", siteOrigin).toString();

  const allCss = cssTexts.map((c) => c.css).join("\n").slice(0, 800000);
  const hasGradient = /gradient/i.test(allCss);
  const hasRadius = /border-radius/i.test(allCss);
  const hasShadow = /box-shadow/i.test(allCss);
  const keywords = [
    ...(hasGradient ? ["gradient-forward"] : ["flat"]),
    ...(hasRadius ? ["rounded"] : ["sharp"]),
    ...(hasShadow ? ["layered"] : ["flat-ui"]),
    (combinedText.length > 20000 ? "content-rich" : "concise"),
    /tailwind|utility/i.test(allCss) ? "utility-styled" : "custom-styled",
  ];
  const cssSourceCount = cssTexts.length;
  const visualStyle = {
    description: `Observed ${keywords.join(", ")} presentation across ${pages.length} live page(s) and ${cssSourceCount} CSS source(s). ${hasGradient ? "Gradient treatments detected in CSS." : "No prominent gradients detected."} ${hasRadius ? "Rounded geometry is used." : "Geometry appears sharp/rectilinear."}`,
    designKeywords: keywords,
    shapeLanguage: hasRadius ? "Rounded — border-radius tokens present in CSS" : "Sharp/rectilinear — minimal border-radius detected",
    imageStyle: logo.url && logo.type !== "favicon" ? "Brand-mark led; product/screen imagery present in page assets" : "Imagery-led; no confirmed logomark isolated",
    spacing: combinedText.length > 20000 ? "Dense, content-rich layout" : "Airy, marketing-hero layout",
    origin: "observed" as Origin,
  };

  // audience: explicit statements only — never default to enterprise/developer
  const pageInputs: PageInput[] = pages.map((p, i) => ({
    url: p.final_url,
    pageType: pageTypeOf(p, i),
    title: p.title,
    description: p.description,
    text: p.text ?? "",
  }));
  const categoryVerdict = inferCategory(pageInputs, name);
  const audVerdict = inferAudience(pageInputs);
  const audience = {
    primary: audVerdict.primary,
    secondary: audVerdict.secondary,
    evidence: audVerdict.evidenceItems.join(" · ").slice(0, 600),
    evidenceItems: audVerdict.evidenceItems,
    confidence: audVerdict.confidence,
    origin: audVerdict.origin,
  };

  const voiceConf = headings.length >= 3 && ctas.length >= 2 ? 0.8 : headings.length > 0 ? 0.55 : 0.3;
  const evidenceCovered =
    (colors.length > 0 ? 1 : 0) + (fontEvs.length > 0 ? 1 : 0) + (logo.url ? 1 : 0) +
    (headings.length > 0 ? 1 : 0) + (ctas.length > 0 ? 1 : 0) + (extra.length > 0 ? 1 : 0);
  const evidenceCoverage = Number((evidenceCovered / 6).toFixed(2));
  // Confidence reflects evidence, not optimism: base field average scaled by
  // coverage, discounted when category or audience could not be determined.
  const baseAvg = (colorConf + typoConfidence + voiceConf + (logo.confidence || 0.2)) / 4;
  const determinedDiscount = (categoryVerdict.confidence < 0.5 ? 0.9 : 1) * (audVerdict.confidence < 0.5 ? 0.92 : 1);
  const overall = Number((baseAvg * (0.6 + 0.4 * evidenceCoverage) * determinedDiscount).toFixed(2));

  const evidence: EvidenceItem[] = [
    { source: home.final_url, observed: `Brand name: "${name}" — ${nameEv}`, reason: "Metadata/hostname → brand name (observed)", provider: home.provider, origin: "observed" },
    { source: home.final_url, observed: `Category: "${categoryVerdict.category}" (confidence ${Math.round(categoryVerdict.confidence * 100)}%) — ${categoryVerdict.evidence.join(" · ").slice(0, 280)}`, reason: "Titles/meta/headings/nav → dynamic category (never defaulted)", provider: home.provider, origin: "observed" },
    { source: home.final_url, observed: `Title: "${home.title}" · Description: "${(home.description ?? "").slice(0, 140)}"`, reason: "Homepage metadata → name/description/tagline", provider: home.provider, origin: "observed" },
    { source: home.final_url, observed: `${headings.length} headline(s), ${ctas.length} CTA pattern(s) captured`, reason: "Homepage copy → messaging + voice", provider: home.provider, origin: "observed" },
    ...extra.map((p, i) => ({
      source: p.final_url,
      observed: `[${pageTypeOf(p, i + 1)}] "${(p.title ?? "").slice(0, 90)}" — ${(p.text ?? "").slice(0, 120).replace(/\s+/g, " ")}…`,
      reason: "Internal page → voice/messaging/audience triangulation",
      provider: p.provider,
      origin: "observed" as Origin,
    })),
    ...(colors.length > 0
      ? [{ source: colors[0].source, observed: `${colors.map((c) => `${c.usage} ${c.hex}`).join(" · ")}`, reason: "CSS paint declarations → role-assigned palette", provider: assets ? "direct:asset-discovery+tinyfish:fetch" : home.provider, origin: "observed" } as EvidenceItem]
      : []),
    ...(fontEvs.length > 0
      ? [{ source: fontEvs[0].contexts[0] ?? home.final_url, observed: `Families: ${fontEvs.slice(0, 4).map((f) => f.family).join(", ")}`, reason: "font-family / @font-face / webfont links → typography (observed)", provider: assets ? "direct:asset-discovery+tinyfish:fetch" : home.provider, origin: "observed" } as EvidenceItem]
      : []),
    { source: logo.url || favicon, observed: logo.evidence, reason: `Logo analysis → ${logo.reason}`, provider: home.provider, origin: "observed" },
  ];

  return {
    brand: { name, website: siteOrigin, description: description.slice(0, 500), tagline: tagline.slice(0, 200), category: categoryVerdict.category, categoryConfidence: categoryVerdict.confidence, categoryEvidence: categoryVerdict.evidence },
    logo: { url: logo.url, type: logo.type, reason: logo.reason, evidence: logo.evidence, source: logo.url ? `live asset (${logo.type})` : "Not detected", confidence: logo.confidence, origin: "observed" as Origin },
    favicon,
    colors,
    typography,
    visualStyle,
    messaging: {
      primaryValueProposition: tagline.slice(0, 300),
      keyMessages: headings.slice(0, 6),
      ctaPatterns: ctas,
      importantTerms: terms,
    },
    audience,
    confidence: { overall, colors: colorConf, typography: typoConfidence, voice: voiceConf, evidenceCoverage },
    sources: pages.map((p, i) => ({ url: p.final_url, pageType: pageTypeOf(p, i), provider: p.provider, title: p.title })),
    evidence,
    meta: {
      resolvedUrl: canonical,
      resolveMethod: method,
      tinyFishUsed: tinyFishUsedHolder.value,
      pagesFetched: pages.length,
      generatedAt: new Date().toISOString(),
    },
  };
}
