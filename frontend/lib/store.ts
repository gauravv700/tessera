import { create } from "zustand";

export interface Depth {
  bids: string[][];
  asks: string[][];
}
export interface TradeRow {
  id: string;
  price: string;
  qty: string;
  side: "BUY" | "SELL";
  ts: number;
}
export interface Note {
  type: string;
  message: string;
  createdAt: string;
}

interface State {
  symbol: string;
  price: number | null;
  prevPrice: number | null;
  tickTs: number;
  depth: Depth;
  trades: TradeRow[];
  notes: Note[];
  online: boolean;
  setSymbol: (s: string) => void;
  setTick: (p: number, ts: number) => void;
  setDepth: (d: Depth) => void;
  setTrades: (t: TradeRow[]) => void;
  addTrade: (t: TradeRow) => void;
  addNote: (n: Note) => void;
  setOnline: (b: boolean) => void;
}

export const useStore = create<State>((set) => ({
  symbol: "BTC-USDT",
  price: null,
  prevPrice: null,
  tickTs: 0,
  depth: { bids: [], asks: [] },
  trades: [],
  notes: [],
  online: false,
  setSymbol: (symbol) =>
    set({
      symbol,
      price: null,
      prevPrice: null,
      depth: { bids: [], asks: [] },
      trades: [],
    }),
  setTick: (price, ts) =>
    set((s) => ({ prevPrice: s.price, price, tickTs: ts })),
  setDepth: (depth) => set({ depth }),
  setTrades: (trades) => set({ trades }),
  addTrade: (t) =>
    set((s) => ({
      trades: [t, ...s.trades.filter((x) => x.id !== t.id)].slice(0, 40),
    })),
  addNote: (n) => set((s) => ({ notes: [n, ...s.notes].slice(0, 20) })),
  setOnline: (online) => set({ online }),
}));
