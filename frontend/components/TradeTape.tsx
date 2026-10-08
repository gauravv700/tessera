'use client';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';

export default function TradeTape() {
  const { trades, symbol, setTrades } = useStore();
  useEffect(() => { api(`/market/trades?symbol=${symbol}`).then(setTrades).catch(() => undefined); }, [symbol, setTrades]);
  return (
    <>
      <div className="panel-head"><h2>Trades</h2></div>
      <div className="cols"><span>Price</span><span>Size</span><span>Time</span></div>
      <div className="rows tape-rows">
        {trades.length === 0 && <div className="muted pad">No trades yet.</div>}
        {trades.map((t) => (
          <div key={t.id} className={`row3 ${t.side === 'BUY' ? 'bidtxt' : 'asktxt'}`}>
            <span>{Number(t.price).toFixed(2)}</span><span>{t.qty}</span>
            <span className="muted">{new Date(t.ts).toLocaleTimeString([], { hour12: false })}</span>
          </div>
        ))}
      </div>
    </>
  );
}
