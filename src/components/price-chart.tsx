"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineStyle,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { formatPrice } from "@/lib/format";

export interface ChartPoint {
  t: string;
  price: number;
}

export interface ChartMarker {
  t: string;
  label: string;
}

/** Price chart built from PeakAlert's own snapshots (DexScreener has no history API). */
export function PriceChart({
  points,
  markers = [],
  entryPrice,
  height = 300,
}: {
  points: ChartPoint[];
  markers?: ChartMarker[];
  entryPrice?: number | null;
  height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const chart = createChart(el.current, {
      height,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8c929b",
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: 11,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      rightPriceScale: { borderColor: "#1d2127" },
      timeScale: { borderColor: "#1d2127", timeVisible: true, secondsVisible: false },
      crosshair: {
        vertLine: { color: "#5c626c", style: LineStyle.Dashed, labelBackgroundColor: "#14171b" },
        horzLine: { color: "#5c626c", style: LineStyle.Dashed, labelBackgroundColor: "#14171b" },
      },
      localization: { priceFormatter: (p: number) => formatPrice(p) },
    });
    chartRef.current = chart;

    const data = points
      .map((p) => ({ time: Math.floor(Date.parse(p.t) / 1000) as UTCTimestamp, value: Number(p.price) }))
      .filter((p) => Number.isFinite(p.value));
    const up = data.length < 2 || data[data.length - 1].value >= data[0].value;
    const color = up ? "#2ebd85" : "#f6465d";

    const series = chart.addSeries(AreaSeries, {
      lineColor: color,
      lineWidth: 2,
      topColor: up ? "rgba(46,189,133,0.18)" : "rgba(246,70,93,0.18)",
      bottomColor: "rgba(0,0,0,0)",
      priceLineVisible: true,
      priceLineColor: color,
      priceFormat: { type: "custom", formatter: (p: number) => formatPrice(p), minMove: 1e-12 },
    });
    series.setData(data);

    if (entryPrice) {
      series.createPriceLine({
        price: entryPrice,
        color: "#8c929b",
        lineStyle: LineStyle.Dotted,
        lineWidth: 1,
        axisLabelVisible: true,
        title: "entrada",
      });
    }

    if (markers.length && data.length) {
      const first = data[0].time;
      createSeriesMarkers(
        series,
        markers
          .map((m) => ({ time: Math.floor(Date.parse(m.t) / 1000) as UTCTimestamp, label: m.label }))
          .filter((m) => m.time >= first)
          .sort((a, b) => a.time - b.time)
          .map((m) => ({
            time: m.time,
            position: "aboveBar" as const,
            color: "#e8b14a",
            shape: "arrowDown" as const,
            text: m.label,
          })),
      );
    }
    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [points, markers, entryPrice, height]);

  return <div ref={el} style={{ height }} className="w-full" />;
}
