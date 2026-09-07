#!/usr/bin/env node
// fetch-evidence-media.mjs
//
// For a given evidence id, find imagery from the article sources that evidence card
// cites (content/sources.json), score candidates, and (optionally) download + normalize
// to a PNG at public/assets/evidence/<id>.png so existing .png registry refs stay valid.
//
// Modes:
//   list <id>            -> print ranked candidate image URLs + metadata (no download)
//   get  <id> <url>      -> download that exact candidate, normalize to PNG, write file
//   auto <id>            -> auto-pick best candidate and download (Commons fallback)
//
// Uses sharp (already a Next.js dependency) to normalize; keeps aspect; max width 1200.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const EVIDENCE = JSON.parse(fs.readFileSync(path.join(ROOT, "content/evidence.json"), "utf8"));
const SOURCES = JSON.parse(fs.readFileSync(path.join(ROOT, "content/sources.json"), "utf8"));
const OUT_DIR = path.join(ROOT, "public/assets/evidence");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const sourceById = new Map(SOURCES.map((s) => [s.id, s]));

// Brand -> common display/product name variants to make keyword scoring more robust.
const BRAND_ALIASES = {
  "liquid-iv": ["liquid iv", "liquidiv", "liquid-iv", "liquid i.v.", "rehydrat"],
  whoop: ["whoop", "strain", "recovery", "healthspan", "biometric"],
  celsius: ["celsius", "celsius live fit", "live fit", "energy drink"],
  ag1: ["ag1", "athletic greens", "ag1 pro", "scoop", "greens"],
  starbucks: ["starbucks", "psl", "pumpkin spice", "grande"],
  oura: ["oura", "oura ring", "gucci"],
  zen: ["zen", "binaural", "meditation", "sound therapy"],
  "red-bull": ["red bull", "redbull", "stratos", "wings"],
  "eight-sleep": ["eight sleep", "pod", "cover", "deep sleep", "cold"],
  "liquid-death": ["liquid death", "death"],
  "white-claw": ["white claw", "whiteclaw", "claw", "spiked"],
  "athletic-brewing": ["athletic brewing", "athletic", "non-alcoholic", "n.a.", "0.5%"],
  zyn: ["zyn", "zynn", "nicotine", "pouch", "upper deck"],
  "na-spirits": ["seedlip", "ritual", "na spirits", "zero proof", "non-alcoholic", "spirit"],
  prime: ["prime", "prime hydration", "hydration", "primes"],
};

function brandOf(ev) {
  return ev.brandId || "";
}
function brandAliases(ev) {
  const b = brandOf(ev);
  return BRAND_ALIASES[b] ? BRAND_ALIASES[b].concat([b]) : [b];
}

function genericWord(url) {
  return /(logo|icon|avatar|favicon|author|headshot|spotify|apple-podcasts|podcast|banner-nav|transparent|placeholder|default|og-default|apple-touch|sprite|arrow|checkmark|logo-)/i.test(
    url
  );
}
function small(url) {
  return false; // dimension check happens on metadata, not url
}
function absUrl(src, base) {
  try {
    return new URL(src, base).href;
  } catch {
    return null;
  }
}
function decodeNext(url) {
  // Next.js image optimizer: /_next/image?url=<encoded>&...  -> decode the nested url param
  const m = url.match(/[?&]url=([^&]+)/);
  if (url.includes("/_next/image") && m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  return url;
}

// Extract candidate images from an HTML document.
function extractCandidates(html, pageUrl) {
  const cands = new Map();
  const add = (raw, alt = "", ctx = "") => {
    if (!raw) return;
    let u = raw.trim();
    if (u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("#")) return;
    if (u.startsWith("//")) u = "https:" + u;
    // if raw comes from srcset without scheme
    if (u.startsWith("https://") || u.startsWith("http://")) {
      const decoded = decodeNext(u);
      if (decoded && !decoded.startsWith("data:")) {
        const key = decoded + "|" + alt + "|" + ctx;
        if (!cands.has(decoded)) cands.set(decoded, { url: decoded, alt, ctx });
      }
    } else {
      const abs = absUrl(u, pageUrl);
      if (abs) {
        const decoded = decodeNext(abs);
        if (!cands.has(decoded)) cands.set(decoded, { url: decoded, alt, ctx });
      }
    }
  };

  // og:image
  for (const m of html.matchAll(/<meta[^>]+property=["']og:image(?:[:.]|["'])/gi)) {
    const tag = m[0];
    const c = tag.match(/content=["']([^"']+)["']/);
    if (c) add(c[1], "og:image", "og");
  }
  // <img> tags with src/srcset + alt
  for (const m of html.matchAll(/<img[^>]+>/gi)) {
    const tag = m[0];
    const src = tag.match(/src=["']([^"']+)["']/);
    const alt = (tag.match(/alt=["']([^"']*)["']/) || [])[1] || "";
    const srcset = tag.match(/srcset=["']([^"']+)["']/);
    if (src) add(src[1], alt, "img");
    if (srcset) {
      for (const part of srcset[1].split(",")) {
        const u = part.trim().split(/\s+/)[0];
        add(u, alt, "srcset");
      }
    }
    // backgrounds
  }
  // <a> with <img> inside already covered.
  return [...cands.values()];
}

async function fetchText(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 25000);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/json" },
      redirect: "follow",
    });
    const ct = res.headers.get("content-type") || "";
    const buf = await res.arrayBuffer();
    return { status: res.status, text: Buffer.from(buf).toString("utf8"), ct };
  } finally {
    clearTimeout(t);
  }
}

async function probeImage(url) {
  // Download up to ~12MB and read metadata (dimensions/mime). Returns null on failure.
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 30000);
  const MAX = 12 * 1024 * 1024;
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { "User-Agent": UA, Referer: url },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const arr = new Uint8Array(await res.arrayBuffer());
    if (arr.length < 500) return null;
    const info = await sharp(Buffer.from(arr))
      .metadata()
      .catch(() => null);
    if (!info) return null;
    return { bytes: arr.length, width: info.width, height: info.height, format: info.format, data: Buffer.from(arr) };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function keywords(ev) {
  const t = (ev.title || "") + " " + (ev.description || "");
  const kw = [];
  // Raw topical keywords pulled from the title/description, lowercased.
  for (const w of t.split(/\s+/)) {
    const clean = w.toLowerCase().replace(/[^a-z0-9.%+-]/g, "");
    if (clean.length >= 4 && !["this","that","with","from","your","about","they","them","their","into","been","when","still","only","just","more","than","before","after","where","which","which","what","said","when","them","then","like","some","has","have","were","was","are","for","not","you","the","and","but","out","one","two","who","how","why","its","all","can","will","would","could","their","make","made","made","most","many","much","very","also","been","over","under","even","does","does","each","both","such","only","same","than","that","then"].includes(clean)) kw.push(clean);
  }
  return kw;
}

function scoreCandidate(ev, c) {
  const al = [...brandAliases(ev), ...keywords(ev)];
  const hay = (c.alt + " " + c.ctx + " " + c.url).toLowerCase();
  let score = 0;
  for (const k of al) {
    const rk = k.replace(/[^a-z0-9.%+-]/g, "").toLowerCase();
    if (rk && rk.length >= 3 && (hay.includes(k.toLowerCase()) || hay.includes(rk))) score += 2;
  }
  if (/og:image/i.test(hay)) score += 1.5;
  if (genericWord(c.url)) score -= 6;
  if (/\.svg/i.test(c.url)) score -= 4;
  if (/badge|seal|logo|mark|icon|tin$/i.test(c.url)) score -= 1;
  if (/\.(jpg|jpeg|png|webp)$/i.test(c.url)) score += 1;
  return score;
}

function pickBest(ev, cands) {
  const scored = cands
    .filter((c) => !genericWord(c.url) && !/\.svg$/i.test(c.url))
    .map((c) => ({ c, score: scoreCandidate(ev, c) }))
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  return scored[0].c;
}

// Wikimedia Commons fallback.
async function commonsSearchAndDownload(ev, outPath) {
  const aliases = brandAliases(ev);
  const query = aliases.join(" ");
  const api =
    "https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=20&format=json&srsearch=" +
    encodeURIComponent(query);
  let res;
  try {
    res = await fetchText(api);
  } catch {
    return null;
  }
  const parsed = JSON.parse(res.text).query.search || [];
  // Prefer files with raster ext and image-ish names; skip svg/logos where possible.
  const files = parsed
    .map((r) => r.title)
    .filter((t) => /\.(jpg|jpeg|png|webp)$/i.test(t) && !/logo|icon|flag|map|coat/.test(t));
  for (const title of files.slice(0, 8)) {
    const infourl =
      "https://commons.wikimedia.org/w/api.php?action=query&titles=" +
      encodeURIComponent(title) +
      "&prop=imageinfo&iiprop=url|size&iiurlwidth=1200&format=json";
    try {
      const fr = await fetchText(infourl);
      const pages = JSON.parse(fr.text).query.pages;
      const page = Object.values(pages)[0];
      const ii = page && page.imageinfo && page.imageinfo[0];
      const thumb = ii && (ii.thumburl || ii.url);
      if (thumb) {
        const img = await probeImage(thumb);
        if (img && img.width >= 400) {
          await writeNormalized(img.data, outPath);
          return { ok: true, usedSource: "commons", sourceUrl: thumb, width: img.width, height: img.height, bytes: (await fs.promises.stat(outPath)).size };
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function writeNormalized(buf, outPath) {
  const img = sharp(buf).rotate();
  const meta = await img.metadata();
  if (meta.width > 1200) {
    const b = await sharp(buf).rotate().resize({ width: 1200, withoutEnlargement: true }).png().toBuffer();
    await fs.promises.writeFile(outPath, b);
  } else {
    const b = await sharp(buf).rotate().png().toBuffer();
    await fs.promises.writeFile(outPath, b);
  }
}

async function downloadToFile(url, outPath) {
  const img = await probeImage(url);
  if (!img) return null;
  await writeNormalized(img.data, outPath);
  return img;
}

async function main() {
  const [mode, id, givenUrl] = process.argv.slice(2);
  const ev = EVIDENCE.find((e) => e.id === id);
  if (!ev) {
    console.error(JSON.stringify({ ok: false, error: `unknown evidence id: ${id}` }));
    process.exit(1);
  }
  const outPath = path.join(OUT_DIR, `${id}.png`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Resolve cited source URLs.
  const srcIds = ev.sourceIds || [];
  const urls = srcIds.map((sid) => sourceById.get(sid)?.url).filter(Boolean);
  const candidates = [];
  for (const u of urls) {
    try {
      const r = await fetchText(u);
      if (r.text) {
        for (const c of extractCandidates(r.text, u)) candidates.push(c);
      }
    } catch {
      /* skip */
    }
  }

  if (mode === "list") {
    const ranked = candidates
      .map((c) => ({ ...c, score: scoreCandidate(ev, c) }))
      .sort((a, b) => b.score - a.score);
    console.log(JSON.stringify({ id, sourceUrls: urls, candidates: ranked.slice(0, 40) }, null, 2));
    return;
  }

  if (mode === "get") {
    if (!givenUrl) {
      console.error(JSON.stringify({ ok: false, error: "get requires a url" }));
      process.exit(1);
    }
    const img = await downloadToFile(givenUrl, outPath);
    if (img) {
      console.log(JSON.stringify({ ok: true, id, usedSource: "candidate", sourceUrl: givenUrl, outPath, width: img.width, height: img.height, bytes: fs.statSync(outPath).size }));
    } else {
      console.log(JSON.stringify({ ok: false, id, error: "download/probe failed", sourceUrl: givenUrl }));
    }
    return;
  }

  // auto mode
  let picked = pickBest(ev, candidates);
  if (picked) {
    const img = await downloadToFile(picked.url, outPath);
    if (img) {
      console.log(JSON.stringify({ ok: true, id, usedSource: "candidate", sourceUrl: picked.url, outPath, width: img.width, height: img.height, bytes: fs.statSync(outPath).size }));
      return;
    }
  }
  const fb = await commonsSearchAndDownload(ev, outPath);
  if (fb) {
    console.log(JSON.stringify({ ok: true, id, ...fb }));
    return;
  }
  console.log(JSON.stringify({ ok: false, id, error: "no usable image", candidates: candidates.length }));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }));
  process.exit(1);
});
