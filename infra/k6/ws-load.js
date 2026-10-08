// k6 run -e WS=ws://localhost:8080 infra/k6/ws-load.js   (speaks the socket.io/engine.io v4 wire protocol)
import ws from "k6/ws";
import { check } from "k6";
import { Counter } from "k6/metrics";

const events = new Counter("ws_events");
export const options = {
  stages: [
    { target: 200, duration: "30s" },
    { target: 1000, duration: "1m" },
    { target: 0, duration: "10s" },
  ],
};

export default function () {
  const url = `${__ENV.WS || "ws://localhost:8080"}/socket.io/?EIO=4&transport=websocket`;
  const res = ws.connect(url, {}, (socket) => {
    socket.on("message", (m) => {
      if (m.startsWith("0"))
        socket.send("40"); // engine.io open -> connect namespace
      else if (m.startsWith("40"))
        socket.send('42["subscribe",{"symbol":"BTC-USDT"}]'); // join symbol room
      else if (m === "2")
        socket.send("3"); // ping -> pong
      else if (m.startsWith("42")) events.add(1);
    });
    socket.setTimeout(() => socket.close(), 30000);
  });
  check(res, { "upgraded to websocket": (r) => r && r.status === 101 });
}
