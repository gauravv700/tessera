export type Side = "BUY" | "SELL";

/** All numbers are scaled integers (price: 2dp, qty: 6dp) so matching is exact. */
export interface BookOrder {
  id: string;
  userId: string;
  side: Side;
  price: number;
  remaining: number;
}

export interface Fill {
  seq: number; // n-th fill produced by the taker order (makes fill ids deterministic)
  price: number; // always the maker's price
  qty: number;
  makerOrderId: string;
  takerOrderId: string;
  takerSide: Side;
  buyOrderId: string;
  sellOrderId: string;
  buyerId: string;
  sellerId: string;
  buyLimit: number; // buyer's limit price (needed to release over-locked funds)
}

export interface SubmitResult {
  fills: Fill[];
  rested: boolean;
  /** Set when the taker's remainder was cancelled by self-trade prevention. */
  stpCancelled: boolean;
}

/**
 * Price-time priority limit order book.
 * bids: highest price first, asks: lowest price first, FIFO inside a level.
 */
export class OrderBook {
  private bids = new Map<number, BookOrder[]>();
  private asks = new Map<number, BookOrder[]>();
  private bidPrices: number[] = []; // descending
  private askPrices: number[] = []; // ascending
  private index = new Map<string, BookOrder>();

  has(id: string): boolean {
    return this.index.has(id);
  }

  size(): number {
    return this.index.size;
  }

  submit(order: BookOrder): SubmitResult {
    const fills: Fill[] = [];
    const isBuy = order.side === "BUY";
    const levels = isBuy ? this.asks : this.bids;
    const prices = isBuy ? this.askPrices : this.bidPrices;
    let stpCancelled = false;

    while (order.remaining > 0 && prices.length > 0) {
      const best = prices[0];
      const crosses = isBuy ? best <= order.price : best >= order.price;
      if (!crosses) break;

      const queue = levels.get(best)!;
      const maker = queue[0];
      if (maker.userId === order.userId) {
        // Self-trade prevention: cancel the incoming (newest) order's remainder.
        stpCancelled = true;
        break;
      }
      const qty = Math.min(order.remaining, maker.remaining);
      order.remaining -= qty;
      maker.remaining -= qty;

      const buy = isBuy ? order : maker;
      const sell = isBuy ? maker : order;
      fills.push({
        seq: fills.length,
        price: best,
        qty,
        makerOrderId: maker.id,
        takerOrderId: order.id,
        takerSide: order.side,
        buyOrderId: buy.id,
        sellOrderId: sell.id,
        buyerId: buy.userId,
        sellerId: sell.userId,
        buyLimit: buy.price,
      });

      if (maker.remaining === 0) {
        queue.shift();
        this.index.delete(maker.id);
        if (queue.length === 0) {
          levels.delete(best);
          prices.shift();
        }
      }
    }

    let rested = false;
    if (order.remaining > 0 && !stpCancelled) {
      this.rest(order);
      rested = true;
    }
    return { fills, rested, stpCancelled };
  }

  /** Put an order on the book without matching (used when rebuilding state on boot). */
  rest(order: BookOrder): void {
    const isBuy = order.side === "BUY";
    const levels = isBuy ? this.bids : this.asks;
    const prices = isBuy ? this.bidPrices : this.askPrices;
    let queue = levels.get(order.price);
    if (!queue) {
      queue = [];
      levels.set(order.price, queue);
      this.insertPrice(prices, order.price, isBuy);
    }
    queue.push(order);
    this.index.set(order.id, order);
  }

  cancel(id: string): BookOrder | undefined {
    const order = this.index.get(id);
    if (!order) return undefined;
    const isBuy = order.side === "BUY";
    const levels = isBuy ? this.bids : this.asks;
    const prices = isBuy ? this.bidPrices : this.askPrices;
    const queue = levels.get(order.price)!;
    queue.splice(queue.indexOf(order), 1);
    if (queue.length === 0) {
      levels.delete(order.price);
      prices.splice(prices.indexOf(order.price), 1);
    }
    this.index.delete(id);
    return order;
  }

  depth(limit = 20): { bids: [number, number][]; asks: [number, number][] } {
    const agg = (prices: number[], levels: Map<number, BookOrder[]>) =>
      prices
        .slice(0, limit)
        .map(
          (p) =>
            [p, levels.get(p)!.reduce((s, o) => s + o.remaining, 0)] as [
              number,
              number,
            ],
        );
    return {
      bids: agg(this.bidPrices, this.bids),
      asks: agg(this.askPrices, this.asks),
    };
  }

  private insertPrice(
    prices: number[],
    price: number,
    descending: boolean,
  ): void {
    let lo = 0;
    let hi = prices.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const before = descending ? prices[mid] > price : prices[mid] < price;
      if (before) lo = mid + 1;
      else hi = mid;
    }
    prices.splice(lo, 0, price);
  }
}
