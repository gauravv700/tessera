// k6 run -e BASE=http://localhost:8080 infra/k6/orders-load.js
import http from "k6/http";
import exec from "k6/execution";
import { check } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE = __ENV.BASE || "http://localhost:8080";
const USERS = Number(__ENV.USERS || 100);

const accepted = new Rate("orders_accepted");
const acceptedDuration = new Trend("accepted_duration", true);
const rejectedFunds = new Counter("rejected_funds");
const rejectedThrottle = new Counter("rejected_429");
const rejectedOther = new Counter("rejected_other");

export const options = {
  setupTimeout: "180s",
  scenarios: {
    orders: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { target: 50, duration: "30s" },
        { target: 150, duration: "1m" },
        { target: 0, duration: "10s" },
      ],
    },
  },
  thresholds: {
    orders_accepted: ["rate>0.98"],
    accepted_duration: ["p(95)<500"],
    dropped_iterations: ["count==0"],
  },
};

const json = { headers: { "content-type": "application/json" } };

export function setup() {
  const stamp = Date.now();
  const tokens = [];
  // register in parallel chunks so bcrypt doesn't make setup crawl
  for (let start = 0; start < USERS; start += 20) {
    const reqs = [];
    for (let i = start; i < Math.min(start + 20, USERS); i++) {
      reqs.push([
        "POST",
        `${BASE}/auth/register`,
        JSON.stringify({
          email: `k6-${stamp}-${i}@load.test`,
          password: "load-test-pass",
        }),
        json,
      ]);
    }
    for (const r of http.batch(reqs)) {
      if (r.status === 201) tokens.push(r.json("accessToken"));
    }
  }
  if (tokens.length === 0) throw new Error("no users registered");
  console.log(`registered ${tokens.length} users`);

  const mid = Number(
    http.get(`${BASE}/market/depth?symbol=BTC-USDT`).json("bids.0.0") || 65000,
  );
  return { tokens, mid };
}

export default function (d) {
  // spread orders evenly across users, so no single wallet becomes a hotspot
  const token = d.tokens[exec.scenario.iterationInTest % d.tokens.length];
  const side = Math.random() < 0.5 ? "BUY" : "SELL";
  const px = (d.mid * (1 + (Math.random() - 0.5) * 0.004)).toFixed(2);

  const res = http.post(
    `${BASE}/orders`,
    JSON.stringify({ symbol: "BTC-USDT", side, price: px, qty: "0.001" }),
    {
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
    },
  );

  const ok = res.status === 201;
  accepted.add(ok);
  if (ok) acceptedDuration.add(res.timings.duration);
  else if (res.status === 429) rejectedThrottle.add(1);
  else if (res.status === 400) rejectedFunds.add(1);
  else rejectedOther.add(1);

  if (!ok && __ITER < 20) console.log(res.status, res.body);
  check(res, { "order accepted (201)": (r) => r.status === 201 });
}