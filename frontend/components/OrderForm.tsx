'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';

export default function OrderForm() {
  const { symbol, price: last, depth } = useStore();
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const total = Number(price) * Number(qty);
  const fillFromBook = () => setPrice((side === 'BUY' ? depth.asks[0]?.[0] : depth.bids[0]?.[0]) ?? (last ? last.toFixed(2) : ''));

  const submit = async () => {
    setBusy(true); setMsg(null);
    try {
      const o = await api('/orders', { method: 'POST', body: { symbol, side, price, qty } });
      setMsg({ ok: true, text: `Order ${o.id.slice(0, 8)} accepted` });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <div className="panel-head"><h2>Place order</h2><span className="muted">limit</span></div>
      <div className="seg wide">
        <button className={side === 'BUY' ? 'on buy' : ''} onClick={() => setSide('BUY')}>Buy</button>
        <button className={side === 'SELL' ? 'on sell' : ''} onClick={() => setSide('SELL')}>Sell</button>
      </div>
      <label>Price (USDT)<div className="inline"><input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" /><button className="ghost" onClick={fillFromBook}>Best {side === 'BUY' ? 'ask' : 'bid'}</button></div></label>
      <label>Amount ({symbol.split('-')[0]})<input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0.000" /></label>
      <div className="muted">Total {Number.isFinite(total) && total > 0 ? total.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'} USDT</div>
      <button className={side === 'BUY' ? 'primary buy' : 'primary sell'} disabled={busy || !price || !qty} onClick={submit}>{side === 'BUY' ? 'Buy' : 'Sell'} {symbol.split('-')[0]}</button>
      {msg && <div className={msg.ok ? 'ok' : 'err'}>{msg.text}</div>}
    </div>
  );
}
