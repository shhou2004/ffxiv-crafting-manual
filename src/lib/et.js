// 1 bell(1 ET 小時)= 175 秒（2分55秒） => ET 比地球快 3600/175 倍
export const ET_MULT = 3600 / 175;

export function nowEtHourFloat() {
  const nowEarthSec = Date.now() / 1000;
  const etSec = nowEarthSec * ET_MULT;
  return (etSec / 3600) % 24;
}

export function secondsToClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function getWindowState({ startEtHours, durationEtHours }) {
  const nowEt = nowEtHourFloat();
  const starts = [...startEtHours].sort((a, b) => a - b);
  const dur = durationEtHours;

  for (const h of starts) {
    const s = h;
    const e = h + dur;
    if (nowEt >= s && nowEt < e) {
      const remainEt = e - nowEt;
      const remainEarthSec = remainEt * 3600 / ET_MULT;
      return { state: "open", remainEarthSec, nextStartEt: h, nextEndEt: e % 24 };
    }
  }

  let next = null;
  for (const h of starts) {
    if (h > nowEt) { next = h; break; }
  }
  if (next == null) next = starts[0] + 24;

  const deltaEt = next - nowEt;
  const deltaEarthSec = deltaEt * 3600 / ET_MULT;
  return { state: "closed", deltaEarthSec, nextStartEt: next % 24, nextEndEt: (next + dur) % 24 };
}
