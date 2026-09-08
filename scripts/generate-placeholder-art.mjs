#!/usr/bin/env node
/**
 * DSIM placeholder art generator.
 *
 * Dependency-free (node:fs, node:path only) and fully deterministic:
 * every SVG is built from explicit per-id parameters in MANIFEST — no
 * randomness, no clock, no entropy of any kind. Running this script
 * twice produces byte-identical output.
 *
 * Usage: node scripts/generate-placeholder-art.mjs   (from anywhere)
 * Writes: public/assets/{characters,backgrounds,cg,evidence,ui,reveal}/*.svg
 *         plus public/assets/map/zones/*.svg (one replaceable marker per location)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------- repo root
const scriptDir = decodeURIComponent(new URL(".", import.meta.url).pathname).replace(/\/$/, "");
const ROOT = dirname(scriptDir);
const OUT = join(ROOT, "public", "assets");

// ---------------------------------------------------------------- palette
const NAVY = "#0b0e17"; // near-black base
const NAVY2 = "#131829"; // deep navy base
const WARM = "#f2b8c6"; // soft warm accent

// ---------------------------------------------------------------- svg atoms
const att = (fill) => (fill == null ? "" : ` fill="${fill}"`);
const rect = (x, y, w, h, fill, extra = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}"${att(fill)}${extra}/>`;
const circ = (cx, cy, r, fill, extra = "") => `<circle cx="${cx}" cy="${cy}" r="${r}"${att(fill)}${extra}/>`;
const ell = (cx, cy, rx, ry, fill, extra = "") =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${att(fill)}${extra}/>`;
const path = (d, fill, extra = "") => `<path d="${d}"${att(fill)}${extra}/>`;
const stopOf = ([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a == null ? "" : ` stop-opacity="${a}"`}/>`;
const lg = (id, x1, y1, x2, y2, ...stops) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(stopOf).join("")}</linearGradient>`;
const rg = (id, cx, cy, r, ...stops) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(stopOf).join("")}</radialGradient>`;
const pat = (id, w, h, cells) =>
  `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse">${cells.join("")}</pattern>`;
function doc(w, h, defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>\n`;
}

// ================================================================ CHARACTERS
// Stylized bust silhouette (head + shoulders), rim-lit from upper-right.

function bust(tilt, dy, inset) {
  const i = inset;
  const tf = `rotate(${tilt} 450 706)` + (dy ? ` translate(0 ${dy})` : "");
  return (
    `<g transform="${tf}">` +
    ell(272, 566, 48, 112, null) + // hair side-lock L
    ell(628, 566, 48, 112, null) + // hair side-lock R
    path("M404 690 L496 690 L502 816 L398 816 Z", null) + // neck
    path(
      `M${110 + i} 1100 C${118 + i} 952 ${244 + i} 852 ${392 + i} 818 L${392 + i} 804 Q450 840 ${508 - i} 804 ` +
        `L${508 - i} 818 C${656 - i} 852 ${782 - i} 952 ${790 - i} 1100 Z`,
      null,
    ) + // shoulders/torso
    ell(450, 500, 202, 216, null) + // hair mass
    ell(450, 574, 158, 188, null) + // head (featureless)
    `</g>`
  );
}

const POSES = {
  neutral: {
    tilt: 0, dy: 0, inset: 0, rim: 0.8,
    extra: (A) =>
      path("M392 812 Q450 850 508 812", "none", ` stroke="${A}" stroke-width="6" stroke-opacity=".5"`) +
      path("M672 902 L652 1098", "none", ` stroke="${A}" stroke-width="8" stroke-opacity=".2" stroke-linecap="round"`),
  },
  happy: {
    tilt: -3, dy: -12, inset: -6, rim: 0.9,
    extra: (A, W) =>
      `<g stroke="${A}" stroke-width="11" stroke-linecap="round" stroke-opacity=".85">` +
      path("M664 400 L664 458", "none") +
      path("M635 429 L693 429", "none") +
      `</g>` +
      circ(240, 356, 7, W, ' opacity=".8"') +
      circ(206, 420, 4, W, ' opacity=".55"'),
  },
  annoyed: {
    tilt: 7, dy: 6, inset: 4, rim: 0.7,
    extra: (A) =>
      `<g stroke="${A}" stroke-width="10" stroke-linecap="round" stroke-opacity=".55">` +
      path("M296 470 L342 444", "none") +
      path("M322 508 L372 480", "none") +
      `</g>` +
      rect(338, 486, 224, 20, "#04060e", ' opacity=".5" rx="10"'),
  },
  embarrassed: {
    tilt: -9, dy: 4, inset: 16, rim: 0.75, blur: true,
    extra: (A, W) =>
      `<g filter="url(#soft)" fill="${A}" fill-opacity=".32">` +
      circ(306, 646, 40) +
      circ(594, 646, 40) +
      `</g>` +
      circ(676, 300, 5, W, ' opacity=".7"'),
  },
  special: {
    tilt: -2, dy: -6, inset: -4, rim: 1, aura: true,
    extra: (A, W) =>
      `<g fill="${W}">` +
      path("M688 316 L704 342 L688 368 L672 342 Z") +
      path("M212 396 L226 418 L212 440 L198 418 Z") +
      circ(642, 238, 6, W, ' opacity=".9"') +
      `</g>` +
      circ(258, 300, 4, A, ' opacity=".8"'),
  },
};

function characterSvg(A, expression) {
  const p = POSES[expression];
  if (!p) throw new Error(`unknown expression: ${expression}`);
  const defs =
    lg("bodyG", 0, 0, 0, 1, [0, "#1b2242"], [1, NAVY]) +
    lg("rimG", 1, 0, 0, 1, [0, A, 0.95], [0.5, A, 0.3], [1, A, 0]) +
    (p.aura ? rg("aura", 0.5, 0.5, 0.5, [0, A, 0.38], [1, A, 0]) : "") +
    (p.blur
      ? '<filter id="soft" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="16"/></filter>'
      : "");
  const b = bust(p.tilt, p.dy, p.inset);
  const body =
    (p.aura ? circ(450, 560, 430, "url(#aura)") : "") +
    `<g transform="translate(14 -8)" fill="url(#rimG)" opacity="${p.rim}">${b}</g>` +
    `<g fill="url(#bodyG)">${b}</g>` +
    p.extra(A, WARM);
  return doc(900, 1100, defs, body); // transparent background sprite
}

// ================================================================ SHARED BITS
function planeSilhouette() {
  // side view, nose pointing left; inherits fill from parent <g>
  return (
    ell(0, -4, 100, 13, null) +
    path("M78 -10 L104 -46 L120 -43 L100 -7 Z", null) + // tail fin
    path("M84 -6 L118 -25 L127 -20 L102 -1 Z", null) + // stabilizer
    path("M-8 3 L52 36 L28 41 L-30 9 Z", null) + // wing
    ell(30, 11, 17, 9, null)
  ); // engine
}

function qp(p0, p1, p2, t) {
  const u = 1 - t;
  return [
    Math.round(u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0]),
    Math.round(u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]),
  ];
}

// ================================================================ BACKGROUNDS
function bgHub() {
  const defs =
    lg("skyH", 0, 0, 0, 1, [0, "#161c36"], [0.55, "#0f1428"], [1, NAVY]) +
    rg("haloH", 0.5, 0.5, 0.5, [0, WARM, 0.32], [1, WARM, 0]) +
    pat("winF", 42, 54, [
      rect(6, 8, 14, 20, "#8ecbff", ' opacity=".16"'),
      rect(24, 32, 14, 20, WARM, ' opacity=".14"'),
    ]) +
    pat("winM", 58, 74, [
      rect(8, 10, 20, 26, WARM, ' opacity=".5"'),
      rect(32, 42, 20, 26, "#8ecbff", ' opacity=".4"'),
    ]) +
    pat("winT", 34, 44, [
      rect(5, 7, 12, 16, WARM, ' opacity=".8"'),
      rect(19, 7, 12, 16, WARM, ' opacity=".3"'),
      rect(19, 25, 12, 16, "#8ecbff", ' opacity=".5"'),
    ]);
  let b = rect(0, 0, 1920, 1080, "url(#skyH)");
  b += circ(1560, 170, 120, "url(#haloH)") + circ(1560, 170, 58, WARM, ' opacity=".9"');
  const building = (x, w, hgt, fill, pid) =>
    rect(x, 1080 - hgt, w, hgt, fill) + (pid ? rect(x, 1080 - hgt, w, hgt, `url(#${pid})`, ' opacity=".85"') : "");
  for (const [x, w, hgt] of [[-30, 300, 470], [300, 240, 560], [560, 260, 440], [840, 260, 580], [1140, 260, 480], [1420, 300, 620], [1740, 240, 500]])
    b += building(x, w, hgt, "#101631", "winF");
  for (const [x, w, hgt] of [[60, 340, 700], [520, 300, 640], [1080, 320, 720], [1500, 340, 660]])
    b += building(x, w, hgt, "#0b0f26", "winM");
  // hero tower with dense lit grid + beacon
  b += rect(880, 200, 170, 880, "#080b1a") + rect(880, 200, 170, 880, "url(#winT)", ' opacity=".9"');
  b += rect(957, 130, 6, 74, "#080b1a") + circ(960, 124, 8, WARM, ' opacity=".95"');
  // dark near flanks + a few bright windows
  b += rect(-60, 220, 380, 860, "#070a18") + rect(1600, 180, 380, 900, "#070a18");
  for (const [wx, wy] of [[60, 340], [140, 520], [220, 700]]) b += rect(wx, wy, 34, 46, WARM, ' opacity=".5"');
  for (const [wx, wy] of [[1700, 300], [1790, 480], [1870, 660]]) b += rect(wx, wy, 34, 46, "#8ecbff", ' opacity=".45"');
  b += rect(0, 1020, 1920, 60, "#060912") + rect(0, 1016, 1920, 4, WARM, ' opacity=".18"');
  return doc(1920, 1080, defs, b);
}

function bgAirport() {
  const defs =
    lg("wa", 0, 0, 0, 1, [0, "#111631"], [1, "#0a0e20"]) +
    lg("gl", 0, 0, 0, 1, [0, "#1b2547"], [0.65, "#111834"], [1, "#0c1126"]) +
    lg("flA", 0, 0, 0, 1, [0, "#0e1327"], [1, "#080b16"]);
  let b = rect(0, 0, 1920, 1080, "url(#wa)");
  b += rect(0, 0, 1920, 190, "#0a0d1b");
  for (const x of [140, 560, 980, 1400]) b += rect(x, 84, 320, 12, WARM, ' opacity=".4" rx="6"');
  // glass band: night outside, runway beyond
  b += rect(106, 246, 1708, 348, "#0a0f22");
  b += rect(106, 246, 1708, 348, "url(#gl)", ' opacity=".5"');
  for (const [sx, sy, sr] of [[300, 300, 2], [520, 276, 3], [760, 320, 2], [980, 286, 2], [1180, 318, 3], [1520, 292, 2]])
    b += circ(sx, sy, sr, "#cdd7ff", ' opacity=".5"');
  b += rect(106, 522, 1708, 3, "#223060");
  b += `<line x1="106" y1="562" x2="1814" y2="562" stroke="${WARM}" stroke-width="5" stroke-dasharray="20 44" stroke-opacity=".7"/>`;
  b += `<line x1="106" y1="588" x2="1814" y2="588" stroke="#8ecbff" stroke-width="3" stroke-dasharray="8 56" stroke-opacity=".45"/>`;
  b += `<g transform="translate(1370 470) scale(0.95)" fill="#05070f">${planeSilhouette()}</g>`;
  // mullions + frame
  for (let k = 1; k <= 5; k++) b += rect(283 + 290 * k, 230, 14, 380, NAVY);
  b += rect(90, 414, 1740, 12, NAVY);
  b += rect(82, 222, 1756, 16, "#10152e") + rect(82, 602, 1756, 16, "#10152e");
  b += rect(82, 222, 16, 396, "#10152e") + rect(1822, 222, 16, 396, "#10152e");
  // floor + reflections
  b += rect(0, 610, 1920, 470, "url(#flA)");
  for (const x of [170, 590, 1010, 1430]) b += rect(x, 630, 260, 190, WARM, ' opacity=".05" rx="20"');
  // departures board + bench silhouettes (no text)
  b += rect(598, 656, 244, 104, "#060913", ' rx="12"') + rect(708, 760, 14, 130, "#060913") + rect(668, 886, 94, 12, "#060913", ' rx="6"');
  b += rect(240, 800, 300, 22, "#05080f", ' rx="11"') + rect(268, 822, 18, 96, "#05080f") + rect(494, 822, 18, 96, "#05080f");
  b += rect(1380, 800, 300, 22, "#05080f", ' rx="11"') + rect(1408, 822, 18, 96, "#05080f") + rect(1634, 822, 18, 96, "#05080f");
  return doc(1920, 1080, defs, b);
}

function bgNightgym() {
  const MAG = "#ef53d6";
  const defs =
    lg("wy", 0, 0, 0, 1, [0, "#12162b"], [1, "#0b0e1d"]) +
    rg("pl", 0.5, 0.5, 0.5, [0, MAG, 0.55], [1, MAG, 0]) +
    lg("cn", 0, 0, 0, 1, [0, MAG, 0.26], [1, MAG, 0]);
  let b = rect(0, 0, 1920, 1080, "url(#wy)");
  b += rect(0, 770, 1920, 310, "#0a0d19");
  b += path("M0 830 H1920 M0 900 H1920 M0 970 H1920 M0 1040 H1920", "none", ' stroke="#161c33" stroke-width="3" stroke-opacity=".5"');
  // fixture + light cone + floor pool
  b += rect(920, 36, 80, 16, MAG, ' opacity=".95" rx="8"') + circ(960, 62, 46, MAG, ' opacity=".16"');
  b += path("M905 52 L1015 52 L1460 940 L460 940 Z", "url(#cn)");
  b += ell(960, 905, 500, 115, "url(#pl)");
  // squat rack (left)
  b += `<g fill="#06080f">`;
  b += rect(150, 250, 22, 560) + rect(430, 250, 22, 560) + rect(150, 250, 302, 18) + rect(150, 470, 302, 14);
  b += rect(196, 268, 34, 26) + rect(372, 268, 34, 26);
  b += circ(213, 560, 44) + circ(213, 560, 26, "#0d1122") + circ(369, 560, 36) + circ(369, 560, 20, "#0d1122");
  b += rect(120, 806, 362, 18);
  // dumbbell tree (mid)
  b += rect(700, 700, 180, 14) + rect(706, 640, 12, 74) + rect(862, 640, 12, 74);
  b += rect(726, 634, 54, 12, null, ' rx="6"') + circ(720, 640, 15) + circ(786, 640, 15);
  b += rect(748, 664, 54, 12, null, ' rx="6"') + circ(742, 670, 13) + circ(808, 670, 13);
  b += rect(768, 694, 50, 11, null, ' rx="5"') + circ(762, 700, 12) + circ(824, 700, 12);
  // bench press (right)
  b += rect(1230, 776, 400, 26, null, ' rx="13"') + rect(1260, 802, 20, 120) + rect(1580, 802, 20, 120);
  b += rect(1190, 600, 22, 200) + rect(1648, 600, 22, 200) + rect(1190, 636, 480, 14);
  b += circ(1212, 643, 56) + circ(1212, 643, 30, "#0d1122") + circ(1668, 643, 56) + circ(1668, 643, 30, "#0d1122");
  b += `</g>`;
  return doc(1920, 1080, defs, b);
}

function bgRooftop() {
  const defs =
    lg("dk", 0, 0, 0, 1, [0, "#221836"], [0.45, "#43293e"], [0.72, "#7a4a3a"], [1, "#b97e3f"]) +
    rg("hz", 0.5, 0.5, 0.5, [0, "#ffd98a", 0.5], [1, "#ffd98a", 0]);
  let b = rect(0, 0, 1920, 1080, "url(#dk)");
  b += circ(1370, 700, 430, "url(#hz)") + circ(1370, 700, 86, "#ffd98a", ' opacity=".9"');
  const row = (fill, list) => list.map(([x, w, hgt]) => rect(x, 880 - hgt, w, hgt, fill)).join("");
  b += row("#2a2148", [[0, 240, 300], [240, 200, 380], [440, 260, 260], [700, 220, 340], [920, 260, 300], [1180, 240, 400], [1420, 280, 280], [1700, 260, 340]]);
  b += row("#141126", [[-40, 320, 520], [280, 280, 600], [560, 320, 460], [880, 300, 560], [1180, 340, 500], [1520, 320, 580], [1840, 240, 460]]);
  // water tower on a mid roof
  b += `<g fill="#0d0b1c">` + rect(640, 430, 10, 60) + rect(700, 430, 10, 60) + rect(616, 380, 118, 64, null, ' rx="18"') + path("M616 382 L675 344 L734 382 Z") + `</g>`;
  b += rect(1000, 420, 8, 90, "#141126") + circ(1004, 414, 6, WARM, ' opacity=".7"');
  // rooftop foreground + railing
  b += rect(0, 860, 1920, 60, "#0e0f1e") + rect(0, 920, 1920, 160, NAVY);
  b += rect(0, 806, 1920, 10, "#0a0c18");
  let bars = "";
  for (let x = 44; x <= 1876; x += 92) bars += `M${x} 816 V864 `;
  b += path(bars, "none", ' stroke="#0a0c18" stroke-width="9"');
  // HVAC + vent pipe
  b += rect(260, 760, 190, 100, "#0b0e1c");
  b += rect(280, 780, 150, 8, "#131829") + rect(280, 800, 150, 8, "#131829") + rect(280, 820, 150, 8, "#131829");
  b += rect(1730, 700, 26, 160, "#0b0e1c", ' rx="10"') + rect(1722, 692, 42, 18, "#0b0e1c", ' rx="8"');
  // romantic string lights
  b += path("M40 150 Q500 268 960 176 T1880 190", "none", ` stroke="${WARM}" stroke-width="4" stroke-opacity=".3"`);
  const q1 = [40, 150], c1 = [500, 268], q2 = [960, 176], c2 = [1420, 264], e2 = [1880, 190];
  for (let k = 1; k <= 7; k++) {
    const t = k / 8;
    const [ax, ay] = qp(q1, c1, q2, t);
    const [bx, by] = qp(q2, c2, e2, t);
    b += circ(ax, ay + 10, 5, WARM, ' opacity=".85"') + circ(bx, by + 10, 5, WARM, ' opacity=".85"');
  }
  return doc(1920, 1080, defs, b);
}

function bgKitchen() {
  const defs =
    lg("kw", 0, 0, 0, 1, [0, "#1a1426"], [1, "#100c1c"]) +
    rg("kg", 0.5, 0.5, 0.5, [0, "#ffdfae", 0.32], [1, "#ffdfae", 0]) +
    lg("kp", 0, 0, 0, 1, [0, "#ffe9c4"], [0.6, "#f7c9a0"], [1, "#e79ab0"]) +
    lg("ks", 0, 0, 0, 1, [0, "#ffdfae", 0.16], [1, "#ffdfae", 0]);
  let b = rect(0, 0, 1920, 1080, "url(#kw)");
  b += circ(440, 330, 380, "url(#kg)");
  // window
  b += rect(180, 120, 520, 420, "#0d0a16");
  b += rect(204, 144, 472, 372, "url(#kp)");
  b += rect(424, 144, 16, 372, "#0d0a16") + rect(204, 322, 472, 16, "#0d0a16");
  b += path("M210 540 L690 540 L980 740 L300 740 Z", "url(#ks)");
  // counter + cabinets
  b += rect(0, 740, 1920, 26, "#171126") + rect(0, 744, 1920, 3, WARM, ' opacity=".25"');
  b += rect(0, 766, 1920, 314, "#0c0916");
  b += path("M240 766 V1080 M480 766 V1080 M720 766 V1080 M960 766 V1080 M1200 766 V1080 M1440 766 V1080 M1680 766 V1080", "none", ' stroke="#08060f" stroke-width="6"');
  for (const x of [270, 750, 1230, 1590]) b += rect(x, 800, 64, 12, "#05040a", ' rx="6"');
  // faucet + mug
  b += path("M1560 740 L1560 640 Q1560 596 1510 596 L1470 596", "none", ' stroke="#07091a" stroke-width="16" stroke-linecap="round"');
  b += rect(1456, 592, 30, 16, "#07091a", ' rx="8"');
  b += rect(880, 690, 74, 56, "#0d0a18", ' rx="10"');
  b += path("M954 704 Q992 712 954 736", "none", ' stroke="#0d0a18" stroke-width="10"');
  b += path("M900 668 Q890 640 902 616", "none", ` stroke="${WARM}" stroke-width="5" stroke-opacity=".3"`);
  b += path("M930 668 Q942 636 928 606", "none", ` stroke="${WARM}" stroke-width="5" stroke-opacity=".22"`);
  // plant on counter
  b += `<g stroke="#0f2118" stroke-width="26" stroke-linecap="round" fill="none">`;
  for (const d of ["M216 678 Q160 560 96 480", "M222 678 Q216 520 176 420", "M226 678 Q262 510 300 436", "M230 678 Q320 560 372 520", "M214 678 Q130 600 84 572"])
    b += path(d, "none");
  b += `</g>`;
  b += rect(142, 676, 158, 20, "#0c0a18", ' rx="10"') + path("M152 694 L290 694 L268 766 L174 766 Z", "#0c0a18");
  return doc(1920, 1080, defs, b);
}

function bgReveal() {
  const defs =
    rg("rv1", 0.5, 0.5, 0.5, [0, "#ffe9f0", 0.9], [0.3, WARM, 0.4], [1, WARM, 0]) +
    rg("rv2", 0.5, 0.5, 0.5, [0, "#fff3f6", 0.95], [1, "#ffe9f0", 0]) +
    lg("rvf", 0, 0, 0, 1, [0, WARM, 0.06], [1, WARM, 0]);
  let b = rect(0, 0, 1920, 1080, "#04050b");
  b += circ(960, 560, 760, "url(#rv1)") + circ(960, 560, 230, "url(#rv2)");
  for (const [r, o] of [[330, 0.07], [480, 0.05], [650, 0.035]])
    b += circ(960, 560, r, "none", ` stroke="${WARM}" stroke-width="2" stroke-opacity="${o}"`);
  for (const [mx, my, mr] of [[520, 300, 3], [1420, 360, 2], [1180, 220, 2], [700, 780, 3], [1330, 800, 2], [860, 180, 2], [1560, 560, 3], [420, 620, 2]])
    b += circ(mx, my, mr, WARM, ' opacity=".3"');
  b += rect(0, 928, 1920, 2, WARM, ' opacity=".12"') + rect(0, 930, 1920, 150, "url(#rvf)");
  return doc(1920, 1080, defs, b);
}

// ================================================================ CG
function fig(x, footY, h, lean) {
  const r = Math.round(h * 0.075);
  const shY = Math.round(footY - h * 0.8);
  const hx = x + lean;
  const hy = shY - r - Math.round(h * 0.02);
  const hw = Math.round(h * 0.17);
  const body =
    `M${x - hw} ${footY}` +
    ` C${x - hw - 6} ${footY - h * 0.3} ${x - hw - 2} ${shY + 20} ${hx - Math.round(h * 0.1)} ${shY}` +
    ` Q${hx} ${shY - Math.round(h * 0.09)} ${hx + Math.round(h * 0.1)} ${shY}` +
    ` C${x + hw + 2} ${shY + 20} ${x + hw + 6} ${footY - h * 0.3} ${x + hw} ${footY} Z`;
  return circ(hx, hy, r) + path(body);
}

function cgAirportWindow() {
  const defs =
    lg("nt", 0, 0, 0, 1, [0, "#0e1430"], [0.6, "#0a0f24"], [1, "#070b18"]) +
    rg("mn", 0.5, 0.5, 0.5, [0, WARM, 0.35], [1, WARM, 0]) +
    lg("fi", 0, 0, 0, 1, [0, "#12182e"], [1, "#070a14"]) +
    lg("sh", 0, 0, 1, 1, [0, "#ffffff", 0.05], [0.4, "#ffffff", 0]);
  let b = rect(0, 0, 1920, 1080, "#0d1124");
  // outside: night sky, moon, apron
  b += rect(70, 110, 1780, 730, "url(#nt)");
  b += circ(300, 260, 130, "url(#mn)") + circ(300, 260, 54, WARM, ' opacity=".85"');
  for (const [sx, sy] of [[520, 200], [900, 240], [1120, 190], [1340, 230], [1560, 180], [1460, 330]])
    b += circ(sx, sy, 2.5, "#cdd7ff", ' opacity=".55"');
  b += rect(70, 700, 1780, 140, "#0b1024");
  b += `<line x1="90" y1="772" x2="1830" y2="772" stroke="${WARM}" stroke-width="5" stroke-dasharray="26 40" stroke-opacity=".7"/>`;
  b += `<line x1="90" y1="806" x2="1830" y2="806" stroke="#8ecbff" stroke-width="3" stroke-dasharray="8 60" stroke-opacity=".4"/>`;
  // parked plane + jetway
  b += `<g transform="translate(1210 610) scale(2.05)" fill="#060913">${planeSilhouette()}</g>`;
  b += path("M70 428 L1010 486 L1010 560 L70 540 Z", "#0a0e1f");
  b += rect(520, 548, 16, 152, "#0a0e1f") + rect(980, 470, 60, 92, "#0c1124", ' rx="8"');
  // apron floodlights
  b += rect(180, 560, 10, 150, "#060913") + rect(1660, 560, 10, 150, "#060913");
  b += circ(185, 552, 10, WARM, ' opacity=".9"') + circ(1665, 552, 10, WARM, ' opacity=".9"');
  b += ell(185, 736, 120, 26, WARM, ' opacity=".12"') + ell(1665, 736, 120, 26, WARM, ' opacity=".12"');
  // window structure + sheen
  b += rect(70, 110, 1780, 730, "url(#sh)");
  for (let k = 1; k <= 4; k++) b += rect(56 + 356 * k - 9, 110, 18, 730, "#0d1124");
  b += rect(70, 466, 1780, 18, "#0d1124");
  b += rect(56, 96, 1808, 758, "none", ' stroke="#10152e" stroke-width="28" rx="8"');
  // interior floor + reflections
  b += rect(0, 840, 1920, 240, "url(#fi)") + rect(0, 840, 1920, 8, "#05070f");
  for (let k = 1; k <= 4; k++) b += rect(56 + 356 * k - 9, 850, 18, 160, WARM, ' opacity=".05"');
  // two small figures, backlit by the window
  b += ell(700, 1046, 120, 16, "#02040a", ' opacity=".7"') + ell(842, 1042, 100, 13, "#02040a", ' opacity=".6"');
  b += `<g fill="#04060d" stroke="${WARM}" stroke-width="2.5" stroke-opacity=".55">${fig(690, 1030, 340, 10)}${fig(836, 1030, 306, -6)}</g>`;
  return doc(1920, 1080, defs, b);
}

// ================================================================ EVIDENCE
function evStage(innerDefs, body) {
  const defs = rg("vgE", 0.5, 0.42, 0.78, [0, "#161d36"], [1, NAVY]) + innerDefs;
  return doc(800, 500, defs, rect(0, 0, 800, 500, "url(#vgE)") + body);
}

function evStickpack(A) {
  const pack = (ang, fill, front) =>
    `<g transform="rotate(${ang} 400 462)">` +
    ell(0, 8, 74, 13, "#02030a", ' opacity=".45"') +
    rect(-58, -196, 116, 336, fill, ' rx="16"') +
    rect(-58, -196, 116, 30, front ? "#233158" : "#182142", ' rx="12"') +
    rect(-30, -152, 60, 4, "#2c3a66", ' opacity=".8" rx="2"') +
    rect(-44, -160, 10, 270, "#ffffff", ' opacity=".05" rx="5"') +
    (front ? rect(-58, -58, 116, 62, A, ' opacity=".9"') + path("M0 -34 L13 -14 L0 6 L-13 -14 Z", NAVY, ' opacity=".8"') : "") +
    `</g>`;
  let b = rect(60, 430, 680, 6, "#232c4e", ' opacity=".6"');
  for (const [ang, f, fr] of [[-26, "#131b33", false], [-9, "#182344", false], [9, "#141d38", false], [26, "#1a2649", true]])
    b += pack(ang, f, fr);
  return evStage(lg("pk", 0, 0, 0, 1, [0, "#1d2a4e"], [1, "#10182e"]), b);
}

function evStrainGraph(A) {
  let b = rect(104, 206, 42, 88, "#0a0f1f", ' rx="14"') + rect(654, 206, 42, 88, "#0a0f1f", ' rx="14"');
  b += rect(146, 95, 508, 320, "#0a0f1f", ' rx="30" stroke="#26335c" stroke-width="3"');
  b += rect(170, 119, 460, 272, "#0c1326", ' rx="18"');
  for (const gx of [261, 352, 443, 534]) b += rect(gx, 125, 2, 260, "#1b2748");
  for (const gy of [189, 255, 321]) b += rect(176, gy, 448, 2, "#1b2748");
  for (const dx of [186, 198, 210]) b += circ(dx, 135, 4, "#233058");
  const curve = "M196 352 C256 336 296 306 340 274 C384 242 424 226 466 196 C508 166 556 136 604 116";
  b += path(curve + " L604 385 L196 385 Z", A, ' opacity=".07"');
  b += path(curve, "none", ` stroke="${A}" stroke-width="16" stroke-opacity=".16" stroke-linecap="round"`);
  b += path(curve, "none", ` stroke="${A}" stroke-width="7" stroke-linecap="round"`);
  b += circ(604, 116, 16, A, ' opacity=".22"') + circ(604, 116, 7, A);
  return evStage("", b);
}

function evCanLineup(A) {
  const defs = lg("canV", 0, 0, 0, 1, [0, "#20294a"], [0.5, "#141b33"], [1, "#0d1226"]);
  const can = ({ x, w, top, band, main }) => {
    const cx = x + w / 2;
    let s = ell(cx, 456, w * 0.72, 14, "#02030a", ' opacity=".5"');
    s += rect(x, top, w, 450 - top, "url(#canV)", ' rx="24"');
    s += ell(cx, top + 4, w / 2, 13, "#232c52") + ell(cx, top + 5, w / 2 - 8, 9, "#10182e");
    s += rect(cx - 12, top - 2, 24, 8, "#39456f", ' rx="4"');
    s += rect(x + 6, top + (450 - top) * 0.32, w - 12, 3, A, ' opacity=".5"');
    s += rect(x + 6, top + (450 - top) * 0.38, w - 12, (450 - top) * 0.24, A, ` opacity="${band}" rx="10"`);
    s += rect(x + 6, top + (450 - top) * 0.66, w - 12, 3, A, ' opacity=".5"');
    s += rect(x + 10, top + 18, 10, 450 - top - 40, "#ffffff", ' opacity=".06" rx="5"');
    if (main)
      for (const [dx, dy] of [[cx - 20, top + 60], [cx + 14, top + 96], [cx - 6, top + 140], [cx + 24, top + 190]])
        s += circ(dx, dy, 2.5, "#ffffff", ' opacity=".18"');
    return s;
  };
  let b = "";
  b += can({ x: 236, w: 104, top: 150, band: 0.45 });
  b += can({ x: 516, w: 104, top: 150, band: 0.6 });
  b += can({ x: 372, w: 112, top: 118, band: 0.85, main: true });
  return evStage(defs, b);
}

function evScoop(A) {
  const defs =
    lg("pw", 0, 0, 0, 1, [0, "#a5f28c"], [1, "#41804f"]);
  let b = "";
  b += ell(500, 492, 120, 14, "#02030a", ' opacity=".5"');
  // glass
  b += path("M404 208 L438 470 Q441 488 460 488 L540 488 Q559 488 562 470 L596 208 Z", "#0e1526", ' stroke="#2c3a5e" stroke-width="5"');
  b += path("M417 330 L447 462 Q449 474 462 474 L538 474 Q551 474 553 462 L583 330 Z", "#1d4029");
  b += ell(500, 330, 83, 13, "#2c5f3a");
  b += circ(470, 380, 4, A, ' opacity=".3"') + circ(520, 420, 3, A, ' opacity=".3"') + circ(498, 448, 3.5, A, ' opacity=".25"');
  b += rect(430, 230, 12, 220, "#ffffff", ' opacity=".05" rx="6"');
  // tilted scoop with heaped powder
  b += `<g transform="rotate(-22 300 176)">`;
  b += rect(374, 164, 96, 24, "#182242", ' rx="12" stroke="' + A + '" stroke-width="4"');
  b += path("M238 172 Q262 108 302 104 Q344 108 366 172 Z", "url(#pw)");
  b += path("M224 176 A78 78 0 0 0 380 176 Z", "#182242", ` stroke="${A}" stroke-width="4"`);
  b += ell(302, 176, 78, 15, "#141d3a", ` stroke="${A}" stroke-width="4"`);
  for (const [px, py] of [[276, 148], [304, 132], [330, 150], [290, 162], [318, 164]]) b += circ(px, py, 2.5, "#d6ffc4", ' opacity=".9"');
  b += `</g>`;
  for (const [gx2, gy2] of [[430, 236], [452, 262], [438, 290]]) b += circ(gx2, gy2, 3, A, ' opacity=".8"');
  return evStage(defs, b);
}

// ================================================================ UI
function uiVignette() {
  const defs = rg("vv", 0.5, 0.5, 0.72, [0.5, "#000000", 0], [0.78, "#000000", 0.45], [1, "#000000", 0.85]);
  return doc(1920, 1080, defs, rect(0, 0, 1920, 1080, "url(#vv)"));
}

function uiLogo() {
  const defs = lg("hg", 0, 0, 0, 1, [0, "#ff8dce"], [1, WARM]);
  let b = rect(24, 24, 464, 464, "#0d1120", ' rx="104"') + rect(24, 24, 464, 464, "none", ' rx="104" stroke="#1f2947" stroke-width="4"');
  b += path(
    "M256 448 C136 356 88 290 88 216 C88 140 148 94 206 94 C238 94 256 112 256 134 C256 112 274 94 306 94 " +
      "C364 94 424 140 424 216 C424 290 376 356 256 448 Z",
    "url(#hg)",
  );
  b += `<polyline points="104,258 188,258 218,184 258,330 290,224 314,258 408,258" fill="none" stroke="${NAVY}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>`;
  return doc(512, 512, defs, b);
}

// ================================================================ REVEAL
function revealSilhouette() {
  const defs =
    rg("gw", 0.5, 0.5, 0.5, [0, "#ffe9f0", 0.9], [0.3, WARM, 0.45], [1, WARM, 0]) +
    rg("go", 0.5, 0.5, 0.5, [0, WARM, 0.18], [1, WARM, 0]) +
    lg("rw", 1, 0, 0, 1, [0, WARM, 0.9], [0.5, WARM, 0.25], [1, WARM, 0]);
  const FIG =
    circ(960, 208, 46) +
    rect(938, 244, 44, 44) +
    path("M874 306 Q960 262 1046 306 L1032 472 Q960 490 888 472 Z") +
    path("M888 466 L1032 466 L1046 618 L876 618 Z") +
    path("M874 314 C846 362 834 442 840 530 L870 526 C864 446 870 378 892 324 Z") +
    path("M1046 314 C1074 362 1086 442 1080 530 L1050 526 C1056 446 1050 378 1028 324 Z") +
    circ(855, 542, 16) +
    circ(1065, 542, 16) +
    path("M882 612 L946 612 L940 946 L898 946 Z") +
    path("M974 612 L1038 612 L1022 946 L980 946 Z") +
    path("M890 946 L948 946 L956 974 L882 974 Z") +
    path("M972 946 L1030 946 L1038 974 L964 974 Z");
  let b = rect(0, 0, 1920, 1080, "#04050b");
  b += circ(960, 480, 860, "url(#go)") + circ(960, 480, 540, "url(#gw)");
  b += ell(960, 984, 420, 40, WARM, ' opacity=".08"') + ell(960, 988, 220, 26, "#010208", ' opacity=".55"');
  b += `<g transform="translate(16 -8)" fill="url(#rw)" opacity=".85">${FIG}</g>`;
  b += `<g fill="#05070d">${FIG}</g>`;
  return doc(1920, 1080, defs, b);
}

// ================================================================ MANIFEST
// The game's asset registry mirrors these ids exactly — do not rename.
const BRAND_ACCENTS = { "liquid-iv": "#8ecbff", whoop: "#ff8dce", celsius: "#edff4c", ag1: "#8ced73" };
const EXPRESSIONS = ["neutral", "happy", "annoyed", "embarrassed", "special"];

const MANIFEST = [];
for (const [brand, accent] of Object.entries(BRAND_ACCENTS)) {
  for (const expression of EXPRESSIONS) {
    MANIFEST.push({
      id: `char-${brand}-${expression}`,
      relPath: `characters/char-${brand}-${expression}.svg`,
      kind: "character",
      accent,
      expression,
    });
  }
}
for (const motif of ["hub", "airport", "nightgym", "rooftop", "kitchen", "reveal"]) {
  MANIFEST.push({ id: `bg-${motif}`, relPath: `backgrounds/bg-${motif}.svg`, kind: "background", motif });
}
MANIFEST.push({ id: "cg-airport-window", relPath: "cg/cg-airport-window.svg", kind: "cg", motif: "airport-window" });
for (const [id, motif, accent] of [
  ["evg-liquid-iv-stickpack", "stickpack", "#8ecbff"],
  ["evg-whoop-strain-graph", "strain-graph", "#ff8dce"],
  ["evg-celsius-can-lineup", "can-lineup", "#edff4c"],
  ["evg-ag1-scoop", "scoop", "#8ced73"],
])
  MANIFEST.push({ id, relPath: `evidence/${id}.svg`, kind: "evidence", motif, accent });
MANIFEST.push({ id: "ui-vignette", relPath: "ui/ui-vignette.svg", kind: "ui", motif: "vignette" });
MANIFEST.push({ id: "logo-dsim", relPath: "ui/logo-dsim.svg", kind: "ui", motif: "logo" });
MANIFEST.push({ id: "reveal-silhouette", relPath: "reveal/reveal-silhouette.svg", kind: "reveal", motif: "silhouette" });

const EXPECTED_COUNT = 34;
const BACKGROUNDS = { hub: bgHub, airport: bgAirport, nightgym: bgNightgym, rooftop: bgRooftop, kitchen: bgKitchen, reveal: bgReveal };
const CGS = { "airport-window": cgAirportWindow };
const EVIDENCES = { stickpack: evStickpack, "strain-graph": evStrainGraph, "can-lineup": evCanLineup, scoop: evScoop };
const UIS = { vignette: uiVignette, logo: uiLogo };

function render(entry) {
  if (entry.kind === "character") return characterSvg(entry.accent, entry.expression);
  if (entry.kind === "background") return BACKGROUNDS[entry.motif]();
  if (entry.kind === "cg") return CGS[entry.motif]();
  if (entry.kind === "evidence") return EVIDENCES[entry.motif](entry.accent);
  if (entry.kind === "ui") return UIS[entry.motif]();
  if (entry.kind === "reveal") return revealSilhouette();
  throw new Error(`no renderer for entry: ${entry.id}`);
}

// ================================================================ MAIN
const seenIds = new Set();
const seenPaths = new Set();
for (const e of MANIFEST) {
  if (seenIds.has(e.id)) throw new Error(`duplicate id: ${e.id}`);
  if (seenPaths.has(e.relPath)) throw new Error(`duplicate relPath: ${e.relPath}`);
  seenIds.add(e.id);
  seenPaths.add(e.relPath);
}
if (MANIFEST.length !== EXPECTED_COUNT) throw new Error(`expected ${EXPECTED_COUNT} entries, got ${MANIFEST.length}`);

mkdirSync(OUT, { recursive: true });
let totalBytes = 0;
const rows = [];
for (const entry of MANIFEST) {
  const svg = render(entry);
  const dest = join(OUT, entry.relPath);
  mkdirSync(dirname(dest), { recursive: true });
  const bytes = Buffer.byteLength(svg, "utf8");
  writeFileSync(dest, svg, "utf8");
  totalBytes += bytes;
  rows.push([entry.relPath, bytes]);
}
rows.sort((r1, r2) => (r1[0] < r2[0] ? -1 : 1));
for (const [rel, bytes] of rows) console.log(`${String(bytes).padStart(5)} B  public/assets/${rel}`);
console.log(`${MANIFEST.length} files written, ${totalBytes} bytes total`);
const oversize = rows.filter(([, bytes]) => bytes > 4096);
if (oversize.length) {
  console.error(`WARNING: exceeds ~4KB budget: ${oversize.map(([rel, bytes]) => `${rel} (${bytes}B)`).join(", ")}`);
  process.exitCode = 1;
}
