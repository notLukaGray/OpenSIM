"use client";
// useWorldPan (P10-01): component-local presentation state for the world map's
// pan/zoom/tap gestures. Engine purity (AGENTS.md rule 3): nothing here enters
// game/ or GameState — this is camera + gesture bookkeeping only.
//
// Gesture contract:
//   • middle-mouse drag pans on desktop;
//   • two-finger drag pans on touch;
//   • left-drag on EMPTY SPACE also pans (decided: yes — it matches every
//     map-like UI; a drag that begins ON a zone stays owned by that zone so a
//     sloppy tap never yanks the world out from under the player's finger);
//   • wheel zooms on desktop, pinch zooms on touch — both anchored on the
//     cursor / finger midpoint so the spot under the pointer stays put;
//   • single taps/clicks are reserved for hit zones. A tap is only resolved on
//     pointer-up if its pointer stayed within TAP_SLOP_PX of where it started,
//     so a pan or a pinch can never register as a tap.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Max drift (px) between pointer-down and pointer-up that still counts as a tap. */
const TAP_SLOP_PX = 10;

// Zoom range. 1 = the framing the map opens at (the square world drawn larger
// than the viewport, so it is pannable); 3 is close enough to read a crowded
// district. The floor is NOT a constant — zooming out stops the moment the
// world's first axis reaches 100% of the viewport, so the map always covers
// the screen edge to edge and never letterboxes.
const START_SCALE = 1;
const MAX_SCALE = 3;
/** Wheel exponent: one notch (~100px of deltaY) ≈ 16% — smooth, not jumpy. */
const WHEEL_ZOOM_RATE = 0.0015;

type Vec2 = { x: number; y: number };

type PointerTrack = { lastX: number; lastY: number; moved: number };

/** Camera and offset live in ONE state object: a zoom must move the scale and
 *  the offset together, or the anchored-focal math tears for a frame. */
type Camera = { scale: number; x: number; y: number };

type Options<T extends HTMLElement> = {
  /** World size as multipliers over the viewport (> 1 guarantees pannable margin). */
  spanX?: number;
  spanY?: number;
  /** Called when a zone tap survives the movement threshold. */
  onTapZone: (zoneId: string) => void;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(0, hi));

/** The zoom-out floor: the scale at which the square world's first axis hits
 *  100% of the viewport. Governed by the LONGER viewport axis — that is the
 *  one a shrinking square fills last, so stopping there keeps the world
 *  covering the screen on both axes with no bare background showing. */
const coverScale = (base: number, vp: Vec2) =>
  base > 0 && vp.x > 0 && vp.y > 0 ? Math.max(vp.x, vp.y) / base : START_SCALE;

const clampScale = (s: number, base: number, vp: Vec2) =>
  Math.min(Math.max(s, Math.min(coverScale(base, vp), START_SCALE)), MAX_SCALE);

/** Offset along one axis. Once the world is SMALLER than the viewport on this
 *  axis (any zoom below 1) there is nothing to pan, so it parks centred —
 *  a negative offset, which is why this cannot just be clamp(v, 0, …). */
const axisOffset = (v: number, side: number, vpLen: number) =>
  side <= vpLen ? (side - vpLen) / 2 : clamp(v, 0, side - vpLen);

export function useWorldPan<T extends HTMLElement>({ spanX = 1.6, spanY = 1.3, onTapZone }: Options<T>) {
  const viewportRef = useRef<T | null>(null);
  const [vpSize, setVpSize] = useState<Vec2>({ x: 0, y: 0 });
  const [camera, setCamera] = useState<Camera>({ scale: START_SCALE, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // The map art is square. Keep the world square while making it larger than
  // the viewport on both axes so the full illustration stays undistorted.
  // This is the scale-1 size; `world` below multiplies it by the live zoom.
  const baseSide = useMemo(
    () => Math.ceil(Math.max(vpSize.x * spanX, vpSize.y * spanY)),
    [vpSize, spanX, spanY]
  );
  const world = useMemo(() => {
    const side = Math.ceil(baseSide * camera.scale);
    return { w: side, h: side };
  }, [baseSide, camera.scale]);

  // Gesture handlers run off refs so they never close over stale geometry.
  const vpRef = useRef(vpSize);
  const baseRef = useRef(baseSide);
  useEffect(() => {
    vpRef.current = vpSize;
    baseRef.current = baseSide;
  }, [vpSize, baseSide]);

  /** The single camera transaction: zoom about a focal point, pan by a delta,
   *  or both at once (a pinch does both). Focal is in viewport-local px.
   *  Keeping the spot under `focal` fixed means the world point beneath it,
   *  (offset + focal), must scale by k and land back under focal. */
  const moveCamera = useCallback(
    (opts: { zoom?: number; focal?: Vec2; dx?: number; dy?: number }) => {
      setCamera((c) => {
        const base = baseRef.current;
        const vp = vpRef.current;
        if (!base || !vp.x || !vp.y) return c;
        const next = clampScale(c.scale * (opts.zoom ?? 1), base, vp);
        const k = next / c.scale;
        const focal = opts.focal ?? { x: vp.x / 2, y: vp.y / 2 };
        const side = Math.ceil(base * next);
        const x = axisOffset((c.x + focal.x) * k - focal.x - (opts.dx ?? 0), side, vp.x);
        const y = axisOffset((c.y + focal.y) * k - focal.y - (opts.dy ?? 0), side, vp.y);
        if (next === c.scale && x === c.x && y === c.y) return c;
        return { scale: next, x, y };
      });
    },
    []
  );

  // Track viewport size; re-clamp/center when it or the world changes.
  const centeredRef = useRef(false);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setVpSize({ x: r.width, y: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (vpSize.x === 0 || vpSize.y === 0 || baseSide === 0) return;
    // First valid measurement centers the world; afterwards keep position.
    // (Both paths are pure updaters — StrictMode double-invokes them.)
    if (!centeredRef.current) {
      centeredRef.current = true;
      setCamera((c) => {
        const side = Math.ceil(baseSide * c.scale);
        return { ...c, x: Math.max(0, side - vpSize.x) / 2, y: Math.max(0, side - vpSize.y) / 2 };
      });
    } else {
      // A resize can move the zoom-out floor (it tracks the viewport aspect),
      // so the scale is re-clamped here too, not just the offset.
      setCamera((c) => {
        const scale = clampScale(c.scale, baseSide, vpSize);
        const side = Math.ceil(baseSide * scale);
        return {
          scale,
          x: axisOffset(c.x, side, vpSize.x),
          y: axisOffset(c.y, side, vpSize.y),
        };
      });
    }
  }, [baseSide, vpSize.x, vpSize.y]);

  // Latest-callback ref: gesture handlers below are deliberately dependency-free.
  const onTapZoneRef = useRef(onTapZone);
  useEffect(() => {
    onTapZoneRef.current = onTapZone;
  });

  // ── gesture state (refs — no re-renders during a drag) ────────────────────
  const pointers = useRef(new Map<number, PointerTrack>());
  const panAnchor = useRef<number | null>(null);
  const tapCandidate = useRef<{ id: number; zoneId: string; invalidated: boolean } | null>(null);
  /** Live pinch: the two finger ids plus last distance/midpoint between them. */
  const pinch = useRef<{ a: number; b: number; dist: number; mid: Vec2 } | null>(null);

  const zoneFromTarget = (target: EventTarget | null): string | null => {
    const el = target instanceof Element ? target : null;
    return el?.closest("[data-map-zone]")?.getAttribute("data-map-zone") ?? null;
  };

  /** Viewport-local coords for a client point (focal math is relative to the map). */
  const toLocal = (clientX: number, clientY: number): Vec2 => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : { x: clientX, y: clientY };
  };

  /** Start (or restart) a pinch from the two touch pointers currently down. */
  const armPinch = () => {
    const touches = [...pointers.current.entries()];
    if (touches.length < 2) {
      pinch.current = null;
      return;
    }
    const [[aId, a], [bId, b]] = touches;
    pinch.current = {
      a: aId,
      b: bId,
      dist: Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY),
      mid: toLocal((a.lastX + b.lastX) / 2, (a.lastY + b.lastY) / 2),
    };
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      pointers.current.set(e.pointerId, { lastX: e.clientX, lastY: e.clientY, moved: 0 });

      // A second pointer joining kills any pending single-pointer tap.
      if (tapCandidate.current && tapCandidate.current.id !== e.pointerId)
        tapCandidate.current.invalidated = true;

      const zoneId = zoneFromTarget(e.target);
      // Pan eligibility, decided once at pointer-down:
      //   mouse middle → always; mouse left → empty space only; touch/pen → second finger.
      const wantsPan =
        (e.pointerType === "mouse" && e.button === 1) ||
        (e.pointerType === "mouse" && e.button === 0 && zoneId === null) ||
        (e.pointerType !== "mouse" && pointers.current.size === 2);

      // Two fingers down means pinch-zoom is live alongside the two-finger pan.
      if (e.pointerType !== "mouse" && pointers.current.size === 2) armPinch();

      if (wantsPan && panAnchor.current === null) {
        panAnchor.current = e.pointerId;
        setIsPanning(true);
        if (tapCandidate.current?.id === e.pointerId) tapCandidate.current = null; // a pan is never a tap
        try {
          viewportRef.current?.setPointerCapture?.(e.pointerId);
        } catch {
          /* pointer already gone — gestures still work via bubbling */
        }
        if (e.pointerType === "mouse") e.preventDefault(); // stop middle-click autoscroll
        return;
      }

      // Single left-click / single finger starting on a zone may become a tap —
      // never while a pan is in progress (e.g. a third finger landing on a zone).
      if (panAnchor.current === null && zoneId !== null && (e.pointerType !== "mouse" || e.button === 0))
        tapCandidate.current = { id: e.pointerId, zoneId, invalidated: false };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const t = pointers.current.get(e.pointerId);
      if (!t) return;
      const dx = e.clientX - t.lastX;
      const dy = e.clientY - t.lastY;
      t.lastX = e.clientX;
      t.lastY = e.clientY;
      t.moved += Math.hypot(dx, dy);
      if (tapCandidate.current?.id === e.pointerId && t.moved > TAP_SLOP_PX)
        tapCandidate.current = null; // drifted too far — this was a drag

      // Pinch owns the camera whenever two fingers are down: the spread scales
      // and the midpoint pans, in one transaction. The single-anchor pan below
      // is skipped so the anchoring finger's own motion isn't counted twice.
      const p = pinch.current;
      if (p && (e.pointerId === p.a || e.pointerId === p.b)) {
        const a = pointers.current.get(p.a);
        const b = pointers.current.get(p.b);
        if (a && b) {
          const dist = Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY);
          const mid = toLocal((a.lastX + b.lastX) / 2, (a.lastY + b.lastY) / 2);
          if (p.dist > 0 && dist > 0) {
            moveCamera({
              zoom: dist / p.dist,
              focal: mid,
              dx: mid.x - p.mid.x,
              dy: mid.y - p.mid.y,
            });
          }
          p.dist = dist;
          p.mid = mid;
        }
        return;
      }

      if (panAnchor.current === e.pointerId) moveCamera({ dx, dy });
    },
    [moveCamera]
  );

  const finishPointer = useCallback((e: React.PointerEvent) => {
    const t = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    // A finger leaving ends the pinch. If one finger remains it does NOT
    // silently inherit the camera — same rule the pan anchor has always used.
    if (pinch.current && (e.pointerId === pinch.current.a || e.pointerId === pinch.current.b))
      pinch.current = null;
    if (panAnchor.current === e.pointerId) {
      // The anchoring finger/mouse owns the gesture; when it lifts, the pan
      // ends — a remaining finger does not silently take over the camera.
      panAnchor.current = null;
      setIsPanning(false);
      try {
        viewportRef.current?.releasePointerCapture?.(e.pointerId);
      } catch {
        /* capture already gone — nothing to release */
      }
    }
    const cand = tapCandidate.current;
    if (cand && cand.id === e.pointerId) {
      tapCandidate.current = null;
      if (!cand.invalidated && t && t.moved <= TAP_SLOP_PX) onTapZoneRef.current(cand.zoneId);
    }
  }, []);

  // Wheel zoom. Registered natively because it must be non-passive to cancel
  // the page's scroll/overscroll, which React's own listener cannot promise.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      // deltaMode 1 = lines, 2 = pages — normalize both to px before scaling.
      const rect = el.getBoundingClientRect();
      const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? rect.height : 1;
      const delta = ev.deltaY * unit;
      if (!delta) return;
      moveCamera({
        zoom: Math.exp(-delta * WHEEL_ZOOM_RATE),
        focal: { x: ev.clientX - rect.left, y: ev.clientY - rect.top },
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [moveCamera]);

  const handlers = useMemo(
    () => ({
      onPointerDown,
      onPointerMove,
      onPointerUp: finishPointer,
      onPointerCancel: finishPointer,
      onAuxClick: (e: React.MouseEvent) => e.preventDefault(), // middle-click autoscroll fallback
    }),
    [onPointerDown, onPointerMove, finishPointer]
  );

  const offset = useMemo(() => ({ x: camera.x, y: camera.y }), [camera.x, camera.y]);

  return { viewportRef, world, offset, scale: camera.scale, isPanning, handlers };
}
