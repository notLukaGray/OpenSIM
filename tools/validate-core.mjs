// Content validation core (ADR-10). Plain ESM, zero imports — runs in Node
// (scripts/validate-content.mjs) AND in the browser (dev overlay).
// Diagnostics name the source file, JSON path, and reason. Errors fail builds.

const NEEDS = [
  "control",
  "readiness",
  "reassurance",
  "aspiration",
  "belonging",
  "mastery",
  "comfort",
  "excitement",
  "selfExpression",
  "trust",
];

const PROFILE_MIN = -5;
const PROFILE_MAX = 5;
const EFFECT_CAP = 3;

/** Trees that exist outside content/dates/. */
const RESERVED_TREE_IDS = ["reveal", "map"];

export function validateContent(bundle) {
  const diags = [];
  const err = (file, path, message) => diags.push({ level: "error", file, path, message });
  const warn = (file, path, message) => diags.push({ level: "warning", file, path, message });

  const F = (item, fallback) => (item && item.file) || fallback;

  // ── shape guards ───────────────────────────────────────────────────────────
  const requiredCollections = [
    ["brands", bundle.brands],
    ["archetypes", bundle.archetypes],
    ["modifiers", bundle.modifiers],
    ["evidence", bundle.evidence],
    ["assets", bundle.assets],
    ["audioTracks", bundle.audioTracks],
    ["locations", bundle.locations ?? []],
    ["trees", bundle.trees],
  ];
  for (const [name, coll] of requiredCollections) {
    if (!Array.isArray(coll)) err("bundle", name, `expected an array`);
  }
  if (diags.some((d) => d.level === "error")) return finish();

  const brandIds = new Set(bundle.brands.map((b) => b.id));
  const archetypeIds = new Set(bundle.archetypes.map((a) => a.id));
  const assetIds = new Set(bundle.assets.map((a) => a.id));
  const audioIds = new Set(bundle.audioTracks.map((t) => t.id));
  const evidenceIds = new Set(bundle.evidence.map((e) => e.id));
  const locationIds = new Set((bundle.locations ?? []).map((l) => l.id));
  const treeIds = new Set(bundle.trees.map((t) => t.id));
  const treeById = new Map(bundle.trees.map((t) => [t.id, t]));
  for (const r of RESERVED_TREE_IDS) treeIds.add(r);

  // ── dimensions & profiles ─────────────────────────────────────────────────
  const checkVector = (vec, file, path, { min = PROFILE_MIN, max = PROFILE_MAX, cap = null } = {}) => {
    let ok = true;
    for (const [k, v] of Object.entries(vec ?? {})) {
      if (!NEEDS.includes(k)) {
        err(file, `${path}.${k}`, `unknown dimension "${k}" (valid: ${NEEDS.join(", ")})`);
        ok = false;
        continue;
      }
      if (typeof v !== "number" || Number.isNaN(v)) {
        err(file, `${path}.${k}`, `value must be a number, got ${JSON.stringify(v)}`);
        ok = false;
      } else if (v < min || v > max) {
        err(file, `${path}.${k}`, `value ${v} outside allowed range ${min}..${max}`);
        ok = false;
      } else if (cap !== null && Math.abs(v) > cap) {
        err(file, `${path}.${k}`, `magnitude ${Math.abs(v)} exceeds effect cap ±${cap}`);
        ok = false;
      }
    }
    return ok;
  };

  for (const b of bundle.brands) {
    const f = F(b, "brands");
    if (!checkVector(b.claimedProfile, f, `brand[${b.id}].claimedProfile`))
      continue;
    checkVector(b.perceivedProfile, f, `brand[${b.id}].perceivedProfile`);
  }

  for (const a of bundle.archetypes) {
    // Archetype weights are RELATIVE importance (any positive magnitudes,
    // normalized at runtime) — deliberately not the ±5 profile scale.
    checkVector(a.weights, F(a, "archetypes"), `archetype[${a.id}].weights`, {
      min: 0,
      max: Number.POSITIVE_INFINITY,
    });
    if (Object.values(a.weights ?? {}).every((w) => !w || w <= 0))
      err(F(a, "archetypes"), `archetype[${a.id}]`, "weights must have at least one positive entry");
  }

  // duplicate id checks
  const dupCheck = (coll, label) => {
    const seen = new Map();
    for (const item of coll) {
      if (seen.has(item.id))
        err(F(item, label), `${label}[${item.id}]`, `duplicate id (first seen in ${seen.get(item.id)})`);
      else seen.set(item.id, F(item, label));
    }
  };
  dupCheck(bundle.brands, "brand");
  dupCheck(bundle.archetypes, "archetype");
  dupCheck(bundle.modifiers, "modifier");
  dupCheck(bundle.evidence, "evidence");
  dupCheck(bundle.assets, "asset");
  dupCheck(bundle.audioTracks, "audioTrack");
  dupCheck(bundle.trees, "tree");

  // ── assets / audio sanity ─────────────────────────────────────────────────
  for (const a of bundle.assets) {
    const f = F(a, "assets");
    if (!a.src || typeof a.src !== "string") err(f, `asset[${a.id}]`, "missing src");
    else if (!a.src.startsWith("/assets/"))
      err(f, `asset[${a.id}].src`, `src must live under /assets/, got "${a.src}"`);
  }
  for (const t of bundle.audioTracks) {
    const f = F(t, "audioTracks");
    if (!["music", "sfx"].includes(t.kind)) err(f, `audioTrack[${t.id}].kind`, `must be "music" or "sfx"`);
    if (typeof t.volume !== "number" || t.volume < 0 || t.volume > 1)
      err(f, `audioTrack[${t.id}].volume`, "must be a number in 0..1");
    if (!t.src || !t.src.startsWith("/assets/")) err(f, `audioTrack[${t.id}].src`, `must live under /assets/`);
  }

  // ── locations ─────────────────────────────────────────────────────────────
  for (const l of bundle.locations ?? []) {
    const f = F(l, "locations");
    if (!assetIds.has(l.background)) err(f, `location[${l.id}].background`, `unknown asset "${l.background}"`);
    if (!audioIds.has(l.music)) err(f, `location[${l.id}].music`, `unknown track "${l.music}"`);
    if (typeof l.map?.x !== "number" || typeof l.map?.y !== "number")
      err(f, `location[${l.id}].map`, "map.x and map.y must be numbers (percentages)");
    else if (l.map.x < 0 || l.map.x > 100 || l.map.y < 0 || l.map.y > 100)
      err(f, `location[${l.id}].map`, "map coordinates are percentages (0..100)");
  }

  // ── evidence ──────────────────────────────────────────────────────────────
  for (const e of bundle.evidence) {
    const f = F(e, "evidence");
    if (!brandIds.has(e.brandId)) err(f, `evidence[${e.id}].brandId`, `unknown brand "${e.brandId}"`);
    if (e.imageRef && !assetIds.has(e.imageRef)) err(f, `evidence[${e.id}].imageRef`, `unknown asset "${e.imageRef}"`);
    for (const sid of e.sourceIds ?? []) {
      const knownSrc = (bundle.sources ?? []).some((x) => x.id === sid);
      if (!knownSrc) err(f, `evidence[${e.id}].sourceIds`, `unknown source "${sid}"`);
    }
    checkVector(e.effects, f, `evidence[${e.id}].effects`, { cap: EFFECT_CAP });
  }

  // ── modifiers ─────────────────────────────────────────────────────────────
  for (const m of bundle.modifiers) {
    const f = F(m, "modifiers");
    for (const b of m.appliesTo ?? [])
      if (!brandIds.has(b)) err(f, `modifier[${m.id}].appliesTo`, `unknown brand "${b}"`);
    const w = m.when ?? {};
    if (!w.location && !w.occasion && !w.dateId && !w.hasFlag)
      err(f, `modifier[${m.id}].when`, "empty condition — modifier would always apply; give it at least one");
    if (w.dateId && !treeIds.has(w.dateId))
      err(f, `modifier[${m.id}].when.dateId`, `unknown tree "${w.dateId}"`);
    checkVector(m.effects, f, `modifier[${m.id}].effects`, { cap: EFFECT_CAP });
  }

  // ── flags declared somewhere ──────────────────────────────────────────────
  const declaredFlags = new Set();
  for (const t of bundle.trees)
    for (const [nodeId, node] of Object.entries(t.nodes ?? {}))
      for (const c of node.choices ?? [])
        for (const fl of c.setFlags ?? []) declaredFlags.add(fl);

  const checkCondition = (cond, file, path) => {
    if (cond?.brand) {
      if (!brandIds.has(cond.brand.id))
        err(file, path, `references unknown brand "${String(cond.brand.id)}"`);
      if (typeof cond.brand.met !== "boolean")
        err(file, path, "brand.met must be boolean");
    }
    const fc = cond?.flags;
    if (!fc) return;
    for (const key of ["all", "any", "none"]) {
      for (const fl of fc[key] ?? [])
        if (!declaredFlags.has(fl)) err(file, path, `references undeclared flag "${fl}"`);
    }
  };

  // ── trees ─────────────────────────────────────────────────────────────────
  for (const t of bundle.trees) {
    const f = F(t, "trees");
    const nodes = t.nodes ?? {};
    const nodeIds = new Set(Object.keys(nodes));

    if (t.brandId !== null && !brandIds.has(t.brandId))
      err(f, `tree[${t.id}].brandId`, `unknown brand "${t.brandId}"`);
    if (t.locationId && !locationIds.has(t.locationId))
      err(f, `tree[${t.id}].locationId`, `unknown location "${t.locationId}"`);
    if (!nodes[t.startNode]) err(f, `tree[${t.id}].startNode`, `start node "${t.startNode}" does not exist`);
    if (t.music && !audioIds.has(t.music)) err(f, `tree[${t.id}].music`, `unknown track "${t.music}"`);
    for (const ep of t.entryPoints ?? [])
      if (!nodes[ep]) err(f, `tree[${t.id}].entryPoints`, `entry point "${ep}" does not exist`);
    if (t.background && !assetIds.has(t.background))
      err(f, `tree[${t.id}].background`, `unknown asset "${t.background}"`);
    for (const [i, cm] of (t.cast ?? []).entries()) {
      if (!assetIds.has(cm.assetId)) err(f, `tree[${t.id}].cast[${i}]`, `unknown asset "${cm.assetId}"`);
    }

    /** Edges out of a node: node-level next/nextTree plus choice-level ones. */
    const collectProblems = (ownerId, owner, path) => {
      if (owner.conditions) checkCondition(owner.conditions, f, path);
      if (owner.music && !audioIds.has(owner.music)) err(f, `${path}.music`, `unknown track "${owner.music}"`);
      if (owner.background && !assetIds.has(owner.background))
        err(f, `${path}.background`, `unknown asset "${owner.background}"`);
      if (owner.cg && !assetIds.has(owner.cg)) err(f, `${path}.cg`, `unknown asset "${owner.cg}"`);
      if (owner.evidence) {
        if (!evidenceIds.has(owner.evidence)) err(f, `${path}.evidence`, `unknown evidence "${owner.evidence}"`);
      }
      const sp = owner.sprite;
      if (sp?.expression) {
        const castAssetId = sp.assetId ?? t.cast?.[0]?.assetId;
        const exprAsset = castAssetId?.replace(/-(neutral|happy|annoyed|embarrassed|special)$/, `-${sp.expression}`);
        if (!exprAsset || !assetIds.has(exprAsset))
          err(f, `${path}.sprite.expression`, `no asset "${exprAsset}" for expression "${sp.expression}"`);
      }
    };

    for (const [nodeId, node] of Object.entries(nodes)) {
      const p = `tree[${t.id}].node[${nodeId}]`;
      if (node.id !== undefined && node.id !== nodeId)
        warn(f, p, `node id field "${node.id}" differs from key "${nodeId}"`);
      if (!Array.isArray(node.text) || node.text.length === 0)
        err(f, p, "text must be a non-empty array of lines");

      collectProblems(nodeId, node, p);

      const exits = [];
      if (node.next !== undefined) {
        if (!nodeIds.has(node.next)) err(f, `${p}.next`, `unknown node "${node.next}"`);
        exits.push(node.next);
      }
      if (node.nextTree !== undefined) {
        if (!treeIds.has(node.nextTree)) err(f, `${p}.nextTree`, `unknown tree "${node.nextTree}"`);
      }
      if (node.callbacks) {
        // callbacks validated after we know choice order (below)
      }
      if (node.choices) {
        if (node.choices.length < 2)
          warn(f, `${p}.choices`, "a single-choice node is usually a mistake");
        for (const [ci, ch] of node.choices.entries()) {
          const cp = `${p}.choices[${ch.id ?? ci}]`;
          if (!ch.id) err(f, cp, "choice missing id");
          if (!ch.text) err(f, cp, "choice missing text");
          collectProblems(ch.id ?? ci, ch, cp);
          if (ch.playerEffects)
            checkVector(ch.playerEffects, f, `${cp}.playerEffects`, {
              min: -EFFECT_CAP,
              max: EFFECT_CAP,
            });
          for (const [bid, delta] of Object.entries(ch.brandPerceptionEffects ?? {})) {
            if (!brandIds.has(bid)) err(f, `${cp}.brandPerceptionEffects`, `unknown brand "${bid}"`);
            checkVector(delta, f, `${cp}.brandPerceptionEffects.${bid}`, { cap: EFFECT_CAP * 2 });
          }
          for (const bid of Object.keys(ch.relationshipEffects ?? {}))
            if (!brandIds.has(bid)) err(f, `${cp}.relationshipEffects`, `unknown brand "${bid}"`);
          if (ch.next !== undefined) {
            if (!nodeIds.has(ch.next)) err(f, `${cp}.next`, `unknown node "${ch.next}"`);
            exits.push(ch.next);
          }
          if (ch.nextTree !== undefined && !treeIds.has(ch.nextTree))
            err(f, `${cp}.nextTree`, `unknown tree "${ch.nextTree}"`);
          if (ch.next === undefined && ch.nextTree === undefined)
            err(f, cp, "choice must set either next or nextTree");
        }
      }
      if (node.next === undefined && node.nextTree === undefined && !(node.choices && node.choices.length))
        err(f, p, "dead end: no next, no choices, no nextTree");
    }

    // callbacks may reference any choice made EARLIER in this tree — we accept
    // same-node-or-earlier by collecting choices during one forward pass.
    {
      const seenChoices = new Set();
      const orderedNodeIds = orderFrom(t.startNode, nodes, nodeIds);
      for (const nid of orderedNodeIds) {
        const node = nodes[nid];
        if (!node) continue;
        if (node.choices) for (const ch of node.choices) if (ch.id) seenChoices.add(ch.id);
        if (node.callbacks)
          for (const cb of node.callbacks)
            if (!seenChoices.has(cb.if))
              err(
                f,
                `tree[${t.id}].node[${nid}].callbacks`,
                `callback references "${cb.if}", which is not a choice made earlier in this tree`
              );
      }
    }

    // reachability: every node from start must be able to reach an ending
    // (ending = node with nextTree, or a choice with nextTree).
    if (nodes[t.startNode]) {
      const endingOk = new Map(); // nodeId -> bool memo
      const visiting = new Set();
      const reachesEnding = (nid) => {
        if (endingOk.has(nid)) return endingOk.get(nid);
        if (visiting.has(nid)) return false; // cycle without exit handled by dead-end check
        visiting.add(nid);
        const node = nodes[nid];
        if (!node) return false;
        let ok = false;
        if (node.nextTree !== undefined) ok = true;
        else if (node.choices?.some((ch) => ch.nextTree !== undefined)) ok = true;
        else if (node.next !== undefined) ok = reachesEnding(node.next);
        else if (node.choices)
          ok = node.choices.every((ch) => ch.next !== undefined && reachesEnding(ch.next));
        visiting.delete(nid);
        endingOk.set(nid, ok);
        return ok;
      };
      if (!reachesEnding(t.startNode))
        err(f, `tree[${t.id}]`, "start node cannot reach an ending (a nextTree exit)");
      const reachable = reachableFrom(t.startNode, nodes, nodeIds);
      for (const ep of t.entryPoints ?? []) for (const nid of reachableFrom(ep, nodes, nodeIds)) reachable.add(nid);
      for (const nid of nodeIds)
        if (!reachable.has(nid))
          warn(f, `tree[${t.id}].node[${nid}]`, "orphan: not reachable from start");
    }
  }

  // hub presence
  if (!treeById.has("home")) err("bundle", "trees", `no hub tree with id "home"`);

  // ── balance guard (ADR-08): weaknesses mandatory, no total dominance ──────
  for (const b of bundle.brands) {
    const vals = Object.values(b.perceivedProfile ?? {});
    const pos = vals.filter((v) => v > 0).length;
    const neg = vals.filter((v) => v < 0).length;
    if (pos < 2) err(F(b, "brands"), `brand[${b.id}].perceivedProfile`, `needs ≥2 positive dimensions, has ${pos}`);
    if (neg < 1) err(F(b, "brands"), `brand[${b.id}].perceivedProfile`, `needs ≥1 negative dimension, has ${neg}`);
  }
  for (const dom of bundle.brands) {
    const dominatesAll = bundle.brands.every((other) => {
      if (other.id === dom.id) return true;
      return NEEDS.every((n) => {
        const d = dom.perceivedProfile?.[n] ?? 0;
        const o = other.perceivedProfile?.[n] ?? 0;
        return d >= o;
      });
    });
    if (dominatesAll && bundle.brands.length > 1)
      err(F(dom, "brands"), `brand[${dom.id}].perceivedProfile`, "dominates every other brand on every dimension — no universal best allowed");
  }

  return finish();

  function finish() {
    const errors = diags.filter((d) => d.level === "error");
    const warnings = diags.filter((d) => d.level === "warning");
    return { ok: errors.length === 0, errors, warnings, all: diags };
  }
}

function neighborsOf(nodeId, nodes, nodeIds) {
  const out = [];
  const node = nodes[nodeId];
  if (!node) return out;
  if (node.next !== undefined && nodeIds.has(node.next)) out.push(node.next);
  for (const ch of node.choices ?? [])
    if (ch.next !== undefined && nodeIds.has(ch.next)) out.push(ch.next);
  return out;
}

function orderFrom(startId, nodes, nodeIds) {
  // BFS order is enough for "earlier than" callback semantics.
  const seen = new Set([startId]);
  const queue = [startId];
  const order = [];
  while (queue.length) {
    const nid = queue.shift();
    order.push(nid);
    for (const n of neighborsOf(nid, nodes, nodeIds))
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
  }
  return order;
}

function reachableFrom(startId, nodes, nodeIds) {
  return new Set(orderFrom(startId, nodes, nodeIds));
}
