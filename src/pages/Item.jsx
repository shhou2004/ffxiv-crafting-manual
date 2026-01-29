import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import RecipeTree from "../components/RecipeTree.jsx";
import Sources from "../components/Sources.jsx";
import { iconUrl } from "../lib/icon.js";
import RecipeCost from "../components/RecipeCost.jsx";
import MaterialTracker from "../components/MaterialTracker.jsx";

const UNIVERSALIS_DC_TW = "陸行鳥"; // 只用繁中服（Universalis DC 名稱）

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatGil(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("en-US");
}

function pickBestListing(listings) {
  if (!Array.isArray(listings) || !listings.length) return null;
  let best = null;
  for (const l of listings) {
    const p = safeNum(l?.pricePerUnit);
    if (p == null) continue;
    if (!best || p < best.pricePerUnit) {
      best = { pricePerUnit: p, worldName: l?.worldName || "" };
    }
  }
  return best;
}

async function fetchUniversalisMin({ dc, itemIds }) {
  const ids = itemIds.join(",");
  const url = `https://universalis.app/api/v2/${encodeURIComponent(
    dc
  )}/${ids}?listings=1&fields=items.listings.pricePerUnit,items.listings.worldName`;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Universalis HTTP ${r.status}`);
  const j = await r.json();

  const out = new Map();
  const items = j?.items || {};
  for (const [idStr, v] of Object.entries(items)) {
    const best = pickBestListing(v?.listings || []);
    if (best) out.set(Number(idStr), best);
  }
  return out;
}

function huijiItemUrl(name) {
  // 正確格式：/wiki/物品:草帽
  return `https://ff14.huijiwiki.com/wiki/物品:${encodeURIComponent(String(name || ""))}`;
}

export default function Item() {
  const { itemId } = useParams();
  const idNum = Number(itemId);

  const [manual, setManual] = useState(null);
  const [index, setIndex] = useState(null);
  const [indexCn, setIndexCn] = useState(null);
  const [recipeIndex, setRecipeIndex] = useState(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/item_index_cn.json`)
      .then(r => r.json())
      .then(setIndexCn)
      .catch(() => setIndexCn({ items: [] }));
  }, []);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/manual.json`)
      .then((r) => r.json())
      .then(setManual)
      .catch(() => setManual({ items: {} }));
  }, []);

  // ✅ 先讀繁體索引 item_index_tw.json，失敗才退回 item_index_zh.json
  useEffect(() => {
    let alive = true;
    (async () => {
      const base = `${import.meta.env.BASE_URL}data/`;
      try {
        const r = await fetch(`${base}item_index_zh.json`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (alive) setIndex(j);
      } catch {
        fetch(`${base}item_index_cn.json`)
          .then((r) => r.json())
          .then((j) => alive && setIndex(j))
          .catch(() => alive && setIndex({ items: [] }));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/recipe_index.json`)
      .then((r) => r.json())
      .then(setRecipeIndex)
      .catch(() => setRecipeIndex({ byResult: {} }));
  }, []);

  
  const metaMapCn = useMemo(() => {
    const m = new Map();
    // item_index_cn.json 結構是 { itemsCn: [ [id, name, iconId], ... ] }
    for (const row of indexCn?.itemsCn || []) {
      const id = Number(row?.[0]);
      const rawName = row?.[1];
      const name = String(rawName || "").replace(/^"+|"+$/g, ""); // 去掉外層多餘引號
      if (Number.isFinite(id)) m.set(id, name);
    }
    return m;
  }, [indexCn]);


  const metaMap = useMemo(() => {
    const m = new Map();
    for (const [id, name, iconId] of index?.items || []) {
      m.set(Number(id), { id: Number(id), name, iconId: Number(iconId || 0) });
    }
    return m;
  }, [index]);

  const zhName = useMemo(() => metaMap.get(idNum)?.name || null, [metaMap, idNum]);
  
  if (!manual || !index|| !indexCn  || !recipeIndex) return <p>Loading…</p>;

  const manualItem = manual?.items?.[itemId] || null;

  // manual 沒收錄時，用 recipe_index 補「目前物品」那一層 recipes（用於成本估算顯示）
  const v = recipeIndex?.byResult?.[idNum] || null;
  let ingPairs = null;

  // v 可能是：
  // 1) [[ingId, qty], ...]
  // 2) [ [[ingId, qty], ...], [另一配方...] ]
  if (Array.isArray(v) && v.length) {
    if (Array.isArray(v[0]) && v[0].length && Array.isArray(v[0][0])) {
      ingPairs = v[0];
    } else if (Array.isArray(v[0]) && !Array.isArray(v[0][0])) {
      ingPairs = v;
    }
  }

  const recipes = ingPairs
    ? [
        {
          recipeId: 0,
          resultId: idNum,
          ingredients: ingPairs.map(([itemId, amount]) => ({
            itemId,
            amount,
          })),
        },
      ]
    : [];

  const fallback = {
    id: idNum,
    // ✅ 名稱以索引(繁體)優先
    name: zhName || manualItem?.name || `Item#${itemId}`,
    desc: manualItem?.desc || "",
    iconId: manualItem?.iconId || metaMap.get(idNum)?.iconId || 0,
    recipes: manualItem?.recipes?.length ? manualItem.recipes : recipes,
    sources: manualItem?.sources || [],
  };

  const title = fallback.name;
  const titleCn = (metaMapCn.get(idNum) || manualItem?.name || "").trim();
  const pageHuijiUrl = huijiItemUrl(titleCn);

  return (
    <div>
      {/* ✅ 標題：圖片 + 名稱 + id + HuijiWiki 連結 */}
      <h2 style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {fallback.iconId ? (
          <img
            src={iconUrl(fallback.iconId)}
            alt=""
            width={28}
            height={28}
            style={{ borderRadius: 6, background: "#111", border: "1px solid #333" }}
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        ) : null}

        <span>{title}</span>
        <span style={{ opacity: 0.6, fontSize: 14 }}>#{itemId}</span>

        <a
          href={pageHuijiUrl}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 14, opacity: 0.75, textDecoration: "underline" }}
          title="FF14 灰機 Wiki（物品頁）"
        >
          HuijiWiki
        </a>
      </h2>

      {fallback.desc ? <p style={{ opacity: 0.85 }}>{fallback.desc}</p> : null}

      {/* 垂直排版：配方樹 → 成本估算 → 材料計算 */}
      <section
        style={{
          padding: 12,
          border: "1px solid #333",
          borderRadius: 12,
          marginBottom: 16,
        }}
      >
        <h3 style={{ marginTop: 0 }}>配方樹</h3>
        {fallback.recipes?.length ? (
          <RecipeTree rootId={idNum} recipeByResult={recipeIndex?.byResult || {}} metaMap={metaMap} />
        ) : (
          <p style={{ opacity: 0.7 }}>
            目前找不到此物品的配方（Recipe.csv 可能沒有收錄 / 或此物品不是可製作物）
          </p>
        )}
      </section>

      {fallback.recipes?.length ? (
        <section
          style={{
            padding: 12,
            border: "1px solid #333",
            borderRadius: 12,
            marginBottom: 16,
          }}
        >
          <RecipeCost rootId={idNum} recipeByResult={recipeIndex?.byResult || {}} metaMap={metaMap} />
        </section>
      ) : null}

      <section style={{ padding: 12, border: "1px solid #333", borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>材料計算</h3>
        <MaterialTracker
            rootId={idNum}
            recipeByResult={recipeIndex?.byResult || {}}
            metaMap={metaMap}
            metaMapCn={metaMapCn}
            dc={UNIVERSALIS_DC_TW}
          />
      </section>
    </div>
  );
}
