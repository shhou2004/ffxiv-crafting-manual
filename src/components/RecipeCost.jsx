import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { iconUrl } from "../lib/icon.js";

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

// Huiji wiki 連結：/wiki/物品:<物品名>
function huijiItemUrl(name) {
  const n = String(name || "").trim();
  if (!n) return null;
  return `https://ff14.huijiwiki.com/wiki/物品:${encodeURIComponent(n)}`;
}

/**
 * RecipeCost
 * - 會自動比較「買成品」 vs 「買材料自己做」
 * - 若子項目買成品更便宜，就不再展開子項目的材料（修正你圖中的古巨蜥革案例）
 *
 * props:
 * - rootId: number
 * - recipeByResult: recipe_index.json 的 byResult
 * - metaMap: Map<id, {id, name, iconId}>
 * - metaMapCn?: Map<id, string>  (可選：簡中名，用於 HuijiWiki 更穩；沒傳就用繁中名)
 */
function RecipeCost({ rootId, recipeByResult, metaMap, metaMapCn }) {
  const [priceMap, setPriceMap] = useState(new Map());
  const [err, setErr] = useState("");

  // 統一配方形狀
  const getIngPairs = (id) => {
    const k = Number(id);
    const v = recipeByResult?.[k] ?? recipeByResult?.[String(k)];
    if (!v) return [];

    // 多配方 nested：取第一個配方
    if (
      Array.isArray(v) &&
      v.length &&
      Array.isArray(v[0]) &&
      v[0].length &&
      Array.isArray(v[0][0])
    ) {
      return v[0]
        .map((p) => [Number(p?.[0]), Number(p?.[1] ?? 1)])
        .filter(
          ([iid, amt]) =>
            Number.isFinite(iid) &&
            iid > 0 &&
            Number.isFinite(amt) &&
            amt > 0
        );
    }

    // 單一配方 flat
    if (Array.isArray(v) && v.length && Array.isArray(v[0])) {
      return v
        .map((p) => [Number(p?.[0]), Number(p?.[1] ?? 1)])
        .filter(
          ([iid, amt]) =>
            Number.isFinite(iid) &&
            iid > 0 &&
            Number.isFinite(amt) &&
            amt > 0
        );
    }

    return [];
  };

  // 需要查價的物品集合：root + 所有遞迴材料
  const closure = useMemo(() => {
    const out = [];
    const stack = [Number(rootId)];
    const seen = new Set();

    while (stack.length) {
      const id = Number(stack.pop());
      if (!Number.isFinite(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);

      const pairs = getIngPairs(id);
      for (const [ingId] of pairs) {
        const x = Number(ingId);
        if (Number.isFinite(x) && x > 0) stack.push(x);
      }
    }
    return out;
  }, [rootId, recipeByResult]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr("");
        if (!closure.length) return;
        const m = await fetchUniversalisMin({
          dc: UNIVERSALIS_DC_TW,
          itemIds: closure,
        });
        if (!alive) return;
        setPriceMap(m);
      } catch (e) {
        if (!alive) return;
        setErr(String(e?.message || e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [closure]);

  const computed = useMemo(() => {
    // memoChoice: id -> { mode: "buy"|"craft"|"none", unitCost, buyPrice, world }
    const memoChoice = new Map();

    const getBuy = (id) => {
      const v = priceMap.get(Number(id));
      return v?.pricePerUnit != null ? Number(v.pricePerUnit) : Infinity;
    };

    const choose = (id) => {
      id = Number(id);
      if (!Number.isFinite(id)) return { mode: "none", unitCost: Infinity };

      if (memoChoice.has(id)) return memoChoice.get(id);

      const buy = getBuy(id);
      const world = priceMap.get(id)?.worldName || "";
      const pairs = getIngPairs(id);

      // 不能製作（沒配方）=> 只能買（就算沒價也先當作需要買）
      if (!pairs.length) {
        const out = {
          mode: "buy",
          unitCost: buy,
          buyPrice: Number.isFinite(buy) ? buy : null,
          world,
        };
        memoChoice.set(id, out);
        return out;
      }

      // 可製作：算材料成本
      let craft = 0;
      for (const [ingId, amt] of pairs) {
        const c = choose(ingId).unitCost;
        craft += c * Number(amt);
      }

      // 選擇規則：
      // - 有市價且買 <= 做 => 買
      // - 否則能算出做 => 做
      // - 兩者都無法（Infinity）=> 仍展開做（讓你看到需要哪些材料）
      let mode = "craft";
      let unitCost = craft;

      if (Number.isFinite(buy) && (buy <= craft || !Number.isFinite(craft))) {
        mode = "buy";
        unitCost = buy;
      } else if (!Number.isFinite(craft) && !Number.isFinite(buy)) {
        mode = "craft";
        unitCost = Infinity;
      }

      const out = {
        mode,
        unitCost,
        buyPrice: Number.isFinite(buy) ? buy : null,
        world,
      };
      memoChoice.set(id, out);
      return out;
    };

    // 用選擇結果產生「需要買的材料」清單
    const buildBuyList = (id, mult, out) => {
      id = Number(id);
      if (!Number.isFinite(id)) return;

      const ch = choose(id);

      if (ch.mode === "buy") {
        out.set(id, (out.get(id) || 0) + mult);
        return;
      }

      if (ch.mode !== "craft") return;

      const pairs = getIngPairs(id);
      if (!pairs.length) {
        // 理論上不會走到（上面已 buy），但保底
        out.set(id, (out.get(id) || 0) + mult);
        return;
      }

      for (const [ingId, amt] of pairs) {
        buildBuyList(ingId, mult * Number(amt), out);
      }
    };

    const rootBuy = getBuy(rootId);
    const rootWorld = priceMap.get(Number(rootId))?.worldName || "";

    // === 根物品：只算「做」的材料成本，不把「買成品」當成最低成本 ===
    const rootPairs = getIngPairs(rootId);
    let craftOnlyCost = Infinity;
    if (rootPairs.length) {
      craftOnlyCost = 0;
      for (const [ingId, amt] of rootPairs) {
        craftOnlyCost += choose(ingId).unitCost * Number(amt);
      }
    }

    // 需要買的材料：從根配方的材料開始展開（避免把 root 本身列進清單）
    const buyMap = new Map();
    if (rootPairs.length) {
      for (const [ingId, amt] of rootPairs) {
        buildBuyList(ingId, Number(amt), buyMap);
      }
    }

    const buyRows = [];
    for (const [id, qty] of buyMap.entries()) {
      const meta = metaMap.get(Number(id));
      const name = meta?.name || `Item#${id}`;
      const bestListing = priceMap.get(Number(id));
      buyRows.push({
        id: Number(id),
        name,
        qty,
        unitPrice: bestListing?.pricePerUnit ?? Infinity,
        world: bestListing?.worldName || "",
      });
    }
    buyRows.sort((a, b) => a.unitPrice * a.qty - b.unitPrice * b.qty);

    return {
      rootMarket: rootBuy,
      rootWorld,
      craftOnlyCost,
      buyRows,
    };
  }, [rootId, recipeByResult, priceMap, metaMap]);

  const rootMeta = metaMap.get(Number(rootId));
  const rootName = rootMeta?.name || `Item#${rootId}`;

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
        成本估算（{UNIVERSALIS_DC_TW}-繁中服）
      </div>

      <div style={{ opacity: 0.9, lineHeight: 1.7 }}>
        <div>
          最低市價：
          {Number.isFinite(computed.rootMarket)
            ? ` ${formatGil(computed.rootMarket)} gil`
            : " —"}{" "}
          {computed.rootWorld ? (
            <span style={{ opacity: 0.7 }}>（{computed.rootWorld}）</span>
          ) : null}
        </div>

        <div>
          材料成本（只算製作材料，不直接買成品）：
          {Number.isFinite(computed.craftOnlyCost)
            ? ` ${formatGil(computed.craftOnlyCost)} gil`
            : " —"}
          {!Number.isFinite(computed.craftOnlyCost) ? (
            <span style={{ opacity: 0.7 }}>（此物品沒有配方或缺少價格）</span>
          ) : null}
        </div>

        <div style={{ opacity: 0.7 }}>
          資料來源：Universalis（資料中心：{UNIVERSALIS_DC_TW}）
        </div>
        <div style={{ opacity: 0.7 }}>
          物品：{rootName} <span style={{ opacity: 0.6 }}>#{rootId}</span>
        </div>
      </div>

      {err ? (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            border: "1px solid #522",
            borderRadius: 12,
          }}
        >
          <div style={{ color: "#f88", fontWeight: 700 }}>
            RecipeCost 查價失敗
          </div>
          <div style={{ opacity: 0.8, marginTop: 4 }}>{err}</div>
        </div>
      ) : null}

      <div
        style={{
          borderTop: "1px solid #333",
          paddingTop: 10,
          marginTop: 10,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          需要買的材料（會自動避開「買子項目比展開材料更貴」）
        </div>

        {computed.buyRows.length ? (
          <div style={{ display: "grid", gap: 6 }}>
            {computed.buyRows.slice(0, 60).map((r) => {
              const meta = metaMap.get(Number(r.id));
              const iconId = meta?.iconId || 0;

              // 點擊進物品頁（跟 RecipeTree 一樣走 Router）
              const itemTo = `/item/${r.id}`;

              // Huiji：優先用簡體名；沒有就用繁體名（仍然可用）
              const cnName = (metaMapCn?.get(r.id) || r.name || "").trim();
              const wikiHref = huijiItemUrl(cnName);

              return (
                <div
                  key={r.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    gap: 8,
                    alignItems: "baseline",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      overflow: "hidden",
                    }}
                  >
                    <img
                      src={iconUrl(iconId)}
                      alt=""
                      width={24}
                      height={24}
                      style={{ borderRadius: 6, flex: "0 0 auto" }}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />

                    <div
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        minWidth: 0,
                      }}
                    >
                      <Link
                        to={itemTo}
                        style={{
                          color: "inherit",
                          textDecoration: "underline",
                          textUnderlineOffset: 2,
                        }}
                      >
                        {r.name}
                      </Link>{" "}
                      <span style={{ opacity: 0.6 }}>#{r.id}</span>

                      {wikiHref ? (
                        <>
                          <span style={{ opacity: 0.35, margin: "0 6px" }}>
                            ·
                          </span>
                          <a
                            href={wikiHref}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              opacity: 0.75,
                              textDecoration: "underline",
                            }}
                            title="HuijiWiki 物品頁"
                          >
                            HuijiWiki
                          </a>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ opacity: 0.85 }}>× {formatGil(r.qty)}</div>

                  <div style={{ opacity: 0.85 }}>
                    {Number.isFinite(r.unitPrice)
                      ? `${formatGil(r.unitPrice)} gil`
                      : "—"}
                    {r.world ? (
                      <span style={{ opacity: 0.7 }}>（{r.world}）</span>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {computed.buyRows.length > 60 ? (
              <div style={{ opacity: 0.7 }}>（材料太多，只顯示前 60 筆）</div>
            ) : null}
          </div>
        ) : (
          <div style={{ opacity: 0.7 }}>
            （沒有需要購買的材料，或尚未取得市場價格）
          </div>
        )}
      </div>
    </div>
  );
}

export default RecipeCost;
