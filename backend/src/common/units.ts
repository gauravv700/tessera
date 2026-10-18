/** Money is never a float: price has 2 decimals, quantity 6, quote-cost (price*qty) 8. */
export const PRICE_DP = 2;
export const QTY_DP = 6;

export const SYMBOLS: Record<
  string,
  { base: string; quote: string; start: number }
> = {
  "BTC-USDT": { base: "BTC", quote: "USDT", start: 65000 },
  "ETH-USDT": { base: "ETH", quote: "USDT", start: 3200 },
  "SOL-USDT": { base: "SOL", quote: "USDT", start: 150 },
};
export const SYMBOL_LIST = Object.keys(SYMBOLS);

/** Decimals used to store each asset balance (USDT = price_dp + qty_dp so price*qty is exact). */
export const ASSET_DP: Record<string, number> = {
  USDT: 8,
  BTC: 6,
  ETH: 6,
  SOL: 6,
};
export const ASSETS = Object.keys(ASSET_DP);

export function parseDecimal(s: string, dp: number): number {
  if (!new RegExp(`^\\d{1,12}(\\.\\d{1,${dp}})?$`).test(s))
    throw new Error(`invalid decimal "${s}" (max ${dp} decimals)`);
  const [i, f = ""] = s.split(".");
  const n = Number(i + f.padEnd(dp, "0"));
  if (!Number.isSafeInteger(n)) throw new Error("number too large");
  return n;
}

export function formatScaled(v: bigint | number | string, dp: number): string {
  const b = BigInt(v);
  const neg = b < 0n;
  const s = (neg ? -b : b).toString().padStart(dp + 1, "0");
  const int = s.slice(0, s.length - dp);
  const frac = s.slice(s.length - dp).replace(/0+$/, "");
  return `${neg ? "-" : ""}${int}${frac ? "." + frac : ""}`;
}
