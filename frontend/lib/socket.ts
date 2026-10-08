import { io, Socket } from "socket.io-client";
import { API, tokens } from "./api";
import { useStore } from "./store";

let socket: Socket | null = null;

/** websocket-only transport => no sticky sessions needed behind a load balancer. */
export function startSocket(): Socket {
  if (socket) socket.disconnect();
  const s = io(API, {
    transports: ["websocket"],
    auth: { token: tokens.access() ?? undefined },
    reconnectionDelayMax: 5000,
  });
  const st = () => useStore.getState();
  s.on("connect", () => {
    st().setOnline(true);
    s.emit("subscribe", { symbol: st().symbol });
  });
  s.on("disconnect", () => st().setOnline(false));
  s.on("tick", (m: { symbol: string; price: number; ts: number }) => {
    if (m.symbol === st().symbol) st().setTick(m.price, m.ts);
  });
  s.on("depth", (m: { symbol: string; bids: string[][]; asks: string[][] }) => {
    if (m.symbol === st().symbol) st().setDepth(m);
  });
  s.on("trade", (m: any) => {
    if (m.symbol === st().symbol) st().addTrade(m);
  });
  s.on("notification", (n: any) => st().addNote(n));
  socket = s;
  return s;
}

export const subscribeSymbol = (symbol: string) =>
  socket?.emit("subscribe", { symbol });
export const stopSocket = () => {
  socket?.disconnect();
  socket = null;
};
