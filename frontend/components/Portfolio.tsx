"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Bal {
  asset: string;
  available: string;
  locked: string;
}
interface Ord {
  id: string;
  symbol: string;
  side: string;
  price: string;
  qty: string;
  filledQty: string;
  status: string;
}

export default function Portfolio() {
  const [bal, setBal] = useState<Bal[]>([]);
  const [orders, setOrders] = useState<Ord[]>([]);

  const load = useCallback(async () => {
    const [b, o] = await Promise.all([api("/wallet"), api("/orders")]);
    setBal(b);
    setOrders(o);
  }, []);
  useEffect(() => {
    load().catch(() => undefined);
    const t = setInterval(() => load().catch(() => undefined), 2500);
    return () => clearInterval(t);
  }, [load]);

  return (
    <>
      <div className="panel-head">
        <h2>Balances</h2>
      </div>
      <div className="bal">
        {bal.map((b) => (
          <div key={b.asset}>
            <b>{b.asset}</b>
            <span>{b.available}</span>
            <span className="muted">
              {Number(b.locked) > 0 ? `${b.locked} in orders` : ""}
            </span>
          </div>
        ))}
      </div>
      <div className="panel-head">
        <h2>My orders</h2>
      </div>
      <div className="orders">
        {orders.length === 0 && <div className="muted pad">No orders yet.</div>}
        {orders.slice(0, 12).map((o) => (
          <div key={o.id} className="ord">
            <span className={o.side === "BUY" ? "bidtxt" : "asktxt"}>
              {o.side}
            </span>
            <span>{o.symbol}</span>
            <span>{Number(o.price).toFixed(2)}</span>
            <span>
              {o.filledQty}/{o.qty}
            </span>
            <span className={`st ${o.status.toLowerCase()}`}>
              {o.status.toLowerCase()}
            </span>
            {o.status === "NEW" || o.status === "PARTIAL" ? (
              <button
                className="ghost sm"
                onClick={() =>
                  api(`/orders/${o.id}`, { method: "DELETE" })
                    .then(load)
                    .catch(() => undefined)
                }
              >
                Cancel
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
