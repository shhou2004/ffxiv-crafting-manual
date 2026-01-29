import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { iconUrl } from "../lib/icon.js";

/**
 * RecipeTree
 * props:
 * - rootId: number
 * - recipeByResult: object  (from recipe_index.json -> byResult)
 * - metaMap: Map<number, {id,name,iconId}>
 */
export default function RecipeTree({ rootId, recipeByResult, metaMap }) {
  // --- Universalis 設定（可在 UI 改） ---
  const [dc, setDc] = useState(() => localStorage.getItem("uni_dc") || "陸行鳥-繁中服");

  // itemId -> { price, worldName, updatedAt }
  const [priceMap, setPriceMap] = useState(() => new Map());
  const [priceErr, setPriceErr] = useState("");

  // 允許你常用的 DC 快選（想加自己加）
  const dcOptions = [
    "陸行鳥-繁中服",
  ];

  // --- 取得某個 resultId 的「材料 pairs」 ---
  function getIngPairs(resultId) {
    const v = recipeByResult?.[resultId];
    if (!v) return null;

    // 常見：byResult[id] = [[itemId, amount], ...]
    if (Array.isArray(v) && v.length && Array.isArray(v[0]) && v[0].length >= 2 && typeof v[0][0] === "number") {
      return v;
    }

    // 兼容：byResult[id] = [ [[itemId, amount], ...], ... ]（多配方時取第一套）
    if (Array.isArray(v) && v.length && Array.isArray(v[0]) && Array.isArray(v[0][0])) {
      return v[0];
    }

    return null;
  }

  // --- 收集整棵樹所有 itemId（用來批次查價） ---
  const allTreeIds = useMemo(() => {
    const out = new Set();
    const visiting = new Set();

    function dfs(id) {
      if (!Number.isFinite(id)) return;
      if (visiting.has(id)) return; // cycle guard
      visiting.add(id);

      out.add(id);
      const pairs = getIngPairs(id);
      if (pairs) {
        for (const [ingId] of pairs) {
          out.add(ingId);
          dfs(ingId);
        }
      }

      visiting.delete(id);
    }

    dfs(rootId);
    return [...out];
  }, [rootId, recipeByResult]);

  // --- 批次查 Universalis 最低價（pricePerUnit 最低的 listing） ---
  useEffect(() => {
    let cancelled = false;
    setPriceErr("");

    // 只查還沒查過的
    const need = allTreeIds.filter((id) => !priceMap.has(id));
    if (!need.length) return;

    async function run() {
      try {
        // Universalis 一次吃很多 id（保守分批）
        const chunkSize = 80;
        const next = new Map(priceMap);

        for (let i = 0; i < need.length; i += chunkSize) {
          const chunk = need.slice(i, i + chunkSize);
          const url =
            `https://universalis.app/api/v2/${encodeURIComponent(dc)}/${chunk.join(",")}` +
            `?listings=20&entries=0`; // 取少量 listings 自己找最低

          const r = await fetch(url);
          if (!r.ok) throw new Error(`Universalis HTTP ${r.status}`);
          const j = await r.json();

          // 回傳可能是：
          // A) 單 item：{ itemID, listings:[...] ... }
          // B) 多 item：{ items: { "<id>": { listings:[...] ... }, ... } }
          const itemsObj = j?.items || null;

          if (itemsObj) {
            for (const k of Object.keys(itemsObj)) {
              const itemId = Number(k);
              const data = itemsObj[k];
              const best = pickBestListing(data);
              if (best) {
                next.set(itemId, { ...best, updatedAt: Date.now() });
              } else {
                // 沒資料也記一筆，避免一直打 API
                next.set(itemId, { price: null, worldName: null, updatedAt: Date.now() });
              }
            }
          } else {
            // 單 item 格式
            const itemId = Number(j?.itemID ?? j?.itemId ?? j?.itemID ?? chunk[0]);
            const best = pickBestListing(j);
            if (best) {
              next.set(itemId, { ...best, updatedAt: Date.now() });
            } else {
              next.set(itemId, { price: null, worldName: null, updatedAt: Date.now() });
            }
          }
        }

        if (!cancelled) setPriceMap(next);
      } catch (e) {
        if (!cancelled) setPriceErr(String(e?.message || e));
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dc, allTreeIds]);

  function pickBestListing(data) {
    const listings = Array.isArray(data?.listings) ? data.listings : [];
    if (!listings.length) return null;

    let best = null;
    for (const l of listings) {
      const p = Number(l?.pricePerUnit ?? l?.pricePerUnitNQ ?? l?.pricePerUnitHQ);
      if (!Number.isFinite(p)) continue;
      if (!best || p < best.price) {
        best = { price: p, worldName: l?.worldName || l?.world || null };
      }
    }
    return best;
  }

  function fmtGil(n) {
    if (!Number.isFinite(n)) return "";
    return n.toLocaleString("en-US");
  }

  function getMeta(id) {
    return metaMap.get(Number(id)) || { id: Number(id), name: `Item#${id}`, iconId: 0 };
  }

  // --- 渲染：整棵樹直接展到底（不需要點展開） ---
  function Node({ id, amount, depth }) {
    const meta = getMeta(id);
    const pairs = getIngPairs(id);

    const p = priceMap.get(id);
    const priceLine =
      p && p.price != null
        ? `最低：${fmtGil(p.price)} gil（${p.worldName || "未知伺服器"}）`
        : p
          ? "最低：查無資料"
          : "最低：查詢中…";

    return (
      <div style={{ marginLeft: depth ? 14 : 0, paddingLeft: depth ? 10 : 0, borderLeft: depth ? "1px solid #333" : "none" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0" }}>
          <img
            src={iconUrl(meta.iconId)}
            alt=""
            width={26}
            height={26}
            style={{ borderRadius: 6, background: "#111", border: "1px solid #333" }}
            onError={(e) => (e.currentTarget.style.display = "none")}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <Link to={`/item/${id}`} style={{ color: "inherit", textDecoration: "none", fontWeight: 700 }}>
                {meta.name}
              </Link>
              <span style={{ opacity: 0.6, fontSize: 12 }}>#{id}</span>
              {amount ? <span style={{ opacity: 0.85, fontSize: 12 }}>× {amount}</span> : null}
            </div>

            <div style={{ opacity: 0.8, fontSize: 12, marginTop: 2 }}>
              Universalis：{priceLine}
            </div>
          </div>
        </div>

        {pairs ? (
          <div style={{ marginTop: 2, marginBottom: 6 }}>
            {pairs.map(([ingId, ingAmt], idx) => (
              <Node key={`${id}-${ingId}-${idx}`} id={Number(ingId)} amount={Number(ingAmt || 0)} depth={depth + 1} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ opacity: 0.75, fontSize: 12 }}>Universalis 資料中心：</div>
        <select
          value={dc}
          onChange={(e) => {
            const v = e.target.value;
            setDc(v);
            localStorage.setItem("uni_dc", v);
            // 換 DC 時，價錢重新查
            setPriceMap(new Map());
          }}
          style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #333", background: "transparent", color: "inherit" }}
        >
          {dcOptions.map((x) => (
            <option key={x} value={x} style={{ color: "#000" }}>
              {x}
            </option>
          ))}
        </select>

        {priceErr ? <div style={{ color: "#ff8080", fontSize: 12 }}>查價失敗：{priceErr}</div> : null}
      </div>

      <Node id={Number(rootId)} amount={0} depth={0} />
    </div>
  );
}
