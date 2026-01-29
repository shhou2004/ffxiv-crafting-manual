import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { iconUrl } from "../lib/icon.js";

export default function Home() {
  const nav = useNavigate();
  const loc = useLocation();
  const [index, setIndex] = useState(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/item_index_zh.json`)
      .then((r) => r.json())
      .then(setIndex)
      .catch(() => setIndex({ items: [] }));
  }, []);

  const q = useMemo(() => {
    const sp = new URLSearchParams(loc.search);
    return (sp.get("q") || "").trim();
  }, [loc.search]);

  const list = useMemo(() => {
    const items = index?.items || [];
    if (!q) return items.slice(0, 100);

    if (/^\d+$/.test(q)) {
      return items.filter(([id]) => String(id).includes(q)).slice(0, 200);
    }
    return items.filter(([, name]) => (name || "").includes(q)).slice(0, 200);
  }, [index, q]);

  return (
    <div>
      {q ? (
        <p style={{ opacity: 0.7, marginTop: 0 }}>
          搜尋：<b>{q}</b>（顯示 {list.length} 筆）
        </p>
      ) : (
        <p style={{ opacity: 0.7, marginTop: 0 }}>
          請在上方搜尋框輸入中文名稱或 ID
        </p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {list.map(([id, name, iconId]) => (
          <button
            key={id}
            onClick={() => nav(`/item/${id}`)}
            style={{
              textAlign: "left",
              padding: 12,
              borderRadius: 14,
              border: "1px solid #2b2b2b",
              background: "#1b1b1b",
              color: "#eaeaea",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {iconId ? (
                <img
                  src={iconUrl(iconId)}
                  alt=""
                  width={32}
                  height={32}
                  style={{ borderRadius: 8, flex: "0 0 auto" }}
                  loading="lazy"
                />
              ) : (
                <div style={{ width: 32, height: 32, flex: "0 0 auto" }} />
              )}

              <div style={{ minWidth: 0 }}>
                <b>{name}</b> <span style={{ opacity: 0.6 }}>#{id}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
