'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useStore } from '@/lib/store';

interface Reply { answer: string; provider: string; sources: { id: number; title: string }[] }

export default function AiPanel() {
  const symbol = useStore((s) => s.symbol);
  const [q, setQ] = useState('');
  const [reply, setReply] = useState<Reply | null>(null);
  const [sig, setSig] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    setBusy(true); setErr('');
    try { setReply(await api('/ai/chat', { method: 'POST', body: { question: q, symbol } })); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const signal = async () => {
    setErr('');
    try { setSig(await api(`/ai/signal?symbol=${symbol}`)); } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="stack">
      <div className="panel-head"><h2>Assistant</h2><button className="ghost sm" onClick={signal}>Signal for {symbol}</button></div>
      {sig && <div className="sig"><b className={sig.signal === 'BUY' ? 'bidtxt' : sig.signal === 'SELL' ? 'asktxt' : ''}>{sig.signal}</b> RSI {sig.rsi} · {sig.reason}<div className="muted">{sig.disclaimer}</div></div>}
      <div className="inline">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about orders, spreads, risk…" onKeyDown={(e) => e.key === 'Enter' && q && ask()} />
        <button className="primary" disabled={busy || !q} onClick={ask}>{busy ? '…' : 'Ask'}</button>
      </div>
      {err && <div className="err">{err}</div>}
      {reply && (
        <div className="answer">
          <p>{reply.answer}</p>
          <div className="muted">via {reply.provider}{reply.sources.length > 0 && ` · ${reply.sources.map((s) => s.title.replace('Sample: ', '')).join(' · ')}`}</div>
        </div>
      )}
    </div>
  );
}
