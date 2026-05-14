export const OG_IMAGE_SIZE = {
  width: 1200,
  height: 630,
};

type ShowcaseOgImageProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  stats?: string[];
};

const swatches = ["#8bd3dd", "#f6c85f", "#ef6f6c", "#7fc97f", "#beaed4", "#fdc086"];

function PreviewMosaic() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        width: 406,
        transform: "rotate(-4deg)",
      }}
    >
      {swatches.map((color, index) => (
        <div
          key={color}
          style={{
            width: index % 3 === 0 ? 178 : 96,
            height: index % 2 === 0 ? 128 : 96,
            borderRadius: 24,
            background: `linear-gradient(135deg, ${color}, #111827)`,
            boxShadow: "0 24px 60px rgba(15, 23, 42, 0.24)",
            border: "2px solid rgba(255, 255, 255, 0.5)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "flex-start",
            padding: 14,
            color: "white",
            fontSize: 24,
            fontWeight: 900,
          }}
        >
          {["3D", "2D", "SFX", "Music", "GLB", "CC0"][index]}
        </div>
      ))}
    </div>
  );
}

export function ShowcaseOgImage({ eyebrow, title, subtitle, stats = [] }: ShowcaseOgImageProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: 54,
        gap: 44,
        alignItems: "center",
        justifyContent: "space-between",
        background: "linear-gradient(135deg, #f8fafc 0%, #dff6ff 45%, #a7f3d0 100%)",
        color: "#0f172a",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: 660 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 42 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: "#0f172a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#7dd3fc",
              fontSize: 28,
              fontWeight: 900,
            }}
          >
            GD
          </div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>GameDev Asset Library</div>
        </div>
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            padding: "8px 14px",
            borderRadius: 999,
            background: "rgba(15, 23, 42, 0.08)",
            color: "#0f766e",
            fontSize: 22,
            fontWeight: 900,
            marginBottom: 20,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            fontSize: title.length > 42 ? 54 : 64,
            lineHeight: 1,
            fontWeight: 950,
            letterSpacing: 0,
            marginBottom: 24,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 29, lineHeight: 1.25, color: "#334155", maxWidth: 620 }}>
          {subtitle}
        </div>
        {stats.length > 0 && (
          <div style={{ display: "flex", gap: 12, marginTop: 42, flexWrap: "wrap" }}>
            {stats.slice(0, 4).map((stat) => (
              <div
                key={stat}
                style={{
                  padding: "10px 16px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.72)",
                  color: "#0f172a",
                  fontSize: 21,
                  fontWeight: 800,
                  border: "1px solid rgba(15,23,42,0.08)",
                }}
              >
                {stat}
              </div>
            ))}
          </div>
        )}
      </div>
      <PreviewMosaic />
    </div>
  );
}
