// services/lessonComponentLibrary.js
//
// Hand-written Remotion components, injected VERBATIM (never LLM-generated)
// into every lesson right after its header validates — see generateLessonCode
// in claudeService.js. Unlike PALETTE/ZONES/Backdrop, which the model still
// writes fresh per lesson, these are trusted, tested TSX source we control —
// zero syntax-error risk, and scenes call them WITH DATA instead of
// reimplementing the diagram from raw SVG, which also makes cross-scene
// consistency easier (the same nodes/edges/values prop needs to match across
// scenes, not a full from-scratch reimplementation).
//
// v1 scope: two components covering domainSkill "algorithm-trace" (graphs/
// trees/networks and arrays/sorting/searching — the exact case that exposed
// the original cross-scene-consistency bug this session). chart-data/
// equation-math/code-snippet are natural v2 additions.
//
// Layout is fully deterministic (circular for graphs, a centered row for
// arrays) — the model never invents or gets x/y coordinates wrong, it only
// supplies WHAT to show and WHEN (via revealAt frame numbers).
//
// Both components render their own full-frame, self-contained <svg> root
// (the same "shared visual helper must be SELF-CONTAINED" rule the header's
// own Backdrop/Motif already follow) — a scene can drop either anywhere,
// inside or outside an AbsoluteFill, with no wrapper needed.
//
// Contract: only consumes what the header already guarantees — PALETTE.bg/
// .accent/.text, CLAMP/SAFE/ZONES/clampPos, useCurrentFrame/interpolate/
// useMemo. No new required PALETTE key, so the header prompt never needs to
// change for this to work.

const LESSON_COMPONENT_NAMES = ["AnimatedGraph", "AnimatedArray"];

const LESSON_COMPONENT_LIBRARY_SOURCE = `
// ── Shared component library (hand-written, not model-generated) ──────────

// AnimatedGraph({ nodes, edges, activeNodes, highlightEdges, area })
//   nodes: [{ id, label? }]
//   edges: [{ from, to, weight? }]
//   activeNodes?: [{ id, state: "visited"|"active"|"default", revealAt?, distance? }]
//   highlightEdges?: [{ from, to, revealAt? }]
//   area?: { x, y, w, h } — defaults to ZONES.stage
// Nodes are laid out on a deterministic circle (order/count only) — never
// invent or read x/y coordinates for a node, this component computes them.
function AnimatedGraph({ nodes, edges, activeNodes, highlightEdges, area }) {
  const frame = useCurrentFrame();
  const a = area || ZONES.stage;
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;
  const radius = Math.max(60, Math.min(a.w, a.h) / 2 - 80);

  const positions = useMemo(() => {
    const map = {};
    const n = nodes.length;
    nodes.forEach((node, i) => {
      const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
      map[node.id] = {
        x: clampPos(cx + Math.cos(angle) * radius, SAFE.xMin, SAFE.xMax),
        y: clampPos(cy + Math.sin(angle) * radius, SAFE.yMin, SAFE.yMax),
      };
    });
    return map;
  }, [nodes, cx, cy, radius]);

  const activeById = useMemo(() => {
    const map = {};
    (activeNodes || []).forEach((n) => { map[n.id] = n; });
    return map;
  }, [activeNodes]);

  return (
    <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, pointerEvents: "none", overflow: "visible" }}>
      {edges.map((e, i) => {
        const from = positions[e.from];
        const to = positions[e.to];
        if (!from || !to) return null;
        const h = (highlightEdges || []).find((he) => (he.from === e.from && he.to === e.to) || (he.from === e.to && he.to === e.from));
        const revealAt = h ? (h.revealAt || 0) : 0;
        const drawn = h ? interpolate(frame - revealAt, [0, 20], [0, 1], CLAMP) : 1;
        const isHi = !!h && frame >= revealAt;
        const glow = isHi ? 8 + Math.sin(frame / 8 + i) * 4 : 0;
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2 - 14;
        return (
          <g key={e.from + "-" + e.to + "-" + i}>
            <line
              x1={from.x} y1={from.y}
              x2={from.x + (to.x - from.x) * drawn} y2={from.y + (to.y - from.y) * drawn}
              stroke={isHi ? PALETTE.accent : PALETTE.text}
              strokeWidth={isHi ? 4 + Math.sin(frame / 8) * 1.5 : 2}
              opacity={isHi ? 0.95 : 0.35}
              style={isHi ? { filter: "drop-shadow(0 0 " + glow + "px " + PALETTE.accent + ")" } : undefined}
            />
            {e.weight !== undefined && drawn > 0.5 ? (
              <text x={midX} y={midY} textAnchor="middle" fontSize={20} fontWeight={700} fill={PALETTE.text} opacity={0.85}>
                {e.weight}
              </text>
            ) : null}
          </g>
        );
      })}
      {nodes.map((node, i) => {
        const pos = positions[node.id];
        if (!pos) return null;
        const active = activeById[node.id];
        const state = active ? active.state : "default";
        const revealAt = active ? (active.revealAt || 0) : 0;
        const grown = interpolate(frame - revealAt, [0, 18], [0, 1], CLAMP);
        const pulse = 1 + Math.sin(frame / 10 + i) * 0.05;
        const r = (28 + (state === "active" ? 6 : 0)) * (0.3 + grown * 0.7) * pulse;
        const fill = state === "default" ? PALETTE.bg : PALETTE.accent;
        const stroke = state === "default" ? PALETTE.text : PALETTE.accent;
        const glow = state !== "default" ? 14 + Math.sin(frame / 9 + i) * 6 : 0;
        const textColor = state === "default" ? PALETTE.text : PALETTE.bg;
        return (
          <g key={node.id}>
            <circle
              cx={pos.x} cy={pos.y} r={r}
              fill={fill} stroke={stroke} strokeWidth={3}
              opacity={0.4 + grown * 0.6}
              style={glow ? { filter: "drop-shadow(0 0 " + glow + "px " + PALETTE.accent + ")" } : undefined}
            />
            <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="middle" fontSize={22} fontWeight={800}
              fill={textColor} opacity={0.4 + grown * 0.6}>
              {node.label || node.id}
            </text>
            {active && active.distance !== undefined && grown > 0.4 ? (
              <text x={pos.x} y={pos.y + r + 22} textAnchor="middle" fontSize={17} fontWeight={700} fill={PALETTE.text} opacity={0.9}>
                {active.distance}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

// AnimatedArray({ values, highlightIndices, area })
//   values: array of number|string, rendered left-to-right in order
//   highlightIndices?: [{ index, state: "comparing"|"active"|"sorted"|"default", revealAt? }]
//   area?: { x, y, w, h } — defaults to ZONES.stage
// Box positions are computed from values.length only — never invent x/y.
function AnimatedArray({ values, highlightIndices, area }) {
  const frame = useCurrentFrame();
  const a = area || ZONES.stage;
  const n = values.length;
  const gap = 14;
  const boxW = Math.min(110, (a.w - gap * Math.max(n - 1, 0)) / Math.max(n, 1));
  const boxH = boxW;
  const totalW = boxW * n + gap * Math.max(n - 1, 0);
  const startX = a.x + (a.w - totalW) / 2;
  const baseY = a.y + a.h / 2 - boxH / 2;

  const highlightByIndex = useMemo(() => {
    const map = {};
    (highlightIndices || []).forEach((h) => { map[h.index] = h; });
    return map;
  }, [highlightIndices]);

  return (
    <svg style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, pointerEvents: "none", overflow: "visible" }}>
      {values.map((v, i) => {
        const x = startX + i * (boxW + gap);
        const h = highlightByIndex[i];
        const state = h ? h.state : "default";
        const revealAt = h ? (h.revealAt || 0) : 0;
        const grown = interpolate(frame - revealAt, [0, 16], [0.85, 1], CLAMP);
        const bob = state !== "default" ? Math.sin(frame / 9 + i) * 3 : 0;
        const fill = state === "default" ? PALETTE.bg : PALETTE.accent;
        const opacity = state === "sorted" ? 0.9 : state === "active" ? 0.95 : state === "comparing" ? 0.55 : 0.3;
        const stroke = state === "default" ? PALETTE.text : PALETTE.accent;
        const glow = state !== "default" ? 12 + Math.sin(frame / 8 + i) * 5 : 0;
        const textColor = state === "default" ? PALETTE.text : PALETTE.bg;
        const boxX = clampPos(x, SAFE.xMin, SAFE.xMax - boxW);
        const boxY = clampPos(baseY, SAFE.yMin, SAFE.yMax - boxH);
        return (
          <g key={i} transform={"translate(0," + bob + ")"}>
            <rect
              x={boxX} y={boxY}
              width={boxW * grown} height={boxH * grown}
              rx={10} fill={fill} stroke={stroke} strokeWidth={2.5} opacity={opacity}
              style={glow ? { filter: "drop-shadow(0 0 " + glow + "px " + PALETTE.accent + ")" } : undefined}
            />
            <text
              x={boxX + boxW / 2} y={boxY + boxH / 2}
              textAnchor="middle" dominantBaseline="middle" fontSize={26} fontWeight={800} fill={textColor} opacity={grown}
            >
              {v}
            </text>
            <text
              x={boxX + boxW / 2} y={boxY + boxH + 26}
              textAnchor="middle" fontSize={15} fill={PALETTE.text} opacity={0.5}
            >
              {i}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
`;

module.exports = { LESSON_COMPONENT_LIBRARY_SOURCE, LESSON_COMPONENT_NAMES };
