/**
 * lib/tinyfish.ts — centralized TinyFish integration.
 *
 * BrandForge AI uses TinyFish as the core web-extraction layer.
 * All live-website reads go through this module so credentials
 * stay server-side and the provider can be audited in one place.
 *
 * TinyFish products used:
 *  - Fetch API  POST https://api.fetch.tinyfish.ai
 *    (live browser-rendered fetch → clean markdown/html + links,
 *     image_links, page_metadata incl. favicon / og tags)
 *  - Search API GET https://api.search.tinyfish.ai?query=...
 *    (company-name → URL resolution + competitor discovery)
 *
 * Auth: X-API-Key: process.env.TINYFISH_API_KEY (server only).
 * When no key is configured the module falls back to a clearly-labelled
 * direct server-side fetch so the UI/demo still works for reviewers.
 * Every result carries `provider: "tinyfish:fetch" | "tinyfish:search" |
 * "fallback:direct"` so the UI "Evidence" panel can prove TinyFish usage.
 */

const FETCH_ENDPOINT = "https://api.fetch.tinyfish.ai";
const SEARCH_ENDPOINT = "https://api.search.tinyfish.ai";

export interface TinyPageMetadata {
  canonical?: string;
  favicon?: string;
  og?: Record<string, unknown>;
  twitter?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface TinyPage {
  url: string;
  final_url: string;
  title?: string | null;
  description?: string | null;
  language?: string | null;
  format: "markdown" | "html";
  /** Clean markdown (or html when format=html). May be null on error paths. */
  text?: string | null;
  /** Raw cleaned HTML when requested — used for color/font/logo evidence. */
  html?: string | null;
  links?: string[];
  image_links?: string[];
  page_metadata?: TinyPageMetadata | null;
  provider: "tinyfish:fetch" | "fallback:direct";
  latency_ms?: number | null;
}

export interface TinyFetchError {
  url: string;
  error: string;
  status?: number;
}

export interface TinySearchResult {
  title: string;
  url: string;
  snippet?: string;
  site_name?: string;
  provider: "tinyfish:search" | "fallback:direct";
}

export function isTinyFishConfigured(): boolean {
  return Boolean(process.env.TINYFISH_API_KEY && process.env.TINYFISH_API_KEY.length > 8);
}

export function getTinyFishStatus() {
  const configured = isTinyFishConfigured();
  return {
    configured,
    mode: configured ? ("tinyfish-live" as const) : ("fallback-direct" as const),
    fetchEndpoint: FETCH_ENDPOINT,
    searchEndpoint: SEARCH_ENDPOINT,
    note: configured
      ? "TinyFish API key detected. All live-site reads use TinyFish Fetch/Search."
      : "TINYFISH_API_KEY not set. Using labelled server-side direct fetch fallback. Set TINYFISH_API_KEY to enable live TinyFish extraction.",
  };
}

/** Normalize user input — accepts full URLs or bare domains or company names. */
export function looksLikeUrl(input: string): boolean {
  const t = input.trim();
  return /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(t) && !t.includes(" ");
}

export function normalizeUrl(input: string): string {
  let t = input.trim();
  if (!/^https?:\/\//i.test(t)) t = "https://" + t;
  const u = new URL(t);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only http(s) URLs are allowed.");
  return u.toString();
}

function isBlockedHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "::1" ||
      h.endsWith(".local") ||
      h.startsWith("10.") ||
      h.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      h === "169.254.169.254" ||
      h.includes("metadata.google")
    );
  } catch {
    return true;
  }
}

export function assertSafeUrl(url: string) {
  if (isBlockedHost(url)) throw new Error("Blocked host (private/local/metadata addresses are not allowed).");
}

/* ------------------------------------------------------------------ */
/* TinyFish Fetch                                                      */
/* ------------------------------------------------------------------ */

interface FetchOpts {
  format?: "markdown" | "html";
  links?: boolean;
  image_links?: boolean;
  page_metadata?: boolean;
  purpose?: string;
  ttl?: number;
  timeoutMs?: number;
}

export async function tinyFetchPages(
  urls: string[],
  opts: FetchOpts = {}
): Promise<{ pages: TinyPage[]; errors: TinyFetchError[]; provider: string }> {
  const apiKey = process.env.TINYFISH_API_KEY;
  if (apiKey) {
    try {
      return await tinyFetchViaApi(urls, opts, apiKey);
    } catch (e) {
      // Transparent degradation: report the TinyFish failure and fall back
      // so a single provider outage doesn't brick the demo.
      const msg = e instanceof Error ? e.message : String(e);
      const fallback = await directFetchPages(urls, opts);
      return {
        pages: fallback.pages,
        errors: [...fallback.errors, { url: urls[0] ?? "", error: `tinyfish_error: ${msg}` }],
        provider: "fallback:direct (tinyfish failed)",
      };
    }
  }
  return { ...(await directFetchPages(urls, opts)), provider: "fallback:direct" };
}

async function tinyFetchViaApi(
  urls: string[],
  opts: FetchOpts,
  apiKey: string
): Promise<{ pages: TinyPage[]; errors: TinyFetchError[]; provider: string }> {
  const body = {
    urls,
    format: opts.format ?? "markdown",
    links: opts.links ?? true,
    image_links: opts.image_links ?? true,
    page_metadata: opts.page_metadata ?? true,
    purpose: opts.purpose ?? "Extract brand identity: name, logo, colors, fonts, messaging, audience.",
    ttl: opts.ttl ?? 0, // 0 = prefer a live fetch (bounty requires LIVE site reads)
    per_url_timeout_ms: opts.timeoutMs ?? 45000,
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), (opts.timeoutMs ?? 45000) + 15000);
  try {
    const res = await fetch(FETCH_ENDPOINT, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`TinyFish Fetch HTTP ${res.status}: ${txt.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      results?: Array<Record<string, unknown>>;
      errors?: Array<{ url: string; error: string; status?: number }>;
    };
    const pages: TinyPage[] = (json.results ?? []).map((r) => ({
      url: String(r.url ?? ""),
      final_url: String(r.final_url ?? r.url ?? ""),
      title: (r.title as string) ?? null,
      description: (r.description as string) ?? null,
      language: (r.language as string) ?? null,
      format: ((r.format as string) ?? "markdown") as TinyPage["format"],
      text: (r.text as string) ?? null,
      links: (r.links as string[]) ?? [],
      image_links: (r.image_links as string[]) ?? [],
      page_metadata: (r.page_metadata as TinyPageMetadata) ?? null,
      provider: "tinyfish:fetch",
      latency_ms: (r.latency_ms as number) ?? null,
    }));
    // TinyFish markdown endpoint doesn't return HTML; fetch HTML in parallel
    // for the homepage when color/font evidence is needed (caller decides).
    return { pages, errors: json.errors ?? [], provider: "tinyfish:fetch" };
  } finally {
    clearTimeout(t);
  }
}

/** Fetch raw HTML as well (for color/font/logo evidence) via TinyFish html format. */
export async function tinyFetchHtml(urls: string[], apiKeyRequired = false) {
  const apiKey = process.env.TINYFISH_API_KEY;
  if (!apiKey) {
    if (apiKeyRequired) throw new Error("TINYFISH_API_KEY is required for HTML evidence fetch.");
    const d = await directFetchPages(urls, { format: "html" });
    return d.pages;
  }
  const body = {
    urls,
    format: "html",
    links: true,
    image_links: true,
    page_metadata: true,
    purpose: "Extract visual brand evidence: CSS colors, font-family declarations, logo/img URLs, favicon.",
    ttl: 0,
    per_url_timeout_ms: 45000,
  };
  const res = await fetch(FETCH_ENDPOINT, {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`TinyFish HTML fetch HTTP ${res.status}`);
  const json = (await res.json()) as { results?: Array<Record<string, unknown>> };
  return (json.results ?? []).map((r) => ({
    url: String(r.url ?? ""),
    final_url: String(r.final_url ?? r.url ?? ""),
    html: (r.text as string) ?? null,
    links: (r.links as string[]) ?? [],
    image_links: (r.image_links as string[]) ?? [],
    page_metadata: (r.page_metadata as TinyPageMetadata) ?? null,
    title: (r.title as string) ?? null,
    description: (r.description as string) ?? null,
    provider: "tinyfish:fetch" as const,
  }));
}

/* ------------------------------------------------------------------ */
/* Direct fallback (labelled, never masqueraded as TinyFish)            */
/* ------------------------------------------------------------------ */

async function directFetchPages(
  urls: string[],
  opts: FetchOpts
): Promise<{ pages: TinyPage[]; errors: TinyFetchError[] }> {
  const pages: TinyPage[] = [];
  const errors: TinyFetchError[] = [];
  for (const raw of urls.slice(0, 10)) {
    try {
      assertSafeUrl(raw);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25000);
      const started = Date.now();
      const res = await fetch(raw, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": "BrandForgeAI/1.0 (+brand-guide-generator; contact: demo)",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      }).finally(() => clearTimeout(t));
      if (!res.ok) {
        errors.push({ url: raw, error: res.status === 404 ? "page_not_found" : "target_http_error", status: res.status });
        continue;
      }
      const html = await res.text();
      const final_url = res.url || raw;
      const text = htmlToMarkdownish(html);
      pages.push({
        url: raw,
        final_url,
        title: extractTag(html, "title"),
        description: extractMeta(html, "description") ?? extractMeta(html, "og:description"),
        language: extractHtmlLang(html),
        format: "markdown",
        text,
        html: opts.format === "html" ? html : html,
        links: extractLinks(html, final_url),
        image_links: extractImages(html, final_url),
        page_metadata: extractPageMetadata(html, final_url),
        provider: "fallback:direct",
        latency_ms: Date.now() - started,
      });
    } catch (e) {
      errors.push({ url: raw, error: e instanceof Error ? `fetch_failed: ${e.message}` : "fetch_failed" });
    }
  }
  return { pages, errors };
}

function stripScripts(s: string) {
  return s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
}
function htmlToMarkdownish(html: string): string {
  let s = stripScripts(html);
  // headings
  s = s.replace(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, l, t) => `\n${"#".repeat(Number(l))} ${stripTags(t)}\n`);
  s = s.replace(/<(p|li|div|section|br)[^>]*>/gi, "\n");
  s = s.replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, h, t) => `${stripTags(t)} (${h})`);
  s = s.replace(/<button[^>]*>([\s\S]*?)<\/button>/gi, (_, t) => `\n[CTA: ${stripTags(t)}]\n`);
  const txt = stripTags(s).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return txt.slice(0, 60000);
}
function stripTags(s: string) {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
function extractTag(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? stripTags(m[1]).slice(0, 300) : null;
}
function extractMeta(html: string, name: string): string | null {
  const m =
    html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["']`, "i")) ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]* (?:name|property)=["']${name}["']`, "i"));
  return m ? m[1].slice(0, 500) : null;
}
function extractHtmlLang(html: string): string | null {
  const m = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
  return m ? m[1] : null;
}
function resolveUrl(base: string, rel: string): string | null {
  try {
    const u = new URL(rel, base);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}
function extractLinks(html: string, base: string): string[] {
  const out = new Set<string>();
  const re = /<a[^>]+href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.size < 300) {
    const r = resolveUrl(base, m[1]);
    if (r) out.add(r.split("#")[0]);
  }
  return [...out];
}
function extractImages(html: string, base: string): string[] {
  const out = new Set<string>();
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.size < 300) {
    const r = resolveUrl(base, m[1]);
    if (r) out.add(r);
  }
  // og:image is often the strongest logo/social asset
  const og = extractMeta(html, "og:image");
  if (og) {
    const r = resolveUrl(base, og);
    if (r) out.add(r);
  }
  return [...out];
}
function extractPageMetadata(html: string, base: string): TinyPageMetadata {
  const favicon =
    html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i)?.[1] ??
    null;
  return {
    canonical: html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ?? undefined,
    favicon: favicon ? resolveUrl(base, favicon) ?? new URL("/favicon.ico", base).toString() : new URL("/favicon.ico", base).toString(),
    og: {
      title: extractMeta(html, "og:title"),
      description: extractMeta(html, "og:description"),
      image: extractMeta(html, "og:image"),
      site_name: extractMeta(html, "og:site_name"),
    },
    twitter: { card: extractMeta(html, "twitter:card"), image: extractMeta(html, "twitter:image") },
  };
}

/* ------------------------------------------------------------------ */
/* TinyFish Search                                                      */
/* ------------------------------------------------------------------ */

export async function tinySearch(query: string, count = 8): Promise<TinySearchResult[]> {
  const apiKey = process.env.TINYFISH_API_KEY;
  if (!apiKey) return [];
  const url = `${SEARCH_ENDPOINT}?query=${encodeURIComponent(query)}&language=en`;
  const res = await fetch(url, { headers: { "X-API-Key": apiKey } });
  if (!res.ok) throw new Error(`TinyFish Search HTTP ${res.status}`);
  const json = (await res.json()) as { results?: Array<{ title: string; url: string; snippet?: string; site_name?: string }> };
  return (json.results ?? []).slice(0, count).map((r) => ({ ...r, provider: "tinyfish:search" as const }));
}

/** Resolve "stripe" / "Linear" / bare domain → canonical https URL. */
export async function resolveInputToUrl(input: string): Promise<{ url: string; method: string }> {
  const t = input.trim();
  if (looksLikeUrl(t)) return { url: normalizeUrl(t), method: "direct-url" };
  // Company name → TinyFish Search for official site
  const apiKey = process.env.TINYFISH_API_KEY;
  if (apiKey) {
    try {
      const results = await tinySearch(`${t} official website`, 5);
      const hit = results.find((r) => {
        try {
          assertSafeUrl(r.url);
          return true;
        } catch {
          return false;
        }
      });
      if (hit) return { url: hit.url, method: `tinyfish:search "${t} official website" → ${hit.url}` };
    } catch {
      // fall through to heuristic
    }
  }
  // Heuristic fallback (labelled, honest about which path was taken)
  const slug = t.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (slug.length >= 2) {
    const why = apiKey
      ? "TinyFish Search returned no usable official site; trying https://<name>.com"
      : "no TinyFish Search key; trying https://<name>.com";
    return { url: `https://${slug}.com`, method: `heuristic-slug (${why})` };
  }
  throw new Error(`Could not resolve "${input}" to a URL. Provide a full https:// URL.`);
}

/** Page-type labels for discovered internal pages (evidence: what each page is for). */
const PAGE_TYPE_RULES: Array<{ type: string; res: RegExp[]; score: number }> = [
  { type: "about", res: [/\/about/, /\/company/, /\/who-we-are/, /\/mission/, /\/values/, /\/story/, /\/manifesto/], score: 100 },
  { type: "product", res: [/\/product/, /\/products/, /\/feature/, /\/platform/, /\/solution/, /\/tour/], score: 94 },
  { type: "pricing", res: [/\/pricing/, /\/plans/, /\/cost/], score: 88 },
  { type: "customers", res: [/\/customer/, /\/case-stud/, /\/stories/, /\/testimonial/, /\/reviews/, /\/wall-of-love/], score: 82 },
  { type: "docs", res: [/\/docs/, /\/documentation/, /\/developers/, /\/api/, /\/guides?/], score: 76 },
  { type: "help", res: [/\/help/, /\/support/, /\/faq/, /\/knowledge/, /\/hc\./], score: 72 },
  { type: "blog", res: [/\/blog/, /\/changelog/, /\/updates/, /\/news/, /\/press/], score: 64 },
  { type: "brand", res: [/\/brand/, /\/press-kit/, /\/media-kit/, /\/logo/, /\/styleguide/], score: 60 },
  { type: "contact", res: [/\/contact/, /\/demo/, /\/trial/, /\/signup/, /\/sign-up/, /\/get-started/], score: 54 },
  { type: "careers", res: [/\/career/, /\/jobs/, /\/hiring/, /\/team/], score: 46 },
  { type: "security", res: [/\/security/, /\/trust/, /\/compliance/, /\/privacy/, /\/legal/], score: 42 },
];

export interface DiscoveredPage {
  url: string;
  pageType: string;
}

/** Pick high-signal same-origin internal pages, labelled by type. Never fetches blindly. */
export function pickRelevantPages(homepageLinks: string[], origin: string, max = 6): DiscoveredPage[] {
  const siteHost = (() => { try { return new URL(origin).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const sameSite = (l: string): boolean => {
    try {
      const h = new URL(l).hostname.replace(/^www\./, "");
      return h === siteHost || h.endsWith(`.${siteHost}`);
    } catch {
      return false;
    }
  };
  const sameOrigin = homepageLinks.filter(sameSite);
  const ranked: Array<DiscoveredPage & { score: number }> = [];
  const seen = new Set<string>();
  for (const l of sameOrigin) {
    const clean = l.split("#")[0].replace(/\/$/, "");
    if (seen.has(clean) || clean === origin || clean === origin + "/") continue;
    seen.add(clean);
    if (/\.(pdf|png|jpe?g|svg|css|js|ico|woff2?)(\?|$)/i.test(clean)) continue; // assets aren't pages
    const path = (() => { try { return new URL(clean).pathname; } catch { return clean; } })();
    let best: { type: string; score: number } | null = null;
    for (const rule of PAGE_TYPE_RULES) {
      if (rule.res.some((re) => re.test(clean) || re.test(path))) {
        if (!best || rule.score > best.score) best = { type: rule.type, score: rule.score };
      }
    }
    if (!best) continue;
    let score = best.score;
    if (clean.split("/").length > 6) score -= 20; // penalize deep links
    ranked.push({ url: l, pageType: best.type, score });
  }
  // one page per type max — breadth over depth
  const byType = new Map<string, (typeof ranked)[number]>();
  for (const r of ranked.sort((a, b) => b.score - a.score)) {
    if (!byType.has(r.pageType)) byType.set(r.pageType, r);
  }
  return [...byType.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ url, pageType }) => ({ url, pageType }));
}

/** True when an error message signals a TinyFish rate limit (caller maps to 503). */
export function isRateLimitError(msg: string): boolean {
  return /HTTP 429|rate.?limit|RATE_LIMIT|429/i.test(msg);
}

/* ------------------------------------------------------------------ */
/* Raw-HTML asset discovery (supplement only — never page copy)         */
/* ------------------------------------------------------------------ */
/**
 * Fetches a page's RAW html for one purpose only: discovering same-site
 * ASSET urls (stylesheets, SVGs, logo <img> with alt text, theme-color,
 * webfont links) that TinyFish's cleaned semantic HTML strips out.
 * Page copy/structure/assets always come from TinyFish Fetch; this is
 * labelled `direct:asset-discovery` in evidence whenever it contributes.
 * SSRF-guarded, 15s timeout, 1.5MB cap.
 */
export interface AssetDiscovery {
  provider: "direct:asset-discovery";
  stylesheets: string[];
  fontLinks: string[];
  themeColor: string | null;
  headerImages: Array<{ src: string; alt: string; inHeader: boolean }>;
  svgFills: string[];
}

export async function discoverPageAssets(pageUrl: string, origin: string): Promise<AssetDiscovery | null> {
  const empty: AssetDiscovery = { provider: "direct:asset-discovery", stylesheets: [], fontLinks: [], themeColor: null, headerImages: [], svgFills: [] };
  try {
    assertSafeUrl(pageUrl);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    let html = "";
    try {
      const res = await fetch(pageUrl, {
        signal: ctrl.signal,
        headers: { "User-Agent": "BrandForgeAI/1.0 (+brand-guide-generator; asset discovery only)", Accept: "text/html" },
        redirect: "follow",
      });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 1500000) return null;
      html = new TextDecoder().decode(buf).slice(0, 1500000);
    } finally {
      clearTimeout(t);
    }
    const abs = (rel: string): string | null => {
      try {
        const u = new URL(rel, origin);
        return ["http:", "https:"].includes(u.protocol) ? u.toString().split("#")[0] : null;
      } catch {
        return null;
      }
    };
    // stylesheets (any https host — SSRF-guarded by assertSafeUrl-style check below)
    for (const m of html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)) {
      const u = abs(m[1]);
      if (u && empty.stylesheets.length < 5 && !isBlockedHost(u)) empty.stylesheets.push(u);
    }
    // webfont links
    for (const m of html.matchAll(/<link[^>]+href=["']([^"']*(?:fonts\.googleapis|fonts\.gstatic|font|typekit)[^"']*)["'][^>]*>/gi)) {
      const u = abs(m[1]);
      if (u && empty.fontLinks.length < 5) empty.fontLinks.push(u);
    }
    // theme-color
    const theme = html.match(/<meta[^>]+name=["']theme-color["'][^>]*content=["']([^"']+)["']/i)?.[1];
    if (theme && /^#[0-9a-fA-F]{3,8}$/.test(theme.trim())) empty.themeColor = theme.trim().slice(0, 7);
    // header/nav region for logo context
    const headerHtml = html.match(/<header[\s\S]{0,40000}?<\/header>/i)?.[0] ?? html.match(/<nav[\s\S]{0,20000}?<\/nav>/i)?.[0] ?? "";
    const imgRe = /<img[^>]*>/gi;
    const seen = new Set<string>();
    const collect = (scope: string, inHeader: boolean) => {
      let im: RegExpExecArray | null;
      while ((im = imgRe.exec(scope)) && empty.headerImages.length < 12) {
        const src = im[0].match(/\ssrc=["']([^"']+)["']/i)?.[1];
        if (!src) continue;
        const u = abs(src);
        if (!u || seen.has(u)) continue;
        seen.add(u);
        empty.headerImages.push({ src: u, alt: (im[0].match(/\salt=["']([^"']*)["']/i)?.[1] ?? "").slice(0, 120), inHeader });
      }
    };
    if (headerHtml) collect(headerHtml, true);
    // inline SVG fills anywhere (brand marks are often inline SVG)
    for (const m of html.matchAll(/<(?:svg|path|circle|rect|polygon)[^>]*(?:fill|stroke)=["'](#[0-9a-fA-F]{3,8})["'][^>]*>/gi)) {
      if (empty.svgFills.length < 40) empty.svgFills.push(m[1]);
    }
    return empty;
  } catch {
    return null;
  }
}
