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
const VIEWS = [
  { id: 'overview', label: 'Overview', icon: '◫' },
  { id: 'markets', label: 'Markets', icon: '⌁' },
  { id: 'portfolio', label: 'Portfolio', icon: '▤' },
  { id: 'assistant', label: 'AI assistant', icon: '✳' },
];
type View = typeof VIEWS[number]['id'] | 'account';

export default function Home() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [view, setView] = useState<View>('overview');
  const { symbol, setSymbol, price, prevPrice, online } = useStore();

  useEffect(() => {
    setAuthed(tokens.has());
    const out = () => setAuthed(false);
    window.addEventListener('auth:logout', out);
    return () => window.removeEventListener('auth:logout', out);
  }, []);
  useEffect(() => {
    if (authed === null) return;
    startSocket();
    return stopSocket;
  }, [authed]);
  useEffect(() => { subscribeSymbol(symbol); }, [symbol]);
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    tokens.clear(); setAuthed(false); setView('overview');
  };
  if (authed === null) return <div className="min-h-screen bg-ink" />;
  const dir = price !== null && prevPrice !== null ? Math.sign(price - prevPrice) : 0;
  const formattedPrice = price !== null ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const heading = view === 'overview' ? 'Your market, in focus' : view === 'markets' ? 'Markets' : view === 'portfolio' ? 'Portfolio' : view === 'assistant' ? 'AI assistant' : 'Account';

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_60%_-20%,rgba(55,115,91,.16),transparent_50%),#080d12] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/[.07] bg-[#080d12]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 md:px-7">
          <button className="flex items-center gap-3 text-left" onClick={() => setView('overview')} aria-label="Tessera home">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-lime text-lg font-bold text-ink shadow-glow">T</span>
            <span><b className="block text-[15px] tracking-wide">tessera</b><small className="block text-[10px] tracking-[.18em] text-slate-500">DIGITAL ASSETS</small></span>
          </button>
          <div className="hidden items-center gap-1 rounded-xl border border-white/[.07] bg-white/[.025] p-1 lg:flex">
            {SYMBOLS.map(s => <button key={s} onClick={() => setSymbol(s)} className={`rounded-lg px-3 py-2 text-xs transition ${s === symbol ? 'bg-white/[.09] text-white' : 'text-slate-500 hover:text-slate-200'}`}>{s.replace('-', ' / ')}</button>)}
          </div>
          <div className="flex items-center gap-3">
            <span className={`hidden h-2 w-2 rounded-full sm:inline-block ${online ? 'bg-mint shadow-[0_0_10px_#45d6ad]' : 'bg-slate-600'}`} />
            <span className="hidden text-xs text-slate-400 sm:inline">{online ? 'Live market data' : 'Connecting'}</span>
            <span className={`font-mono text-sm font-medium tabular-nums ${dir > 0 ? 'text-mint' : dir < 0 ? 'text-coral' : 'text-slate-100'}`}>{formattedPrice}</span>
            <button onClick={() => setView('account')} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-[#17221f] text-xs font-semibold text-lime" aria-label="Account">{authed ? 'JD' : '↗'}</button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-4 pb-3 md:px-7" aria-label="Main navigation">
          {VIEWS.map(item => <button key={item.id} onClick={() => setView(item.id)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs transition ${view === item.id ? 'bg-lime/[.12] text-lime' : 'text-slate-500 hover:bg-white/[.04] hover:text-slate-200'}`}><span className="text-sm">{item.icon}</span>{item.label}</button>)}
          <button onClick={() => setView('account')} className={`ml-auto flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs ${view === 'account' ? 'bg-lime/[.12] text-lime' : 'text-slate-500 hover:text-slate-200'}`}><span>⚙</span>Account</button>
        </nav>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6 md:px-7 md:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div><p className="mb-2 text-[10px] font-medium uppercase tracking-[.22em] text-lime/75">Trading workspace <span className="mx-1 text-slate-700">/</span> {view}</p><h1 className="text-2xl font-medium tracking-tight md:text-3xl">{heading}</h1><p className="mt-1.5 text-sm text-slate-500">A clearer view of the moves that matter.</p></div>
          <div className="flex items-center gap-2 rounded-xl border border-white/[.07] bg-white/[.025] p-1 lg:hidden">{SYMBOLS.map(s => <button key={s} onClick={() => setSymbol(s)} className={`rounded-lg px-2.5 py-1.5 text-[10px] ${s === symbol ? 'bg-white/10 text-white' : 'text-slate-500'}`}>{s.split('-')[0]}</button>)}</div>
          {authed && <button className="ghost" onClick={logout}>Sign out</button>}
        </div>

        {view === 'overview' && <>
          <section className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="panel relative overflow-hidden !p-0">
              <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full bg-mint/[.07] blur-3xl" />
              <div className="relative flex flex-wrap items-start justify-between gap-5 p-5 md:p-7">
                <div><div className="mb-3 flex items-center gap-2 text-xs text-slate-400"><span className="grid h-7 w-7 place-items-center rounded-lg bg-orange-400/10 font-semibold text-orange-300">₿</span>{symbol.replace('-', ' / ')} <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[9px] text-slate-500">SPOT</span></div><div className={`font-mono text-3xl tracking-tight md:text-4xl ${dir > 0 ? 'text-mint' : dir < 0 ? 'text-coral' : 'text-white'}`}>${formattedPrice}</div><p className="mt-2 text-xs text-slate-500">Current market price <span className="mx-1">·</span> USDT</p></div>
                <div className="flex items-center gap-2">{['BTC-USDT','ETH-USDT','SOL-USDT'].map(s => <button key={s} onClick={() => setSymbol(s)} className={`rounded-lg border px-3 py-2 text-xs ${symbol === s ? 'border-lime/30 bg-lime/[.08] text-lime' : 'border-white/[.07] text-slate-500 hover:text-white'}`}>{s.split('-')[0]}</button>)}</div>
              </div>
              <div className="grid grid-cols-3 border-t border-white/[.06]">
                {[['Market','Spot'],['Data feed',online ? 'Connected' : 'Reconnecting'],['Selected pair',symbol.replace('-', ' / ')]].map(([k,v]) => <div key={k} className="border-r border-white/[.06] px-5 py-3 last:border-0 md:px-7"><p className="text-[10px] uppercase tracking-wider text-slate-600">{k}</p><p className="mt-1 text-xs text-slate-300">{v}</p></div>)}
              </div>
            </div>
            <div className="panel flex flex-col justify-between"><div><div className="mb-4 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-lime/[.12] text-lime">✳</span><div><p className="text-sm font-medium">Tessera intelligence</p><p className="text-[10px] text-slate-500">AI market companion</p></div></div><p className="text-sm leading-6 text-slate-400">Ask about your orders, market depth, and trading risk. Get a signal summary for the active pair.</p></div><button onClick={() => setView('assistant')} className="mt-5 flex items-center justify-between rounded-xl border border-white/[.08] bg-white/[.025] px-3 py-2.5 text-xs text-slate-300 hover:border-lime/30 hover:text-lime">Open AI assistant <span>↗</span></button></div>
          </section>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px_300px]">
            <section className="panel min-h-[430px]"><Chart /></section>
            <div className="grid content-start gap-4"><section className="panel"><OrderBook /></section><section className="panel"><TradeTape /></section></div>
            <div className="grid content-start gap-4"><section className="panel">{authed ? <OrderForm /> : <><div className="panel-head"><h2>Get started</h2></div><p className="mb-4 text-xs leading-5 text-slate-400">Sign in to place orders, manage your portfolio, and save your activity.</p><AuthPanel onDone={() => setAuthed(true)} /></>}</section>{authed && <section className="panel"><Notifications /></section>}</div>
          </div>
          {authed && <section className="panel mt-4"><Portfolio /></section>}
        </>}

        {view === 'markets' && <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]"><section className="panel min-h-[470px]"><Chart /></section><div className="grid content-start gap-4"><section className="panel"><OrderBook /></section><section className="panel"><TradeTape /></section></div><section className="panel xl:col-span-2"><div className="panel-head"><h2>Spot pairs</h2><span className="muted">Select a pair to view its live market</span></div><div className="grid gap-2 sm:grid-cols-3">{SYMBOLS.map(s=><button onClick={()=>setSymbol(s)} key={s} className={`flex items-center justify-between rounded-xl border p-4 text-left ${symbol===s?'border-lime/30 bg-lime/[.04]':'border-white/[.07] hover:border-white/20'}`}><span><b className="block text-sm">{s.split('-')[0]} <small className="font-normal text-slate-500">/ USDT</small></b><small className="mt-1 block text-[10px] text-slate-600">Spot market</small></span><span className="font-mono text-xs text-slate-300">{symbol===s?formattedPrice:'—'}</span></button>)}</div></section></div>}
        {view === 'portfolio' && <>{authed ? <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_350px]"><section className="panel"><Portfolio /></section><div className="grid content-start gap-4"><section className="panel min-h-[380px]"><Chart /></section><section className="panel"><Notifications /></section></div></div> : <section className="panel mx-auto max-w-xl"><div className="panel-head"><h2>Sign in to view your portfolio</h2></div><p className="mb-4 text-xs text-slate-400">Your balances and order history will appear here.</p><AuthPanel onDone={() => setAuthed(true)} /></section>}</>}
        {view === 'assistant' && <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_350px]"><section className="panel min-h-[300px]"><div className="mb-4 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-lime/[.12] text-lg text-lime">✳</span><div><h2 className="text-sm font-semibold">Tessera AI</h2><p className="text-xs text-slate-500">Market context and portfolio assistance for {symbol.replace('-', ' / ')}</p></div></div><AiPanel /></section><section className="panel"><Notifications /></section></div>}
        {view === 'account' && <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]"><section className="panel"><div className="panel-head"><h2>Account access</h2></div><p className="mb-5 max-w-lg text-sm leading-6 text-slate-400">{authed ? 'You are signed in. Your private portfolio and order tools are available in this workspace.' : 'Sign in or create an account to access your balances, orders, and private activity.'}</p>{!authed ? <AuthPanel onDone={() => setAuthed(true)} /> : <div className="flex items-center justify-between rounded-xl border border-white/[.07] bg-white/[.025] p-4"><div><p className="text-sm">Signed in</p><p className="mt-1 text-xs text-slate-500">Private trading workspace active</p></div><button className="ghost" onClick={logout}>Sign out</button></div>}</section><section className="panel"><div className="panel-head"><h2>Workspace</h2></div><div className="grid gap-3 text-xs text-slate-400"><p className="flex justify-between border-b border-white/[.06] pb-3"><span>Active market</span><span className="text-slate-200">{symbol.replace('-', ' / ')}</span></p><p className="flex justify-between"><span>Market data</span><span className={online?'text-mint':'text-slate-500'}>{online?'Connected':'Reconnecting'}</span></p></div></section></div>}
      </main>
      <footer className="mx-auto flex max-w-[1600px] flex-wrap justify-between gap-2 border-t border-white/[.06] px-4 py-5 text-[10px] text-slate-600 md:px-7"><span>Tessera <span className="mx-1">·</span> Digital asset trading workspace</span><span>Market data may be simulated</span></footer>
    </div>
  );
}
