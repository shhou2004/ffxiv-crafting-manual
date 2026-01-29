import { useEffect, useMemo, useState } from "react";
import { iconUrl } from "../lib/icon.js";

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
  if (!itemIds?.length) return new Map();

  // 避免 URL 太長 / 一次查太多造成錯誤：分批查價
  const uniq = Array.from(
    new Set(itemIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0))
  );
  const CHUNK = 80;

  const out = new Map();
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const chunk = uniq.slice(i, i + CHUNK);
    const ids = chunk.join(",");
    const url = `https://universalis.app/api/v2/${encodeURIComponent(
      dc
    )}/${ids}?listings=1&fields=items.listings.pricePerUnit,items.listings.worldName`;

    const r = await fetch(url);
    if (!r.ok) throw new Error(`Universalis HTTP ${r.status}`);
    const j = await r.json();

    const items = j?.items || {};
    for (const [idStr, v] of Object.entries(items)) {
      const best = pickBestListing(v?.listings || []);
      if (best) out.set(Number(idStr), best);
    }
  }
  return out;
}

function huijiItemUrl(cnName) {
  const n = String(cnName || "").trim();
  if (!n) return null;
  return `https://ff14.huijiwiki.com/wiki/物品:${encodeURIComponent(n)}`;
}

// 統一 recipe_index 的形狀
function getIngPairs(recipeByResult, id) {
  const v = recipeByResult?.[Number(id)];
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
      .filter(([iid, amt]) => Number.isFinite(iid) && iid > 0 && Number.isFinite(amt) && amt > 0);
  }

  // 單一配方 flat
  if (Array.isArray(v) && v.length && Array.isArray(v[0])) {
    return v
      .map((p) => [Number(p?.[0]), Number(p?.[1] ?? 1)])
      .filter(([iid, amt]) => Number.isFinite(iid) && iid > 0 && Number.isFinite(amt) && amt > 0);
  }

  return [];
}

// ✅ 展開「整棵樹」統計（用於材料輸入清單，不影響你原本顯示）
function buildTotalNeeds(recipeByResult, rootId) {
  const out = new Map();
  const stack = [[Number(rootId), 1]];
  const visitCount = new Map();

  while (stack.length) {
    const [id, mult] = stack.pop();
    const itemId = Number(id);
    const m = Number(mult);
    if (!Number.isFinite(itemId) || !Number.isFinite(m) || m <= 0) continue;

    const c = (visitCount.get(itemId) || 0) + 1;
    visitCount.set(itemId, c);
    if (c > 2000) continue;

    const pairs = getIngPairs(recipeByResult, itemId);
    if (!pairs.length) continue;

    for (const [ingId, amt] of pairs) {
      const iid = Number(ingId);
      const a = Number(amt);
      if (!Number.isFinite(iid) || !Number.isFinite(a) || a <= 0) continue;

      const q = m * a;
      out.set(iid, (out.get(iid) || 0) + q);
      stack.push([iid, q]);
    }
  }
  return out;
}

/**
 * ✅ 「還需要」：owned-aware + 允許「部分做、部分買」
 * 核心差異：
 * - 不是 (買整批 vs 做整批) 二選一
 * - 而是「每 1 個」都：先扣 owned → 再比價 (買 1 個 vs 做 1 個) → 選便宜
 * - rootId 永遠視為要做（不允許買 root 直接結束）
 * - rootId 永遠不會出現在要買清單
 */
function buildRemainingCheapestNeedsOwnedAware(recipeByResult, rootId, owned, priceMap) {
  const getBuy = (id) => {
    const best = priceMap?.get?.(Number(id));
    const p = safeNum(best?.pricePerUnit);
    return p == null ? Infinity : p;
  };

  // owned 轉 Map
  const ownedLeft = new Map();
  for (const [k, v] of Object.entries(owned || {})) {
    const id = Number(k);
    const qty = safeNum(v);
    if (Number.isFinite(id) && id > 0 && qty && qty > 0) ownedLeft.set(id, qty);
  }

  const mergeMap = (a, b) => {
    for (const [k, v] of b.entries()) a.set(k, (a.get(k) || 0) + v);
  };

  // 防止意外循環 / 爆炸
  const MAX_STEPS = 200000;
  let steps = 0;

  // 生產 1 個（允許買或做；root 會用強制做）
  const makeOne = (id, curOwned, isRoot, path) => {
    steps++;
    if (steps > MAX_STEPS) return { cost: 0, buys: new Map(), owned: curOwned };

    id = Number(id);
    if (!Number.isFinite(id) || id <= 0) return { cost: 0, buys: new Map(), owned: curOwned };

    // 非 root：先用已擁有的成品（這就是你要的「先扣 owned 再比價」）
    if (!isRoot) {
      const have = curOwned.get(id) || 0;
      if (have > 0) {
        if (have === 1) curOwned.delete(id);
        else curOwned.set(id, have - 1);
        return { cost: 0, buys: new Map(), owned: curOwned };
      }
    }

    // 防循環
    if (path.has(id)) {
      // 遇到循環就退化成「買」
      const buyPrice = getBuy(id);
      const buys = new Map();
      if (!isRoot) buys.set(id, 1);
      return { cost: Number.isFinite(buyPrice) ? buyPrice : 0, buys, owned: curOwned };
    }

    const nextPath = new Set(path);
    nextPath.add(id);

    const pairs = getIngPairs(recipeByResult, id);

    // 沒配方：只能買（root 沒配方就回空，避免 root 出現在清單）
    if (!pairs.length) {
      const buyPrice = getBuy(id);
      const buys = new Map();
      if (!isRoot) buys.set(id, 1);
      return { cost: Number.isFinite(buyPrice) ? buyPrice : Infinity, buys, owned: curOwned };
    }

    // === Craft 1 unit ===
    // 做 1 個：把它需要的子材料都「各自」用同一套邏輯生產（因此也會部分買/部分做）
    let craftCost = 0;
    const craftBuys = new Map();
    let ownedRefCraft = curOwned;

    for (const [ingId, amt] of pairs) {
      for (let k = 0; k < amt; k++) {
        const r = makeOne(ingId, ownedRefCraft, false, nextPath);
        craftCost += r.cost;
        mergeMap(craftBuys, r.buys);
        ownedRefCraft = r.owned;
      }
    }

    // root：強制做，不允許買 root
    if (isRoot) {
      return { cost: craftCost, buys: craftBuys, owned: ownedRefCraft };
    }

    // === Buy 1 unit ===
    const buyPrice = getBuy(id);
    const buyCost = buyPrice;

    // 選便宜：買 1 個 vs 做 1 個
    if (buyCost <= craftCost) {
      const buys = new Map();
      buys.set(id, 1);
      return { cost: buyCost, buys, owned: curOwned };
    }

    return { cost: craftCost, buys: craftBuys, owned: ownedRefCraft };
  };

  // 生產 qty 個（逐個決策，才能做到「先用掉你有的材料」）
  const makeMany = (id, qty, curOwned, isRoot) => {
    const buys = new Map();
    let cost = 0;
    let ownedRef = curOwned;

    for (let i = 0; i < qty; i++) {
      const r = makeOne(id, ownedRef, isRoot, new Set());
      cost += r.cost;
      mergeMap(buys, r.buys);
      ownedRef = r.owned;
    }

    return { cost, buys, owned: ownedRef };
  };

  // root 一律做 1 個
  const res = makeMany(Number(rootId), 1, ownedLeft, true);

  // rootId 保底移除
  res.buys.delete(Number(rootId));
  return res.buys;
}

export default function MaterialTracker({
  rootId,
  recipeByResult,
  metaMap, // 繁體顯示用
  metaMapCn, // HuijiWiki(簡體)用
  dc,
}) {
  const storageKey = useMemo(() => `owned_materials_${Number(rootId)}`, [rootId]);

  // 需求材料（用於材料輸入清單）
  const totalNeedMap = useMemo(() => {
    return buildTotalNeeds(recipeByResult || {}, rootId);
  }, [recipeByResult, rootId]);

  const materialIds = useMemo(() => Array.from(totalNeedMap.keys()), [totalNeedMap]);

  // 使用者擁有量（localStorage 記住）
  const [owned, setOwned] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === "object" ? obj : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(owned));
    } catch {
      // ignore
    }
  }, [owned, storageKey]);

  // 查價
  const [priceMap, setPriceMap] = useState(new Map());
  const [err, setErr] = useState("");

  const materialKey = useMemo(() => materialIds.join(","), [materialIds]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr("");
        const m = await fetchUniversalisMin({ dc, itemIds: materialIds });
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
  }, [dc, materialKey]);

  // ✅ 依 owned 先扣，再「當下」逐個重新比價（買成品 vs 展開材料）後得到要買清單
  // ✅ rootId 不會出現在「還需要」清單
  const remainingBuyMap = useMemo(() => {
    return buildRemainingCheapestNeedsOwnedAware(recipeByResult || {}, rootId, owned, priceMap);
  }, [recipeByResult, rootId, owned, priceMap]);

  const rows = useMemo(() => {
    const out = [];
    for (const id of materialIds) {
      const need = totalNeedMap.get(id) || 0;
      const have = Number(owned?.[String(id)] ?? 0) || 0;
      const remain = Math.max(need - have, 0);

      const meta = metaMap?.get(Number(id));
      const nameTw = meta?.name || `Item#${id}`;
      const iconId = meta?.iconId || 0;

      const cnName = (metaMapCn?.get(Number(id)) || "").trim();
      const huijiUrl = huijiItemUrl(cnName);

      const best = priceMap.get(Number(id));
      const unitPrice = best?.pricePerUnit ?? Infinity;
      const world = best?.worldName || "";

      out.push({
        id: Number(id),
        nameTw,
        iconId,
        need,
        have,
        remain,
        unitPrice,
        world,
        huijiUrl,
      });
    }

    // ✅ 固定排序：只用「總需求 need」與 id 排序（need 不會因使用者輸入而變動）
    out.sort((a, b) => (b.need - a.need) || (a.id - b.id));
    return out;
  }, [materialIds, totalNeedMap, owned, priceMap, metaMap, metaMapCn]);

  const remainRows = useMemo(() => {
    const out = [];
    for (const [id, qty] of (remainingBuyMap || new Map()).entries()) {
      const iid = Number(id);
      const remain = Number(qty);
      if (!Number.isFinite(iid) || !Number.isFinite(remain) || remain <= 0) continue;

      // rootId 不列（保底）
      if (iid === Number(rootId)) continue;

      const meta = metaMap?.get(iid) || null;
      const nameTw = meta?.name || `Item#${iid}`;
      const nameCn = (metaMapCn?.get(iid) || "").trim();

      const best = priceMap.get(iid);
      const unitPrice = best?.pricePerUnit ?? null;
      const world = best?.worldName || "";

      out.push({
        id: iid,
        nameTw,
        nameCn,
        iconId: Number(meta?.iconId || 0),
        remain,
        unitPrice,
        world,
        huijiUrl: huijiItemUrl(nameCn),
      });
    }

    // 以總價排序（remain * unitPrice），沒有價格的放後面
    out.sort((a, b) => {
      const ta = (Number.isFinite(a.unitPrice) ? a.unitPrice : Infinity) * a.remain;
      const tb = (Number.isFinite(b.unitPrice) ? b.unitPrice : Infinity) * b.remain;
      return ta - tb;
    });

    return out;
  }, [remainingBuyMap, metaMap, metaMapCn, priceMap, rootId]);

  const totalRemainCost = useMemo(() => {
    let sum = 0;
    for (const r of remainRows) {
      if (!Number.isFinite(r.unitPrice)) continue;
      sum += r.unitPrice * r.remain;
    }
    return sum;
  }, [remainRows]);

  const onOwnedChange = (id, v) => {
    const n = Math.max(0, Math.floor(Number(v) || 0));
    setOwned((prev) => ({ ...prev, [String(id)]: n }));
  };

  const clearOwned = () => setOwned({});

  return (
    <div>
      {/* ====== 材料輸入（第一段）====== */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>材料輸入</h3>

        <button
          type="button"
          onClick={clearOwned}
          style={{
            padding: "6px 10px",
            borderRadius: 10,
            border: "1px solid #333",
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
            opacity: 0.9,
          }}
        >
          清空已擁有數量
        </button>
      </div>

      <div style={{ opacity: 0.8, marginBottom: 10, lineHeight: 1.6 }}>
        <div>在這裡填「已擁有數量」。</div>
        <div style={{ opacity: 0.7 }}>
          （下面會自動計算「還需要」並顯示 HuijiWiki / Universalis 最低價+伺服器）
        </div>
      </div>

      {rows.length ? (
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((r) => {
            const itemHref = `${import.meta.env.BASE_URL}item/${r.id}`;
            const showRow = r.need > 0;
            if (!showRow) return null;

            return (
              <div
                key={r.id}
                style={{
                  border: "1px solid #333",
                  borderRadius: 12,
                  padding: 10,
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <img
                      src={iconUrl(r.iconId)}
                      alt=""
                      width={26}
                      height={26}
                      style={{ borderRadius: 6, flex: "0 0 auto" }}
                      loading="lazy"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <a
                          href={itemHref}
                          style={{
                            color: "inherit",
                            textDecoration: "underline",
                            textUnderlineOffset: 2,
                          }}
                        >
                          {r.nameTw}
                        </a>{" "}
                        <span style={{ opacity: 0.6 }}>#{r.id}</span>
                      </div>

                      <div
                        style={{
                          opacity: 0.8,
                          marginTop: 2,
                          display: "flex",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        {/* 保留原本空白區塊（不動格式） */}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                  <label style={{ opacity: 0.85 }}>
                    已擁有：
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={String(r.have)}
                      onChange={(e) => onOwnedChange(r.id, e.target.value)}
                      style={{
                        marginLeft: 6,
                        width: 110,
                        padding: "6px 8px",
                        borderRadius: 10,
                        border: "1px solid #333",
                        background: "transparent",
                        color: "inherit",
                      }}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ opacity: 0.7 }}>
          （沒有材料可統計：可能沒有配方 / 或 recipe_index 沒收錄）
        </div>
      )}

      {/* ====== 計算「還需要」（第二段，放在輸入下面）====== */}
      <div style={{ borderTop: "1px solid #333", marginTop: 14, paddingTop: 12 }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>
          還需要的數量 + 最低價查詢
        </h3>

        <div style={{ opacity: 0.8, marginBottom: 10, lineHeight: 1.6 }}>
          <div>
            目前「還需要材料」估算總價：
            {Number.isFinite(totalRemainCost) && totalRemainCost > 0
              ? ` ${formatGil(totalRemainCost)} gil`
              : " —"}
          </div>
          <div style={{ opacity: 0.7 }}>
            資料中心：{dc}（Universalis listings=1 最低價）
          </div>
        </div>

        {err ? (
          <div
            style={{
              marginBottom: 10,
              padding: 10,
              border: "1px solid #522",
              borderRadius: 12,
            }}
          >
            <div style={{ color: "#f88", fontWeight: 700 }}>查價失敗</div>
            <div style={{ opacity: 0.8, marginTop: 4 }}>{err}</div>
          </div>
        ) : null}

        {remainRows.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {remainRows.map((r) => {
              const itemHref = `${import.meta.env.BASE_URL}item/${r.id}`;
              const priceText = Number.isFinite(r.unitPrice)
                ? `${formatGil(r.unitPrice)} gil`
                : "—";

              return (
                <div
                  key={r.id}
                  style={{
                    border: "1px solid #333",
                    borderRadius: 12,
                    padding: 10,
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      <img
                        src={iconUrl(r.iconId)}
                        alt=""
                        width={26}
                        height={26}
                        style={{ borderRadius: 6, flex: "0 0 auto" }}
                        loading="lazy"
                        onError={(e) => (e.currentTarget.style.display = "none")}
                      />

                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <a
                            href={itemHref}
                            style={{
                              color: "inherit",
                              textDecoration: "underline",
                              textUnderlineOffset: 2,
                            }}
                          >
                            {r.nameTw}
                          </a>{" "}
                          <span style={{ opacity: 0.6 }}>#{r.id}</span>

                          {r.huijiUrl ? (
                            <>
                              <span style={{ opacity: 0.35, margin: "0 6px" }}>·</span>
                              <a
                                href={r.huijiUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  opacity: 0.8,
                                  textDecoration: "underline",
                                }}
                              >
                                HuijiWiki
                              </a>
                            </>
                          ) : null}
                        </div>

                        <div
                          style={{
                            opacity: 0.8,
                            marginTop: 2,
                            display: "flex",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <span>
                            還需要： <b style={{ opacity: 1 }}>{formatGil(r.remain)}</b>
                          </span>
                          <span>
                            最低價：{priceText}{" "}
                            {r.world ? <span style={{ opacity: 0.7 }}>（{r.world}）</span> : null}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                    <div style={{ opacity: 0.75 }}>
                      小計（還需要 × 價格）：
                      {Number.isFinite(r.unitPrice)
                        ? ` ${formatGil(r.remain * r.unitPrice)} gil`
                        : " —"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ opacity: 0.7 }}>
            （你已填滿所有材料，或目前查不到價格 / 沒有需要的材料）
          </div>
        )}
      </div>
    </div>
  );
}
