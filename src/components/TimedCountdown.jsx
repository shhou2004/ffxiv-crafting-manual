import { useEffect, useState } from "react";
import { getWindowState, secondsToClock } from "../lib/et.js";

export default function TimedCountdown({ timed }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const s = getWindowState(timed);

  const pad2 = (n) => String(Math.floor(n)).padStart(2, "0");

  return (
    <div style={{ padding: 8, borderRadius: 12, background: "#f6f6f6" }}>
      <div>
        <b>時段節點</b>{" "}
        <span style={{ opacity: 0.75 }}>
          （ET {pad2(s.nextStartEt)}:00 - {pad2(s.nextEndEt)}:00）
        </span>
      </div>

      {s.state === "open" ? (
        <div>剩餘時間：<b>{secondsToClock(s.remainEarthSec)}</b></div>
      ) : (
        <div>距離出現：<b>{secondsToClock(s.deltaEarthSec)}</b></div>
      )}
    </div>
  );
}
