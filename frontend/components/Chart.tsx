"use client";
import { useEffect, useRef, useState } from "react";
import {
  CandlestickData,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  createChart,
} from "lightweight-charts";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

const INTERVALS = { "1m": 60, "5m": 300, "15m": 900 } as const;
type Interval = keyof typeof INTERVALS;

export default function Chart() {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const last = useRef<CandlestickData | null>(null);
  const [interval, setIntervalKey] = useState<Interval>("1m");
  const symbol = useStore((s) => s.symbol);
  const price = useStore((s) => s.price);
  const tickTs = useStore((s) => s.tickTs);

  useEffect(() => {
    if (!box.current) return;
    const c = createChart(box.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "#8b95a3",
        fontFamily: "var(--font-mono), monospace",
      },
      grid: {
        vertLines: { color: "#1b222b" },
        horzLines: { color: "#1b222b" },
      },
      rightPriceScale: { borderColor: "#232b35" },
      timeScale: {
        borderColor: "#232b35",
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 5,
        barSpacing: 10,
      },
    });
    series.current = c.addCandlestickSeries({
      upColor: "#3cc4a5",
      downColor: "#ec6a5e",
      borderVisible: false,
      wickUpColor: "#3cc4a5",
      wickDownColor: "#ec6a5e",
    });
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api(`/market/candles?symbol=${symbol}&interval=${interval}`)
      .then((rows: any[]) => {
        if (cancelled || !series.current) return;
        const data = rows.map((r) => ({ ...r, time: r.time as UTCTimestamp }));
        series.current.setData(data);
        last.current = data[data.length - 1] ?? null;
        chart.current?.timeScale().fitContent();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [symbol, interval]);

  // live candle: fold each tick into the current bucket
  useEffect(() => {
    if (price === null || !series.current) return;
    const bucket = (Math.floor(tickTs / 1000 / INTERVALS[interval]) *
      INTERVALS[interval]) as UTCTimestamp;
    const l = last.current;
    const next: CandlestickData =
      l && l.time === bucket
        ? {
            time: bucket,
            open: l.open,
            high: Math.max(l.high, price),
            low: Math.min(l.low, price),
            close: price,
          }
        : { time: bucket, open: price, high: price, low: price, close: price };
    if (l && (bucket as number) < (l.time as number)) return;
    last.current = next;
    series.current.update(next);
  }, [price, tickTs, interval]);

  return (
    <>
      <div className="panel-head">
        <h2>{symbol.replace("-", " / ")}</h2>
        <div className="seg">
          {(Object.keys(INTERVALS) as Interval[]).map((i) => (
            <button
              key={i}
              className={i === interval ? "on" : ""}
              onClick={() => setIntervalKey(i)}
            >
              {i}
            </button>
          ))}
        </div>
        <span className="muted">simulated feed</span>
      </div>
      <div ref={box} className="chart-box" />
    </>
  );
}
