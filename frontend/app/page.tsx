'use client';
import { useEffect, useState } from 'react';
import AiPanel from '@/components/AiPanel';
import AuthPanel from '@/components/AuthPanel';
import Chart from '@/components/Chart';
import Notifications from '@/components/Notifications';
import OrderBook from '@/components/OrderBook';
import OrderForm from '@/components/OrderForm';
import Portfolio from '@/components/Portfolio';
import TradeTape from '@/components/TradeTape';
import { api, tokens } from '@/lib/api';
import { startSocket, stopSocket, subscribeSymbol } from '@/lib/socket';
import { useStore } from '@/lib/store';

const SYMBOLS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'];

export default function Home() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const { symbol, setSymbol, price, prevPrice, online } = useStore();

  useEffect(() => {
    setAuthed(tokens.has());
    const out = () => setAuthed(false);
    window.addEventListener('auth:logout', out);
    return () => window.removeEventListener('auth:logout', out);
  }, []);

  // market data is public; the socket is (re)created after login so the private notification room is joined
  useEffect(() => {
    if (authed === null) return;
    startSocket();
    return stopSocket;
  }, [authed]);

  useEffect(() => { subscribeSymbol(symbol); }, [symbol]);

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    tokens.clear();
    setAuthed(false);
  };

  if (authed === null) return null;
  const dir = price !== null && prevPrice !== null ? Math.sign(price - prevPrice) : 0;

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">Tessera</div>
        <nav className="tabs" aria-label="Market">
          {SYMBOLS.map((s) => (
            <button key={s} className={s === symbol ? 'tab on' : 'tab'} onClick={() => setSymbol(s)}>{s.replace('-', ' / ')}</button>
          ))}
        </nav>
        <div className={`last ${dir > 0 ? 'up' : dir < 0 ? 'down' : ''}`}>{price !== null ? price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}</div>
        <div className={online ? 'pill live' : 'pill'}>{online ? 'live' : 'offline'}</div>
        {authed && <button className="ghost" onClick={logout}>Sign out</button>}
      </header>

      <main className="grid">
        <section className="panel chart"><Chart /></section>
        <section className="panel book"><OrderBook /></section>
        <section className="panel tape"><TradeTape /></section>
        <section className="panel form">{authed ? <OrderForm /> : <AuthPanel onDone={() => setAuthed(true)} />}</section>
        {authed && <section className="panel folio"><Portfolio /></section>}
        {authed && <section className="panel ai"><AiPanel /></section>}
        {authed && <section className="panel notes"><Notifications /></section>}
      </main>
    </div>
  );
}
