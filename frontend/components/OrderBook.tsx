"use client";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function OrderBook() {
  const { depth, symbol, setDepth } = useStore();
  useEffect(() => {
    api(`/market/depth?symbol=${symbol}`)
      .then(setDepth)
      .catch(() => undefined);
  }, [symbol, setDepth]);

  const rows = (side: string[][], cls: string, reverse = false) => {
    const max = Math.max(1e-9, ...side.map((r) => Number(r[1])));
    const list = side.slice(0, 12);
    return (reverse ? [...list].reverse() : list).map(([p, q]) => (
      <div key={p} className={`row ${cls}`}>
        <i style={{ width: `${(Number(q) / max) * 100}%` }} />
        <span>{Number(p).toFixed(2)}</span>
        <span>{q}</span>
      </div>
    ));
  };
  const spread =
    depth.asks[0] && depth.bids[0]
      ? (Number(depth.asks[0][0]) - Number(depth.bids[0][0])).toFixed(2)
      : "—";

  return (
    <>
      <div className="panel-head">
        <h2>Order book</h2>
        <span className="muted">spread {spread}</span>
      </div>
      <div className="cols">
        <span>Price</span>
        <span>Size</span>
      </div>
      <div className="rows">{rows(depth.asks, "ask", true)}</div>
      <div className="mid" />
      <div className="rows">{rows(depth.bids, "bid")}</div>
    </>
  );
}
