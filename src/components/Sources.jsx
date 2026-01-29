export default function Sources({ item }) {
  const sources = item?.sources || [];

  if (!sources.length) {
    return <p style={{ opacity: 0.7 }}>目前沒有取得方式資料</p>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {sources.map((s, idx) => {
        const t = s?.type || "unknown";

        // 1) 採集（做 1：只有 zone）
        if (t === "gathering") {
          const zone = s.zone || s.area || s.place || "";
          const pts = Array.isArray(s.points) ? s.points : [];
          return (
            <div
              key={idx}
              style={{
                border: "1px solid #333",
                borderRadius: 12,
                padding: 10,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>採集</div>

              {zone ? (
                <div style={{ opacity: 0.9, lineHeight: 1.6 }}>
                  <span style={{ opacity: 0.7 }}>區域：</span>
                  {zone}
                </div>
              ) : (
                <div style={{ opacity: 0.7 }}>（沒有區域資訊）</div>
              )}

              {s.note ? (
                <div style={{ opacity: 0.85, marginTop: 6 }}>{s.note}</div>
              ) : null}

              {pts.length ? (
                <div style={{ opacity: 0.7, marginTop: 6 }}>
                  點位：{pts.length}（之後接地圖時會用到）
                </div>
              ) : null}
            </div>
          );
        }

        // 2) vendor（你之後會做 NPC 販售，可以先顯示出來）
        if (t === "vendor") {
          return (
            <div
              key={idx}
              style={{
                border: "1px solid #333",
                borderRadius: 12,
                padding: 10,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>NPC 販售</div>
              <div style={{ opacity: 0.9, lineHeight: 1.6 }}>
                {s.npc ? <div>NPC：{s.npc}</div> : null}
                {s.zone ? <div>區域：{s.zone}</div> : null}
                {(s.x && s.y) ? <div>座標：{s.x}, {s.y}</div> : null}
                {s.price ? <div>價格：{s.price} {s.currency || "gil"}</div> : null}
                {s.note ? <div style={{ opacity: 0.85 }}>{s.note}</div> : null}
              </div>
            </div>
          );
        }

        // 3) 其他未知類型：直接 dump 一行讓你看得到資料
        return (
          <div
            key={idx}
            style={{
              border: "1px solid #333",
              borderRadius: 12,
              padding: 10,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              來源：{t}
            </div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", opacity: 0.85 }}>
              {JSON.stringify(s, null, 2)}
            </pre>
          </div>
        );
      })}
    </div>
  );
}
