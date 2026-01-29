import fs from "node:fs";
import path from "node:path";

// ==================================================
// Simplified -> Traditional (Taiwan) converter
// ==================================================
let toTW = (s) => (s == null ? "" : String(s));

try {
  const mod = await import("@odict/opencc-js");
  const OpenCC = mod?.default ?? mod;

  const wrapConverter = (c) => {
    if (!c) return null;
    if (typeof c === "function") return c;
    if (typeof c.convert === "function") return (s) => c.convert(s);
    if (typeof c.Convert === "function") return (s) => c.Convert(s);
    if (typeof c.do === "function") return (s) => c.do(s);
    return null;
  };

  let conv = null;

  if (!conv && OpenCC?.Converter) {
    try {
      conv = wrapConverter(new OpenCC.Converter({ from: "cn", to: "tw" }));
    } catch {}
    try {
      conv = wrapConverter(OpenCC.Converter({ from: "cn", to: "tw" }));
    } catch {}
  }

  if (!conv && typeof OpenCC?.createConverter === "function") {
    try {
      conv = wrapConverter(OpenCC.createConverter({ from: "cn", to: "tw" }));
    } catch {}
  }
  if (!conv && typeof OpenCC?.converter === "function") {
    try {
      conv = wrapConverter(OpenCC.converter({ from: "cn", to: "tw" }));
    } catch {}
  }
  if (!conv && typeof OpenCC === "function") {
    try {
      conv = wrapConverter(OpenCC({ from: "cn", to: "tw" }));
    } catch {}
  }

  if (!conv) throw new Error("OpenCC init failed (no compatible converter).");

  toTW = (s) => conv(s == null ? "" : String(s));
  console.log("OK: opencc enabled (cn->tw)");
} catch (e) {
  console.error(
    "\nERROR: 缺少繁轉換工具，導致物品名稱無法變成繁體中文。\n" +
      "請在專案根目錄執行：npm i -D @odict/opencc-js\n" +
      "然後重新跑：node scripts/build-manual.mjs <ffxiv-datamining-cn 目錄>\n" +
      `\n原因：${e?.message || e}\n`
  );
  process.exit(1);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJsonUtf8(filePath, data) {
  // ❗不要 BOM，否則 JSON.parse 會炸
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function readJson(p) {
  const s = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(s);
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pick(obj, ...keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

// ==================================================
// Minimal CSV reader for ffxiv-datamining-cn format.
// ==================================================
function readCsvObjects(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/\r\n?/g, "\n");
  const lines = text.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map((s, i) => {
    let t = String(s ?? "").trim();
    if (i === 0) t = t.replace(/^\uFEFF/, "");
    return t;
  });

  if (headers[0] !== "key") headers[0] = "key";

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const row = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = String(cols[c] ?? "").trim();
    }
    out.push(row);
  }
  return out;
}

function loadCsv(csvPath) {
  const rowsAll = readCsvObjects(csvPath);
  const meta = rowsAll.find((r) => String(r.key) === "#") || null;
  const rows = rowsAll.filter((r) => /^\d+$/.test(String(r.key)));
  return { meta, rows };
}

function normMeta(v) {
  return String(v ?? "").replace(/^\uFEFF/, "").trim().toLowerCase();
}

function findMetaKey(metaRow, wantExact) {
  if (!metaRow) return null;
  const want = normMeta(wantExact);
  for (const [k, v] of Object.entries(metaRow)) {
    if (normMeta(v) === want) return String(k);
  }
  for (const [k, v] of Object.entries(metaRow)) {
    const nv = normMeta(v);
    if (nv && nv.includes(want)) return String(k);
  }
  return null;
}

// ==================================================
// Auto-detect helpers (Recipe.csv 版本差異太大，只能靠資料型態)
// ==================================================
function sampleStats(rows, colKey, sampleN = 2000) {
  let n = 0;
  let hits = 0;
  let bools = 0;
  let max = 0;
  let min = Infinity;
  const distinct = new Set();

  const limit = Math.min(sampleN, rows.length);
  for (let i = 0; i < limit; i++) {
    const r = rows[i];
    const s = String(r[colKey] ?? "").trim();
    n++;
    if (s === "" || s === "0") continue;

    if (s === "True" || s === "False") {
      bools++;
      continue;
    }
    const v = Number(s);
    if (!Number.isFinite(v)) continue;

    hits++;
    if (v > max) max = v;
    if (v < min) min = v;
    distinct.add(v);
  }

  const hitRate = n ? hits / n : 0;
  const boolRate = n ? bools / n : 0;

  return {
    n,
    hits,
    hitRate,
    boolRate,
    distinct: distinct.size,
    max,
    min: min === Infinity ? 0 : min,
  };
}

function isLikelyItemIdCol(st) {
  // 物品ID通常：數值大、distinct 多、boolRate 低
  if (st.boolRate > 0.2) return false;
  if (st.hitRate < 0.02) return false;
  if (st.max < 100) return false;
  if (st.distinct < 50) return false;
  // 上限放寬（資料版本不同）
  if (st.max > 500000) return false;
  return true;
}

function isLikelyAmountCol(st) {
  // 數量通常：小整數、distinct 不會太誇張
  if (st.boolRate > 0.2) return false;
  if (st.hitRate < 0.02) return false;
  if (st.max <= 0 || st.max > 999) return false;
  if (st.distinct > 3000) return false;
  return true;
}

function sortColKeysNumeric(keys) {
  return [...keys].sort((a, b) => Number(a) - Number(b));
}

// ==================================================
// Main
// ==================================================
const argDir = process.argv[2];
if (!argDir) {
  console.error("Usage: node scripts/build-manual.mjs <ffxiv-datamining-cn dir>");
  process.exit(1);
}

const dataDir = path.resolve(argDir);
const outDir = path.resolve("public", "data");
ensureDir(outDir);

// ------------------------------
// 1) Build item_index_zh.json (繁體)
// ------------------------------
try {
  const itemCsv = path.join(dataDir, "Item.csv");
  const { meta: itemMeta, rows: itemRows } = loadCsv(itemCsv);

  const colName = findMetaKey(itemMeta, "Singular");
  const colIcon = findMetaKey(itemMeta, "Icon");

  const items = [];
  const itemsCn = [];
  for (const r of itemRows) {
    const id = safeNum(r.key);
    if (!id || id <= 0) continue;

    const nameCn = pick(r, colName);
    const name = toTW(pick(r, colName));
    const iconId = safeNum(pick(r, colIcon)) || 0;
    if (!name) continue;
    itemsCn.push([Number(id), nameCn, Number(iconId)]);
    items.push([Number(id), name, Number(iconId)]);
  }
  writeJsonUtf8(path.join(outDir, "item_index_cn.json"), { itemsCn });
  writeJsonUtf8(path.join(outDir, "item_index_zh.json"), { items });
  console.log(`OK: item_index_cn.json size=${itemsCn.length}`);
  console.log(`OK: item_index_zh.json size=${items.length}`);
} catch (e) {
  console.error("ERROR build item_index_zh:", e);
  process.exit(1);
}

// ------------------------------
// 2) Build recipe_index.json (auto-detect)
// ------------------------------
function parseRecipeIndex(recipeCsvPath) {
  const { meta, rows } = loadCsv(recipeCsvPath);

  // 先試 meta 直抓（如果剛好符合就用）
  const colResultMeta = findMetaKey(meta, "ItemResult");
  const colAmountResultMeta = findMetaKey(meta, "AmountResult");

  // 欄位 keys（通常是 "0","1","2"...）
  const colKeys = Object.keys(rows[0] || {}).filter((k) => k !== "key");
  const colKeysSorted = sortColKeysNumeric(colKeys);

  // --- (A) 找 result 欄 ---
  let colResult = colResultMeta;
  if (!colResult) {
    // 用資料統計找最像 itemId 的欄，且 hitRate 高、distinct 高
    let best = null;
    for (const k of colKeysSorted) {
      const st = sampleStats(rows, k, 3000);
      if (!isLikelyItemIdCol(st)) continue;

      // result 欄通常 hitRate 很高（幾乎每列都有），distinct 也高
      const score = st.hitRate * 3 + Math.log10(st.distinct + 1);
      if (!best || score > best.score) best = { k, st, score };
    }
    if (best) {
      colResult = best.k;
      // 只做提示，不影響產物
      // console.log(`Detect Recipe.ItemResult: col=${colResult} hitRate=${best.st.hitRate.toFixed(3)} distinct=${best.st.distinct} max=${best.st.max}`);
    }
  }

  if (!colResult) {
    // 完全找不到就只能回空
    return { byResult: {} };
  }

  // --- (B) 找 ingredient/amount 配對 ---
  // 如果 meta 有 ItemIngredient/AmountIngredient 的模式就先用
  const ingByIdx = new Map();
  const amtByIdx = new Map();
  if (meta) {
    for (const [k, vRaw] of Object.entries(meta)) {
      const v = String(vRaw ?? "").replace(/^\uFEFF/, "").trim();
      let m = v.match(/^ItemIngredient\[(\d+)\]$/i);
      if (m) ingByIdx.set(Number(m[1]), String(k));
      m = v.match(/^AmountIngredient\[(\d+)\]$/i);
      if (m) amtByIdx.set(Number(m[1]), String(k));

      // ✅ 額外容錯：很多版本會長得像 Item{Ingredient}[0] / Amount{Ingredient}[0]
      m = v.match(/^Item\{?Ingredient\}?\[(\d+)\]$/i);
      if (m) ingByIdx.set(Number(m[1]), String(k));
      m = v.match(/^Amount\{?Ingredient\}?\[(\d+)\]$/i);
      if (m) amtByIdx.set(Number(m[1]), String(k));
    }
  }

  let pairsCols = [];

  if (ingByIdx.size && amtByIdx.size) {
    const idxs = Array.from(new Set([...ingByIdx.keys(), ...amtByIdx.keys()])).sort((a, b) => a - b);
    for (const i of idxs) {
      const cIng = ingByIdx.get(i);
      const cAmt = amtByIdx.get(i);
      if (cIng && cAmt) pairsCols.push([cIng, cAmt]);
    }
  }

  // 如果 meta 抓不到（你現在就是這種），改用資料型態「看相鄰欄位」自動配
  if (!pairsCols.length) {
    // 先對每個欄位算一次 stats
    const stats = new Map();
    for (const k of colKeysSorted) stats.set(k, sampleStats(rows, k, 3000));

    // 找「像 itemId 的欄」+「下一欄像 amount」=> 成對
    for (let i = 0; i < colKeysSorted.length - 1; i++) {
      const a = colKeysSorted[i];
      const b = colKeysSorted[i + 1];
      if (a === colResult) continue;

      const stA = stats.get(a);
      const stB = stats.get(b);
      if (!stA || !stB) continue;

      if (isLikelyItemIdCol(stA) && isLikelyAmountCol(stB)) {
        pairsCols.push([a, b]);
      }
    }
  }

  // 最後保險：如果還是 0 對，直接回空
  if (!pairsCols.length) {
    return { byResult: {} };
  }

  const byResult = {};

  for (const r of rows) {
    const resultId = safeNum(r[colResult]);
    if (!resultId || resultId <= 0) continue;

    const pairs = [];
    for (const [cIng, cAmt] of pairsCols) {
      const ingId = safeNum(r[cIng]);
      const amt = safeNum(r[cAmt]);
      if (!ingId || ingId <= 0) continue;
      if (!amt || amt <= 0) continue;
      pairs.push([Number(ingId), Number(amt)]);
    }
    if (!pairs.length) continue;

    if (!byResult[resultId]) {
      byResult[resultId] = pairs; // flat
    } else {
      const prev = byResult[resultId];
      // flat -> nested
      if (Array.isArray(prev) && prev.length && Array.isArray(prev[0]) && !Array.isArray(prev[0][0])) {
        byResult[resultId] = [prev, pairs];
      } else if (Array.isArray(prev) && prev.length && Array.isArray(prev[0]) && Array.isArray(prev[0][0])) {
        prev.push(pairs);
      } else {
        byResult[resultId] = pairs;
      }
    }
  }

  return { byResult };
}

try {
  const recipeCsv = path.join(dataDir, "Recipe.csv");
  const recipeIndex = parseRecipeIndex(recipeCsv);

  const resultCount = Object.keys(recipeIndex.byResult).length;
  writeJsonUtf8(path.join(outDir, "recipe_index.json"), recipeIndex);
  console.log(`OK: recipe_index.json results=${resultCount}`);
} catch (e) {
  console.error("ERROR build recipe_index:", e);
  process.exit(1);
}

// ------------------------------
// 3) manual.json（targets 展開 closure）
// ------------------------------
const MANUAL_TARGETS = [11975];

const itemIndex = readJson(path.join(outDir, "item_index_zh.json"));
const metaMap = new Map();
for (const [id, name, iconId] of itemIndex.items || []) {
  metaMap.set(Number(id), { id: Number(id), name, iconId: Number(iconId || 0) });
}

const recipeIndex = readJson(path.join(outDir, "recipe_index.json"));

function getIngPairsFromRecipeIndex(v) {
  let ingPairs = null;
  if (Array.isArray(v) && v.length) {
    if (Array.isArray(v[0]) && v[0].length && Array.isArray(v[0][0])) ingPairs = v[0];
    else if (Array.isArray(v[0]) && !Array.isArray(v[0][0])) ingPairs = v;
  }
  if (!ingPairs) return [];
  return ingPairs
    .map((p) => [Number(p?.[0]), Number(p?.[1] ?? 1)])
    .filter(([iid, amt]) => Number.isFinite(iid) && iid > 0 && Number.isFinite(amt) && amt > 0);
}

function buildClosure(targetIds) {
  const out = [];
  const stack = [...targetIds.map(Number)];
  const seen = new Set();

  while (stack.length) {
    const id = stack.pop();
    if (!Number.isFinite(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);

    const v = recipeIndex?.byResult?.[id];
    const pairs = getIngPairsFromRecipeIndex(v);
    for (const [ingId] of pairs) stack.push(ingId);
  }
  return out;
}

const closureIds = buildClosure(MANUAL_TARGETS);

const manualItems = {};
for (const id of closureIds) {
  const meta = metaMap.get(Number(id));
  manualItems[String(id)] = {
    id: Number(id),
    name: meta?.name || `Item#${id}`,
    desc: "",
    iconId: meta?.iconId || 0,
    recipes: [],
    sources: [],
  };

  const v = recipeIndex?.byResult?.[id];
  const pairs = getIngPairsFromRecipeIndex(v);
  if (pairs.length) {
    manualItems[String(id)].recipes = [
      {
        recipeId: 0,
        resultId: Number(id),
        ingredients: pairs.map(([itemId, amount]) => ({ itemId, amount })),
      },
    ];
  }
}

const manual = {
  generatedAt: new Date().toISOString(),
  targets: MANUAL_TARGETS,
  items: manualItems,
};

writeJsonUtf8(path.join(outDir, "manual.json"), manual);
console.log(`OK: manual.json items=${Object.keys(manualItems).length}, targets=${MANUAL_TARGETS.length}`);
