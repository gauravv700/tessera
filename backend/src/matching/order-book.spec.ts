import { OrderBook, BookOrder, Side } from './order-book';

let n = 0;
const o = (side: Side, price: number, qty: number, userId = `u${++n}`): BookOrder => ({
  id: `o${++n}`,
  userId,
  side,
  price,
  remaining: qty,
});

describe('OrderBook', () => {
  it('rests a non-crossing order', () => {
    const b = new OrderBook();
    const r = b.submit(o('BUY', 100, 5));
    expect(r.fills).toHaveLength(0);
    expect(r.rested).toBe(true);
    expect(b.depth().bids).toEqual([[100, 5]]);
  });

  it('matches at the maker price (price improvement for the taker)', () => {
    const b = new OrderBook();
    b.submit(o('SELL', 100, 5));
    const r = b.submit(o('BUY', 105, 5));
    expect(r.fills).toHaveLength(1);
    expect(r.fills[0].price).toBe(100);
    expect(r.fills[0].buyLimit).toBe(105);
    expect(b.size()).toBe(0);
  });

  it('enforces price priority then time priority', () => {
    const b = new OrderBook();
    const first = o('SELL', 101, 2);
    const second = o('SELL', 101, 2);
    const better = o('SELL', 100, 1);
    b.submit(first);
    b.submit(second);
    b.submit(better);
    const r = b.submit(o('BUY', 101, 4));
    expect(r.fills.map((f) => f.makerOrderId)).toEqual([better.id, first.id, second.id]);
    expect(r.fills.map((f) => f.qty)).toEqual([1, 2, 1]);
    expect(b.depth().asks).toEqual([[101, 1]]);
  });

  it('handles partial fills and rests the remainder', () => {
    const b = new OrderBook();
    b.submit(o('SELL', 100, 3));
    const r = b.submit(o('BUY', 100, 10));
    expect(r.fills[0].qty).toBe(3);
    expect(r.rested).toBe(true);
    expect(b.depth().bids).toEqual([[100, 7]]);
  });

  it('cancels resting orders and cleans up empty levels', () => {
    const b = new OrderBook();
    const x = o('BUY', 99, 1);
    b.submit(x);
    expect(b.cancel(x.id)?.id).toBe(x.id);
    expect(b.depth().bids).toEqual([]);
    expect(b.cancel(x.id)).toBeUndefined();
  });

  it('prevents self-trades by cancelling the incoming remainder', () => {
    const b = new OrderBook();
    b.submit(o('SELL', 100, 5, 'alice'));
    const r = b.submit(o('BUY', 100, 5, 'alice'));
    expect(r.fills).toHaveLength(0);
    expect(r.stpCancelled).toBe(true);
    expect(r.rested).toBe(false);
    expect(b.depth().asks).toEqual([[100, 5]]);
  });

  it('keeps bids sorted descending and asks ascending', () => {
    const b = new OrderBook();
    [98, 100, 99].forEach((p) => b.submit(o('BUY', p, 1)));
    [103, 101, 102].forEach((p) => b.submit(o('SELL', p, 1)));
    expect(b.depth().bids.map((x) => x[0])).toEqual([100, 99, 98]);
    expect(b.depth().asks.map((x) => x[0])).toEqual([101, 102, 103]);
  });
});
