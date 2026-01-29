export function iconUrl(iconId) {
  const id = Number(iconId || 0);
  if (!id) return "";
  const folder = String(Math.floor(id / 1000) * 1000).padStart(6, "0");
  const file = String(id).padStart(6, "0");
  // FFXIV icon tex：ui/icon/000000/000123.tex → 轉 png
  const p = `ui/icon/${folder}/${file}.tex`;
  return `https://v2.xivapi.com/api/asset?path=${encodeURIComponent(p)}&format=png`;
}

export function mapUrl(mapId) {
  if (!mapId) return "";
  // mapId 常見格式像 "f1f1/00"
  return `https://v2.xivapi.com/api/asset/map/${mapId}`;
}
