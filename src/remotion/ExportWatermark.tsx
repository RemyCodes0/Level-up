// Client-side counterpart to the server's baked-in watermark
// (server/services/renderService.js's `Watermark`/`WrappedLesson`) — same
// visual, ported to real JSX since this runs in the browser, not a
// string-templated Remotion entry file. Only applied to the client-side
// (WebCodecs) export path — the in-app DynamicPlayer preview never renders
// this, matching the server path's own "only in the downloaded file" rule.
function ExportWatermark() {
  return (
    <div
      style={{
        position: "absolute",
        top: 28,
        left: 28,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 18px 8px 8px",
        borderRadius: 999,
        backgroundColor: "rgba(15,15,20,0.55)",
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #2563eb, #9333ea)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: "0 2px 10px rgba(37,99,235,0.6)",
        }}
      >
        <span
          style={{
            color: "#fff",
            fontWeight: 800,
            fontSize: 19,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          L
        </span>
      </div>
      <span
        style={{
          color: "#fff",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          fontSize: 25,
          fontWeight: 700,
          letterSpacing: 0.3,
          textShadow: "0 1px 3px rgba(0,0,0,0.4)",
        }}
      >
        leveluppedu.app
      </span>
    </div>
  );
}

// Wraps a compiled lesson component so the watermark renders on top of it,
// baked into every exported frame — same composition-time technique the
// server path uses (`WrappedLesson` in renderService.js), just as JSX
// instead of React.createElement since this runs client-side.
export function withWatermark(Component: React.ComponentType): React.ComponentType {
  return function WatermarkedLesson() {
    return (
      <>
        <Component />
        <ExportWatermark />
      </>
    );
  };
}
