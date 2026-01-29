import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

export default function TopBar() {
  const nav = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState("");

  useEffect(() => {
    const sp = new URLSearchParams(loc.search);
    setQ(sp.get("q") || "");
  }, [loc.search]);

  const goSearch = () => {
    const s = q.trim();
    nav(s ? `/?q=${encodeURIComponent(s)}` : `/`);
  };

  const colors = {
    barBg: "#141414",
    barBorder: "#2b2b2b",
    text: "#eaeaea",
    muted: "#bdbdbd",
    inputBg: "#222222",
    inputBorder: "#3a3a3a",
    btnBg: "#2a2a2a",
    btnBorder: "#3a3a3a",
  };

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1000,
        background: colors.barBg,
        borderBottom: `1px solid ${colors.barBorder}`,
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "10px 16px",
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <Link
          to="/"
          style={{
            fontWeight: 800,
            textDecoration: "none",
            color: colors.text,
          }}
        >
          製作手冊
        </Link>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", gap: 8, alignItems: "center", width: "min(520px, 60vw)" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") goSearch();
            }}
            placeholder="中文名稱 / ID 搜尋"
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 10,
              border: `1px solid ${colors.inputBorder}`,
              background: colors.inputBg,
              color: colors.text,
              outline: "none",
            }}
          />
          <button
            onClick={goSearch}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: `1px solid ${colors.btnBorder}`,
              background: colors.btnBg,
              color: colors.text,
              cursor: "pointer",
            }}
          >
            搜尋
          </button>
        </div>
      </div>
    </div>
  );
}
