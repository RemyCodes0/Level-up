// services/geometryCheckService.js
//
// Deterministic, math-only geometry verification for generated scene code —
// NOT an aesthetic/quality critic (that's codeCriticService.js, which the
// user explicitly does NOT want back after a bad experience with it flagging
// nearly everything). This checks four concrete, objective things:
//   1. An element (or part of one) rendering outside the visible frame/SAFE
//      bounds.
//   2. Two elements overlapping that were never meant to touch (same-kind
//      repeated siblings — array cells, graph nodes, particles — colliding).
//   3. An element escaping a container shape it's meant to sit inside.
//   4. The same containment failure specifically for text inside a box.
//
// Every check is arithmetic on REAL bounding boxes, not an LLM's opinion —
// either a box exceeds SAFE by 40px or it doesn't. This is deliberate: it
// structurally cannot suffer the "always finds something" false-positive
// problem a subjective critic has, because there's no judgment call to be
// biased. See the design discussion this was built from for the full
// reasoning (SAFE/clampPos only clamps a CENTER point, never accounting for
// a shape's own radius/width — a circle can be perfectly "in bounds" by its
// center and still stick 100px past the frame edge).
//
// How it works, end to end:
//   1. Compile the header + this one scene together with @babel/standalone
//      (the exact same library src/remotion/useCompilation.ts already uses
//      client-side, just ported to Node/CommonJS) — NOT a real browser, no
//      video render, no Puppeteer. Just enough to turn TSX into plain JS.
//   2. Execute the scene's component function DIRECTLY, as a plain JS
//      function call (React.createElement objects are just plain {type,
//      props} data — no reconciler needed to walk them), at a handful of
//      sampled frames across its duration, with useCurrentFrame() stubbed to
//      return each sample.
//   3. Recursively walk the returned element tree, computing each SVG
//      primitive's ABSOLUTE bounding box (accounting for ancestor <g
//      transform="..."> translate/rotate/scale) directly from its props —
//      no rendering, pure geometry math.
//   4. Run the four checks above against those real boxes.
//
// This is intentionally NOT pixel-perfect (text width is estimated from
// character count, not real font metrics; path/polygon bboxes are a min/max
// over their coordinate list, not a true curve-aware bbox) — the goal is
// catching GROSS geometric mistakes cheaply on every scene, not exhaustive
// QA. Generous tolerances throughout are a deliberate choice to bias toward
// under-flagging rather than recreating the old critic's over-flagging
// problem.
//
// Fails OPEN, always: any internal error (a compile failure, an
// unrecognized code shape, an execution exception) returns { ok: true } —
// a bug in this NEW, experimental check must never block or corrupt a real
// generation. Same non-fatal philosophy as every other side-check in this
// codebase.
const Babel = require("@babel/standalone");

const FRAME = { w: 1920, h: 1080 };
const SAFE = { xMin: 120, xMax: 1800, yMin: 120, yMax: 960 };
// Verbatim from LESSON_HEADER_RULES/LESSON_CHUNK_RULES's own contract —
// rule 10 already tells the model "Layer 2's footprint [must be] centered/
// sized to fit inside ZONES.stage... never drifting into title/caption."
// The zone-intrusion check below enforces that EXISTING documented rule
// with real geometry, not a new standard invented for this check.
const ZONES = {
  title: { x: 120, y: 120, w: 1680, h: 130 },
  stage: { x: 120, y: 270, w: 1680, h: 580 },
  caption: { x: 120, y: 870, w: 1680, h: 90 },
};

// Tolerances — generous on purpose. A few px of overshoot from rounding or
// a glow/shadow filter's own bleed is normal and not worth flagging.
const FRAME_TOLERANCE_PX = 5;
const SAFE_TOLERANCE_PX = 20;
// An element whose box already covers most of the frame is almost always an
// intentional full-bleed background/backdrop — exempt it from off-SAFE (not
// off-FRAME) entirely rather than flag something that's supposed to be
// edge-to-edge.
const BACKDROP_AREA_RATIO = 0.85;
// Sibling-overlap: only flag SUBSTANTIAL overlap (as a fraction of the
// smaller box's own area) — minor edge-touching between adjacent elements
// (two array cells with a 2px gap that rounds to touching) is normal.
const OVERLAP_AREA_RATIO_THRESHOLD = 0.5;
// Containment: only flag a child extending meaningfully past its container —
// a few px of a stroke/glow bleeding past the edge is normal.
const CONTAINMENT_SLACK_RATIO = 0.15;

// Raised from 5 — pure JS function calls, not LLM calls, so denser
// sampling is nearly free and catches more of a motion path (an element
// that only drifts off-screen briefly between two of the old, sparser
// sample points was previously invisible to this check).
const SAMPLE_COUNT = 8;

// ── Step 1: compile header + one scene into a callable function ────────────
// Mirrors useCompilation.ts's approach closely (same library, same shape of
// scope-destructure prelude) but far simpler: no Remotion module needed at
// all, since nothing here actually renders — useCurrentFrame/interpolate/
// Math are all that's needed to compute real numbers, and AbsoluteFill/etc
// are only ever containers whose OWN geometry doesn't matter to these checks
// (they're stubbed to just return their children, so the walk still reaches
// real SVG primitives inside them).
// Confirmed necessary against real generated code: virtually every scene
// wraps its whole body in <AbsoluteFill>, and since that's a pass-through
// stub in this sandbox (not a real component with a meaningful identity),
// walkTree's "use the called function's own name as the role for its
// children" logic was using the STUB's OWN name for practically everything
// in every scene — collapsing all of a scene's raw, unrelated elements into
// one indiscriminate group and comparing any two same-tag shapes anywhere
// in the scene for "unwanted overlap," regardless of whether they were ever
// meant to be related. Marking pass-through stubs with this flag tells
// walkTree to keep the PARENT's role unchanged instead of overwriting it —
// only a REAL named custom component (Gear, SampleDot, GraphNode — anything
// the model itself wrote or a library component) should ever start a new
// role group.
function markPassthrough(fn) {
  fn.__isGeometryCheckPassthrough = true;
  return fn;
}

function buildSandboxScope(currentFrameRef) {
  const identity = markPassthrough((props) => (props && props.children !== undefined ? props.children : null));
  return {
    useCurrentFrame: () => currentFrameRef.value,
    useVideoConfig: () => ({ fps: 30, width: FRAME.w, height: FRAME.h, durationInFrames: 9999 }),
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useRef: (initial) => ({ current: initial }),
    interpolate: (input, inputRange, outputRange, options) => {
      // Minimal, faithful re-implementation — real Remotion isn't available
      // here and pulling it in just for this would be a much heavier
      // dependency than this check needs. Same clamp semantics as
      // CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      // which is the only options shape this codebase's prompts ever use.
      if (input <= inputRange[0]) return options?.extrapolateLeft === "extend" ? extrapolate(input, inputRange, outputRange) : outputRange[0];
      if (input >= inputRange[inputRange.length - 1]) return options?.extrapolateRight === "extend" ? extrapolate(input, inputRange, outputRange) : outputRange[outputRange.length - 1];
      return extrapolate(input, inputRange, outputRange);
    },
    interpolateColors: (input, inputRange, outputRange) => {
      // Colors don't affect geometry — a stable, harmless stand-in is fine.
      const t = Math.max(0, Math.min(1, (input - inputRange[0]) / (inputRange[inputRange.length - 1] - inputRange[0] || 1)));
      return t < 0.5 ? outputRange[0] : outputRange[outputRange.length - 1];
    },
    spring: ({ frame, fps, config } = {}) => {
      const f = frame ?? currentFrameRef.value;
      const rate = (fps || 30) / 10;
      return Math.min(1, 1 - Math.exp(-f / rate));
    },
    Easing: { ease: (t) => t, linear: (t) => t, bezier: () => (t) => t, out: (fn) => fn, inOut: (fn) => fn },
    random: (seed) => {
      // Deterministic pseudo-random, same as Remotion's own contract (same
      // seed -> same value) — good enough for a geometry sample, real
      // visual randomness doesn't matter here.
      const s = typeof seed === "string" ? seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0) : Number(seed) || 0;
      const x = Math.sin(s * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    },
    AbsoluteFill: identity,
    Sequence: identity,
    Loop: identity,
    Series: Object.assign(identity, { Sequence: identity }),
    Audio: () => null,
    Img: (props) => ({ type: "rect", props: { x: 0, y: 0, width: props?.width ?? 0, height: props?.height ?? 0 } }),
  };
}

function extrapolate(input, inputRange, outputRange) {
  for (let i = 0; i < inputRange.length - 1; i++) {
    const a = inputRange[i], b = inputRange[i + 1];
    if (input >= a && input <= b) {
      const t = (input - a) / (b - a || 1);
      return outputRange[i] + t * (outputRange[i + 1] - outputRange[i]);
    }
  }
  return outputRange[outputRange.length - 1];
}

// Compiles headerCode + chunkCode together (exactly what the real runtime
// does — see generateLessonCode's own header+chunk splice) and returns a
// map of { sceneName: callableFunction }. Throws on any compile/parse
// failure — the caller wraps this in the same fail-open try/catch as
// everything else here.
function compileForGeometryCheck(fullCode, currentFrameRef) {
  const withoutImports = fullCode
    .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, "")
    .trim();
  const withoutExports = withoutImports
    .replace(/export\s+const\s+/g, "const ")
    .replace(/export\s+function\s+/g, "function ");

  const scope = buildSandboxScope(currentFrameRef);
  const scopeKeys = Object.keys(scope);
  // Same collision-avoidance as useCompilation.ts: a lesson that itself
  // declares a top-level name matching one of our stub scope keys (rare,
  // but e.g. a lesson genuinely naming something "random") must let its
  // OWN declaration win, not the stub — otherwise this is a duplicate-const
  // SyntaxError that fails the check for no real reason.
  const declared = new Set();
  const declPattern = /^(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = declPattern.exec(withoutExports)) !== null) declared.add(m[1]);
  const usableKeys = scopeKeys.filter((k) => !declared.has(k));
  const prelude = `const { ${usableKeys.join(", ")} } = __SCOPE__;\n`;

  const result = Babel.transform(prelude + withoutExports, {
    // runtime: "classic" is explicit, not just relying on whatever a given
    // @babel/standalone major version happens to default to — confirmed the
    // hard way: bumping past 7.x silently switches the React preset's
    // default to the "automatic" JSX runtime, which compiles JSX into
    // require("react/jsx-runtime") calls instead of React.createElement(...)
    // — there's no module resolver in this sandboxed new Function() context,
    // so every single check failed open with "require is not defined" until
    // this was pinned down against a real generated scene.
    presets: [["react", { runtime: "classic" }], "typescript"],
    filename: "geometry-check.tsx",
    sourceType: "script",
  });
  if (!result.code) throw new Error("Babel produced no output for geometry check");

  // Every top-level function/const declaration is exposed on a returned
  // object, keyed by name — the caller picks out just the one scene it
  // wants by name, but this also lets nested calls (a scene calling a
  // header-declared Backdrop/Label/library component) resolve naturally
  // since they're all in the SAME executed scope.
  const names = [...declared].filter((n) => n !== "React");
  const factory = new Function(
    "React", "__SCOPE__",
    `"use strict";\n${result.code}\nreturn { ${names.join(", ")} };`
  );
  return factory({ createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.length <= 1 ? children[0] : children } }) }, scope);
}

// ── Step 2/3: walk the element tree, compute absolute bounding boxes ───────
// A 2D affine transform: [a, b, c, d, e, f] applied as
//   x' = a*x + c*y + e,  y' = b*x + d*y + f
const IDENTITY_MATRIX = [1, 0, 0, 1, 0, 0];

function multiplyMatrix(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function translationMatrix(x, y) { return [1, 0, 0, 1, x, y]; }
function rotationMatrix(deg, cx = 0, cy = 0) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const rot = [cos, sin, -sin, cos, 0, 0];
  if (!cx && !cy) return rot;
  return multiplyMatrix(multiplyMatrix(translationMatrix(cx, cy), rot), translationMatrix(-cx, -cy));
}
function scaleMatrix(sx, sy = sx) { return [sx, 0, 0, sy, 0, 0]; }

// Parses the handful of transform functions this codebase's generated code
// actually uses (translate/rotate/scale — confirmed against every
// hand-written and seeded component this session) into a combined matrix.
// Anything unrecognized is safely ignored (identity) rather than guessed at.
function parseTransform(transformStr) {
  if (!transformStr || typeof transformStr !== "string") return IDENTITY_MATRIX;
  let matrix = IDENTITY_MATRIX;
  const fnPattern = /(translate|rotate|scale)\(([^)]*)\)/g;
  let m;
  while ((m = fnPattern.exec(transformStr)) !== null) {
    const args = m[2].split(/[\s,]+/).map(Number).filter((n) => !Number.isNaN(n));
    let next = IDENTITY_MATRIX;
    if (m[1] === "translate") next = translationMatrix(args[0] || 0, args[1] || 0);
    else if (m[1] === "rotate") next = rotationMatrix(args[0] || 0, args[1], args[2]);
    else if (m[1] === "scale") next = scaleMatrix(args[0] ?? 1, args[1]);
    matrix = multiplyMatrix(matrix, next);
  }
  return matrix;
}

function applyMatrixToPoint(matrix, x, y) {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}

// Transforms a local-space bbox by a matrix and returns the new AABB (all 4
// corners, not just center — this is what correctly handles rotation).
function transformBox(box, matrix) {
  const corners = [
    applyMatrixToPoint(matrix, box.x1, box.y1),
    applyMatrixToPoint(matrix, box.x2, box.y1),
    applyMatrixToPoint(matrix, box.x1, box.y2),
    applyMatrixToPoint(matrix, box.x2, box.y2),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Local-space (pre-transform) bbox for one SVG primitive, straight from its
// props — no rendering, just the shape's own geometry formula.
function localBoxForElement(type, props) {
  switch (type) {
    case "circle":
      return { x1: num(props.cx) - num(props.r), y1: num(props.cy) - num(props.r), x2: num(props.cx) + num(props.r), y2: num(props.cy) + num(props.r) };
    case "ellipse":
      return { x1: num(props.cx) - num(props.rx), y1: num(props.cy) - num(props.ry), x2: num(props.cx) + num(props.rx), y2: num(props.cy) + num(props.ry) };
    case "rect":
      return { x1: num(props.x), y1: num(props.y), x2: num(props.x) + num(props.width), y2: num(props.y) + num(props.height) };
    case "line":
      return { x1: Math.min(num(props.x1), num(props.x2)), y1: Math.min(num(props.y1), num(props.y2)), x2: Math.max(num(props.x1), num(props.x2)), y2: Math.max(num(props.y1), num(props.y2)) };
    case "text": {
      // No real font metrics available without an actual renderer —
      // deliberately generous estimate (favors under-flagging, matching
      // the whole file's bias against false positives). fontSize/children
      // may themselves be expressions that evaluated to non-strings; String()
      // guards that.
      const fontSize = num(props.fontSize, 20);
      const text = props.children != null ? String(Array.isArray(props.children) ? props.children.join("") : props.children) : "";
      const estWidth = text.length * fontSize * 0.62;
      const estHeight = fontSize * 1.3;
      const x = num(props.x);
      const y = num(props.y);
      const anchor = props.textAnchor || "start";
      const x1 = anchor === "middle" ? x - estWidth / 2 : anchor === "end" ? x - estWidth : x;
      return { x1, y1: y - estHeight * 0.8, x2: x1 + estWidth, y2: y + estHeight * 0.3 };
    }
    case "path":
    case "polygon":
    case "polyline": {
      // Crude but safe: min/max over every numeric token in d/points. For
      // curves this can OVER-estimate the true bbox (control points can lie
      // outside the visible curve) — an over-estimate only risks under-
      // flagging a rare edge case, never a false positive, which is the
      // right direction to err in for this check.
      const raw = props.d || props.points || "";
      const nums = (String(raw).match(/-?\d+\.?\d*/g) || []).map(Number);
      if (nums.length < 2) return null;
      const xs = nums.filter((_, i) => i % 2 === 0);
      const ys = nums.filter((_, i) => i % 2 === 1);
      if (!xs.length || !ys.length) return null;
      return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
    }
    default:
      return null;
  }
}

const SVG_PRIMITIVE_TAGS = new Set(["circle", "ellipse", "rect", "line", "text", "path", "polygon", "polyline"]);

// Recursively walks a React-createElement-shaped tree, returning a flat list
// of { tag, box, role, isBackdropLike } for every SVG primitive found, with
// absolute coordinates (every ancestor <g transform> already applied).
// `role` groups elements for the sibling-overlap check — the nearest named
// custom-component ancestor (or "root" if none), so instances from the SAME
// .map()-generated repeat or the same reusable component call group
// together, while genuinely different element types never get compared.
function walkTree(node, matrix, role, out, depth, headerNames) {
  if (depth > 60 || node == null || typeof node !== "object") return; // guards against a pathological/cyclic tree
  if (Array.isArray(node)) {
    node.forEach((child) => walkTree(child, matrix, role, out, depth + 1, headerNames));
    return;
  }
  if (!("type" in node)) return;

  const { type, props = {} } = node;

  if (typeof type === "function") {
    // CONFIRMED IN A REAL PRODUCTION RUN, not hypothetical: a header-
    // declared component (Backdrop, Motif, any shared decoration) renders
    // the SAME way in every single scene of a lesson, since every scene
    // calls into the same header. If ONE of those happens to sit outside
    // SAFE (a small corner element, similar in spirit to renderService.js's
    // own real watermark, which is deliberately positioned near the edge,
    // outside typical "content" bounds) — every scene in the WHOLE lesson
    // gets flagged identically, and worse: the retry/patch mechanism can
    // only ever regenerate SCENE code, never the header, so a header-
    // caused violation can NEVER be fixed by patching or even fully
    // regenerating the scene — every attempt just re-triggers the exact
    // same unfixable flag until the entire retry budget is exhausted. A
    // real course got stuck retrying every chunk up to its full budget
    // this way before this exemption existed. Fix: a component whose name
    // was declared in the HEADER (not this scene) is never descended
    // into — whatever it renders is the header's responsibility, not
    // something this check should ever hold a scene-level retry hostage
    // to. Scene-declared helpers (including ones nested inside the scene
    // function itself) are unaffected — only names that came from the
    // header are exempted.
    if (headerNames && headerNames.has(type.name)) return;

    // A custom component (Gear, a scene-local helper, an active library
    // component) — call it directly, same as React would, and recurse
    // into whatever it returns. Its OWN name becomes the role for
    // everything nested inside it, so e.g. every <circle> inside repeated
    // <GraphNode> calls groups together for overlap checking, not with
    // unrelated circles elsewhere in the scene. EXCEPT a pass-through stub
    // (AbsoluteFill/Sequence/Loop/Series — see markPassthrough) never gets
    // to start a new role group; the parent's role carries through
    // unchanged, since these wrap nearly everything in every scene and
    // would otherwise collapse all of a scene's unrelated content into one
    // group.
    let rendered;
    try {
      rendered = type(props);
    } catch (err) {
      // A component throwing here is a REAL bug, but not one this check is
      // responsible for diagnosing — structural/runtime validation already
      // covers that class of failure elsewhere. Skip this subtree.
      return;
    }
    const nextRole = type.__isGeometryCheckPassthrough ? role : (type.name || role);
    walkTree(rendered, matrix, nextRole, out, depth + 1, headerNames);
    return;
  }

  if (typeof type !== "string") return; // Fragment or unrecognized node shape

  // Confirmed against a real generated scene: a <pattern> tile's own path
  // (e.g. a background grid texture's "M 80 0 L 0 0 0 80" repeat unit) has
  // TEMPLATE-LOCAL coordinates, not real screen positions — it's never
  // rendered directly at its own (x,y), only tiled wherever something else
  // references it via fill="url(#id)". Checking it against SAFE/FRAME is
  // meaningless and was the single biggest false-positive source in
  // testing (flagged on every scene, since headers commonly share one grid
  // pattern). Anything inside <defs> or <pattern> is skipped entirely.
  if (type === "defs" || type === "pattern") return;

  let nextMatrix = matrix;
  if (type === "g" && props.transform) {
    nextMatrix = multiplyMatrix(matrix, parseTransform(props.transform));
  }

  if (SVG_PRIMITIVE_TAGS.has(type)) {
    const localBox = localBoxForElement(type, props);
    if (localBox) {
      const absBox = transformBox(localBox, nextMatrix);
      const area = Math.max(0, absBox.x2 - absBox.x1) * Math.max(0, absBox.y2 - absBox.y1);
      out.push({
        tag: type,
        box: absBox,
        role,
        isBackdropLike: area >= FRAME.w * FRAME.h * BACKDROP_AREA_RATIO,
        // Raw props carried through so runChecks can look at paint
        // (fill/stroke), raw pre-clamp size values (negative-size
        // detection), and text content (undefined/NaN-as-text detection)
        // without needing separate plumbing for each new check.
        props,
      });
    }
  }

  const children = props.children;
  if (children != null) walkTree(children, nextMatrix, role, out, depth + 1, headerNames);
}

// ── Step 4: the four checks ─────────────────────────────────────────────
function boxOverlapArea(a, b) {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  return w > 0 && h > 0 ? w * h : 0;
}
function boxArea(b) {
  return Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
}

function runChecks(elements, frame) {
  const issues = [];

  for (const el of elements) {
    const { box } = el;
    const finite = Number.isFinite(box.x1) && Number.isFinite(box.y1) && Number.isFinite(box.x2) && Number.isFinite(box.y2);
    // EXTREME_VALUE_THRESHOLD catches technically-finite-but-absurd values
    // (a coordinate in the 1e40+ range) the same way as outright NaN —
    // deliberately generic wording ("invalid"), not a specific off-frame
    // claim, because a value this far outside reality could be a genuine
    // runaway calculation OR this check's own simplified spring()/
    // interpolate() approximations diverging from real Remotion under some
    // edge case that hasn't been fully characterized yet. Reporting it as
    // "invalid" either way is honest about that uncertainty rather than
    // asserting a precise (and possibly check-side-caused) pixel overshoot.
    const extreme = finite && [box.x1, box.y1, box.x2, box.y2].some((v) => Math.abs(v) > 1e6);
    if (!finite || extreme) {
      issues.push(`A <${el.tag}> element computed a NaN/invalid/absurd position or size at frame ${frame} — likely a division by zero or an undefined value used in a coordinate calculation.`);
      continue;
    }
    if (!el.isBackdropLike && (box.x2 - box.x1) < 0.5 && (box.y2 - box.y1) < 0.5) {
      // Zero/near-zero size on something that isn't a deliberate point/line —
      // skip lines (legitimately can be zero-area) and only flag shapes.
      if (el.tag !== "line") {
        issues.push(`A <${el.tag}> element rendered with essentially zero size at frame ${frame} — it computed to an invisible point instead of a visible shape.`);
      }
    }

    // Negative size — always a bug (SVG doesn't render a negative width/
    // height/radius, it's simply invalid), and diagnostically more useful
    // to say so directly than to let it fall through as an ambiguous
    // "zero size" message. Checked on the RAW prop values, before the
    // bbox math below (which would otherwise just silently produce a
    // flipped x1>x2 box that collapses to zero area).
    const rawSizeProps = { r: el.props.r, rx: el.props.rx, ry: el.props.ry, width: el.props.width, height: el.props.height };
    const negativeSizeProp = Object.entries(rawSizeProps).find(([, v]) => v !== undefined && Number(v) < 0);
    if (negativeSizeProp) {
      issues.push(`A <${el.tag}> element has a NEGATIVE ${negativeSizeProp[0]} (${negativeSizeProp[1]}) at frame ${frame} — SVG cannot render a negative size, this is always a formula/sign bug (e.g. subtracting the wrong way), not a valid shrink effect.`);
    }

    // Invisible despite having real size — fill explicitly turned off with
    // no stroke to compensate. SVG's own default fill (black) means most
    // elements ARE visible even with no fill prop at all, so this only
    // fires when fill was explicitly disabled — a real, common mistake
    // (e.g. copying a "fill: none, stroke: ..." pattern for an outline
    // shape but forgetting the stroke half).
    const fillOff = el.props.fill === "none" || el.props.fill === "transparent";
    const hasStroke = el.props.stroke && el.props.stroke !== "none" && Number(el.props.strokeWidth ?? 1) > 0;
    if (fillOff && !hasStroke && el.tag !== "line") {
      issues.push(`A <${el.tag}> element has fill="${el.props.fill}" and no stroke at frame ${frame} — it occupies real space but paints nothing, so it will never actually be visible.`);
    }

    // A text element literally displaying "undefined"/"null"/"NaN" — a
    // common symptom of an interpolated value that was never actually
    // computed (a missing prop, a lookup that failed). Word-boundary
    // matched so it catches both the whole string being exactly that AND
    // a larger string with the bad token embedded ("Value: NaN").
    if (el.tag === "text") {
      const textContent = el.props.children != null ? String(Array.isArray(el.props.children) ? el.props.children.join("") : el.props.children) : "";
      if (/\b(undefined|null|NaN)\b/.test(textContent)) {
        issues.push(`A <text> element displays the literal word "${textContent.match(/\b(undefined|null|NaN)\b/)[0]}" at frame ${frame} (full text: "${textContent.slice(0, 60)}") — this is what an un-computed or missing value looks like on screen, not real content.`);
      }
    }

    if (el.isBackdropLike) continue; // full-bleed background elements are exempt from frame/SAFE/zone checks below

    // <text> gets extra slack — its box comes from an ESTIMATED width (no
    // real font metrics available without an actual renderer, see
    // localBoxForElement), so a borderline case is much more likely to be
    // this check's own imprecision than a genuine overshoot. Shapes get the
    // normal, tighter tolerance since their boxes come straight from real
    // props (cx/r, x/width, ...), not an estimate.
    const tol = el.tag === "text" ? 2.5 : 1;

    const overFrame = box.x1 < -FRAME_TOLERANCE_PX * tol || box.y1 < -FRAME_TOLERANCE_PX * tol || box.x2 > FRAME.w + FRAME_TOLERANCE_PX * tol || box.y2 > FRAME.h + FRAME_TOLERANCE_PX * tol;
    if (overFrame) {
      issues.push(`A <${el.tag}> element at roughly (${Math.round((box.x1 + box.x2) / 2)}, ${Math.round((box.y1 + box.y2) / 2)}) extends outside the visible 1920x1080 frame at frame ${frame} — bounding box [${Math.round(box.x1)}, ${Math.round(box.y1)}, ${Math.round(box.x2)}, ${Math.round(box.y2)}].`);
      continue; // don't also report the milder SAFE violation for the same element
    }

    const overSafe = box.x1 < SAFE.xMin - SAFE_TOLERANCE_PX * tol || box.y1 < SAFE.yMin - SAFE_TOLERANCE_PX * tol || box.x2 > SAFE.xMax + SAFE_TOLERANCE_PX * tol || box.y2 > SAFE.yMax + SAFE_TOLERANCE_PX * tol;
    if (overSafe) {
      issues.push(`A <${el.tag}> element at roughly (${Math.round((box.x1 + box.x2) / 2)}, ${Math.round((box.y1 + box.y2) / 2)}) extends outside the SAFE content area at frame ${frame} — this position was never routed through clampPos()/SAFE, or a shape's own radius/width was not accounted for when clamping just its center point.`);
    }
  }

  // Sibling overlap: group by (role, tag) so only genuinely comparable
  // repeated elements (same reusable piece, same primitive kind) are
  // compared against each other. Deliberately EXCLUDES the "root" role —
  // raw elements sitting directly in a scene's own <svg>, not wrapped in
  // any named custom component, have no reliable signal that any two of
  // them were ever meant to be "the same repeated thing" rather than two
  // unrelated shapes that happen to share a tag name. Only a genuine named
  // component (the model's own Gear/SampleDot/GraphNode, or an active
  // library component) is a safe enough signal for this check.
  const groups = new Map();
  for (const el of elements) {
    if (el.isBackdropLike || el.role === "root") continue;
    const key = `${el.role}::${el.tag}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(el);
  }
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const overlap = boxOverlapArea(group[i].box, group[j].box);
        if (overlap <= 0) continue;
        const smallerArea = Math.min(boxArea(group[i].box), boxArea(group[j].box));
        if (smallerArea > 0 && overlap / smallerArea > OVERLAP_AREA_RATIO_THRESHOLD) {
          issues.push(`Two <${group[i].tag}> elements from the same repeated group ("${key.split("::")[0]}") substantially overlap each other at frame ${frame} — they were meant to be visually distinct instances but ended up on top of one another, likely a positioning-formula bug.`);
        }
      }
    }
  }

  return issues;
}

// Containment: for each element that looks like a container (large,
// filled/stroked shape) check that its LATER siblings under the same parent
// group stay within it. Deliberately conservative — only compares elements
// that were pushed consecutively from the SAME role (same parent group),
// and only flags a child extending meaningfully past the container, not
// minor edge bleed.
// Zone intrusion — enforces LESSON_CHUNK_RULES' own rule 10 verbatim
// ("Layer 2's footprint... never drifting into title/caption") with real
// geometry instead of trusting the model followed it. Deliberately scoped
// to non-text shapes only: <text> is EXPECTED to live inside the title/
// caption zones (that's literally what those zones are for — Layer 1/3
// text), so checking text against them would be checking the wrong thing
// entirely. Only flags SUBSTANTIAL intrusion (>30% of the element's own
// area inside a zone it doesn't belong in) — a shape's edge grazing a zone
// boundary by a few px is normal and not what rule 10 is actually about.
function checkZoneIntrusion(elements, frame) {
  const issues = [];
  const forbiddenZones = [
    { name: "title", box: { x1: ZONES.title.x, y1: ZONES.title.y, x2: ZONES.title.x + ZONES.title.w, y2: ZONES.title.y + ZONES.title.h } },
    { name: "caption", box: { x1: ZONES.caption.x, y1: ZONES.caption.y, x2: ZONES.caption.x + ZONES.caption.w, y2: ZONES.caption.y + ZONES.caption.h } },
  ];
  for (const el of elements) {
    if (el.isBackdropLike || el.tag === "text") continue;
    const elArea = boxArea(el.box);
    if (elArea <= 0) continue;
    for (const zone of forbiddenZones) {
      const overlap = boxOverlapArea(el.box, zone.box);
      if (overlap / elArea > 0.3) {
        issues.push(`A <${el.tag}> element substantially overlaps the ${zone.name} zone at frame ${frame} — Layer 2's diagram is meant to stay inside ZONES.stage and never drift into title/caption, per this codebase's own layout rule.`);
      }
    }
  }
  return issues;
}

// Only these tags are geometrically sensible as a "container" (something
// another element is meant to sit inside) — confirmed necessary against a
// real false positive: a <text> label's WIDTH ESTIMATE (no real font
// metrics available, see localBoxForElement) can exceed a small shape's
// actual area, so without this exclusion a text label kept getting picked
// as "the container" a nearby shape was supposedly escaping.
const CONTAINER_CANDIDATE_TAGS = new Set(["rect", "circle", "ellipse", "path", "polygon"]);

function checkContainment(elements, frame) {
  const issues = [];
  const byRole = new Map();
  for (const el of elements) {
    if (!byRole.has(el.role)) byRole.set(el.role, []);
    byRole.get(el.role).push(el);
  }
  for (const [role, group] of byRole) {
    if (group.length < 2) continue;
    // The largest CONTAINER-CANDIDATE-shaped element in the group — only
    // proceed if it's meaningfully bigger than the rest (a real container,
    // not just two same-sized siblings).
    const sorted = [...group]
      .filter((el) => CONTAINER_CANDIDATE_TAGS.has(el.tag))
      .sort((a, b) => boxArea(b.box) - boxArea(a.box));
    if (sorted.length < 1) continue;
    const container = sorted[0];
    if (container.isBackdropLike) continue; // a full-bleed background isn't a "box" in the sense meant here
    const containerArea = boxArea(container.box);
    if (containerArea <= 0) continue;

    for (const child of group.filter((el) => el !== container)) {
      const childArea = boxArea(child.box);
      if (childArea <= 0 || childArea > containerArea * 0.6) continue; // only check things clearly smaller — meant to sit INSIDE
      const overlap = boxOverlapArea(container.box, child.box);
      const outsideFraction = 1 - (childArea > 0 ? overlap / childArea : 0);
      if (outsideFraction > CONTAINMENT_SLACK_RATIO) {
        issues.push(`A <${child.tag}> element (in the same group as a larger <${container.tag}> container, role "${role}") extends outside that container at frame ${frame} instead of staying inside it — roughly ${Math.round(outsideFraction * 100)}% of it falls outside the container's bounds.`);
      }
    }
  }
  return issues;
}

// ── Public API ───────────────────────────────────────────────────────────
// Checks ONE scene (by name) within a header+chunk pair. Returns
// { ok: true } or { ok: false, message } — message is formatted with a
// "(line N)" suffix matching every other validator's convention in this
// codebase, using the scene's OWN declaration line (sceneStartLine, 1-based,
// within chunkCode) so it plugs directly into the EXISTING extractErrorLine
// / locateSceneAtLine patch-first ladder in generateSceneChunk with zero
// changes needed there — a geometry violation is just another content
// error from that machinery's point of view.
function checkSceneGeometry(headerCode, chunkCode, sceneName, sceneStartLine, durationInFrames) {
  try {
    const currentFrameRef = { value: 0 };
    const scope = compileForGeometryCheck(`${headerCode}\n\n${chunkCode}`, currentFrameRef);
    const sceneFn = scope[sceneName];
    if (typeof sceneFn !== "function") return { ok: true }; // couldn't resolve — don't block on our own limitation

    // Names declared in the HEADER specifically (not the scene) — anything
    // rendered by one of these gets exempted during the walk (see
    // walkTree's own comment on why: a header-caused violation can never
    // be fixed by patching or regenerating a scene, so flagging it just
    // burns the entire retry budget on something structurally unfixable).
    const headerNames = new Set();
    const headerDeclPattern = /^(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm;
    let hm;
    while ((hm = headerDeclPattern.exec(headerCode)) !== null) headerNames.add(hm[1]);

    // Deliberately avoids frame 0 and the very last frame — confirmed
    // against real generated code that sampling frame 0 produces false
    // positives: entrance animations (a spring scale-in from 0, a fade from
    // opacity 0, per the RICHNESS rule this codebase's own prompts require)
    // are SUPPOSED to start tiny/invisible/off-position — that's correct
    // behavior, not a bug, and flagging it defeats the whole point of
    // avoiding the old critic's over-flagging problem. Sampling the
    // "settled middle" of the duration (15%-85%) instead checks the scene
    // once its entrance/exit transitions aren't the dominant state.
    const total = Math.max(1, durationInFrames | 0);
    const sampleFrames = new Set();
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const t = 0.15 + (i / (SAMPLE_COUNT - 1)) * 0.7;
      sampleFrames.add(Math.min(total - 1, Math.round(t * (total - 1))));
    }

    const allIssues = [];
    for (const frame of sampleFrames) {
      currentFrameRef.value = frame;
      let tree;
      try {
        tree = sceneFn({});
      } catch (err) {
        continue; // a runtime exception here is a DIFFERENT bug class, already covered elsewhere — not this check's job
      }
      const elements = [];
      walkTree(tree, IDENTITY_MATRIX, "root", elements, 0, headerNames);
      allIssues.push(...runChecks(elements, frame));
      allIssues.push(...checkZoneIntrusion(elements, frame));
      // checkContainment is NOT wired in — kept defined, not deleted, for
      // the same reason as the "disconnect, don't remove" component-library
      // flag: tested against real generated scenes and caught producing
      // systematic false positives from TWO distinct causes (raw "root"-
      // role content mistaken for a container relationship it never had,
      // AND several independent SIBLING instances of the same repeated
      // component mistaken for one "container + nested children" just for
      // sharing a name) — it needs a real redesign (a genuine background-
      // vs-foreground signal, not just "biggest same-role element wins")
      // before it's trustworthy enough to act on, not just a bigger
      // tolerance number. Left off rather than shipped half-reliable, given
      // exactly how this user was burned by the old over-flagging critic.
      if (allIssues.length >= 3) break; // enough signal — stop sampling, keep the check cheap
    }

    if (allIssues.length === 0) return { ok: true };
    const message = `${allIssues.slice(0, 3).join(" ")} (line ${sceneStartLine})`;
    return { ok: false, message };
  } catch (err) {
    console.warn(`[geometryCheck] Internal error checking ${sceneName} (non-fatal, skipping check): ${err.message}`);
    return { ok: true };
  }
}

module.exports = { checkSceneGeometry };
