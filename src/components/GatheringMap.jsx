export default function GatheringMap({ points = [] }) {
  // 這是「簡易地圖」：假設座標落在 0~100（FFXIV 常見顯示座標就是這範圍）
  // 先不要依賴 Map 圖檔，至少能把「點在哪」視覺化。
  const W = 360;
  const H = 240;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: W,
        aspectRatio: `${W}/${H}`,
        borderRadius: 12,
        border: "1px solid #333",
        background: "#0b0b0b",
        position: "relative",
        overflow: "hidden"
      }}
    >
      {/* 格線 */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.25 }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={`v-${i}`}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${(i + 1) * 10}%`,
              width: 1,
              background: "#666"
            }}
          />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={`h-${i}`}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${(i + 1) * 20}%`,
              height: 1,
              background: "#666"
            }}
          />
        ))}
      </div>

      {/* 點 */}
      {points.slice(0, 50).map((p, idx) => {
        const x = Math.max(0, Math.min(100, Number(p.x)));
        const y = Math.max(0, Math.min(100, Number(p.y)));

        return (
          <div
            key={idx}
            title={`(${x.toFixed(1)}, ${y.toFixed(1)})`}
            style={{
              position: "absolute",
              left: `calc(${x}% - 6px)`,
              top: `calc(${y}% - 6px)`,
              width: 12,
              height: 12,
              borderRadius: 999,
              background: "#fff",
              boxShadow: "0 0 10px rgba(255,255,255,0.35)"
            }}
          />
        );
      })}

      <div style={{ position: "absolute", left: 10, bottom: 8, fontSize: 12, opacity: 0.7 }}>
        簡易地圖（0~100 座標）
      </div>
    </div>
  );
}
