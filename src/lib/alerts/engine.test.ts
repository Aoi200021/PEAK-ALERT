import { describe, expect, it } from "vitest";
import { evaluateRule } from "./engine";
import type { MarketData, RuleRuntime } from "./types";

const NOW = new Date("2026-01-01T12:00:00Z");

function market(over: Partial<MarketData> = {}): MarketData {
  return {
    priceUsd: 1,
    marketCap: 1_000_000,
    volume: { m5: 100, h1: 1000, h6: 6000, h24: 24000 },
    change: { m5: 0, h1: 0, h6: 0, h24: 0 },
    txnsH1: { buys: 10, sells: 10 },
    updatedAt: NOW,
    ...over,
  };
}

function rule(over: Partial<RuleRuntime>): RuleRuntime {
  return {
    type: "drawdown_from_peak",
    params: { drop_pct: 15 },
    armed: true,
    state: {},
    cooldownMinutes: 60,
    lastTriggeredAt: null,
    ...over,
  };
}

/** Run a sequence of prices through a rule, carrying state like the server does. */
function run(r: RuleRuntime, prices: Array<Partial<MarketData>>, stepMin = 1) {
  const fired: number[] = [];
  let cur = { ...r };
  prices.forEach((p, i) => {
    const now = new Date(NOW.getTime() + i * stepMin * 60_000);
    const res = evaluateRule(cur, market({ ...p, updatedAt: now }), now);
    if (res.fire) fired.push(i);
    cur = {
      ...cur,
      armed: res.armed,
      state: res.state,
      lastTriggeredAt: res.fire ? now : cur.lastTriggeredAt,
    };
  });
  return { fired, rule: cur };
}

describe("drawdown_from_peak", () => {
  it("fires once when price drops 15% from the tracked peak (the $1M example)", () => {
    const r = rule({ params: { drop_pct: 15, min_peak_market_cap: 1_000_000 } });
    const { fired } = run(r, [
      { priceUsd: 0.5, marketCap: 500_000 },
      { priceUsd: 1.0, marketCap: 1_000_000 }, // peak hits $1M
      { priceUsd: 0.9, marketCap: 900_000 }, // -10%
      { priceUsd: 0.84, marketCap: 840_000 }, // -16% → fire
      { priceUsd: 0.8, marketCap: 800_000 }, // still down, no duplicate
      { priceUsd: 0.7, marketCap: 700_000 },
    ]);
    expect(fired).toEqual([3]);
  });

  it("does not arm until peak market cap reaches the minimum", () => {
    const r = rule({ params: { drop_pct: 15, min_peak_market_cap: 1_000_000 } });
    const { fired } = run(r, [
      { priceUsd: 0.5, marketCap: 500_000 },
      { priceUsd: 0.3, marketCap: 300_000 }, // -40% but peak mcap was only 500k
    ]);
    expect(fired).toEqual([]);
  });

  it("re-arms only after a new peak above the previous trigger peak, respecting cooldown", () => {
    const r = rule({ params: { drop_pct: 10 }, cooldownMinutes: 5 });
    const { fired } = run(
      r,
      [
        { priceUsd: 1 },
        { priceUsd: 0.85 }, // fire (#1)
        { priceUsd: 0.95 }, // recovery but no new high → still disarmed
        { priceUsd: 0.8 }, // no duplicate
        { priceUsd: 1.2 }, // new high → re-arm
        { priceUsd: 1.0 }, // -16.7% → fire (#5)
      ],
      10,
    );
    expect(fired).toEqual([1, 5]);
  });

  it("never evaluates stale data", () => {
    const old = new Date(NOW.getTime() - 60 * 60_000);
    const res = evaluateRule(
      rule({ state: { peak_price: 2 } }),
      market({ priceUsd: 1, updatedAt: old }),
      NOW,
    );
    expect(res.fire).toBe(false);
    expect(res.skipped).toBe("stale_data");
  });

  it("skips when price is missing instead of assuming a value", () => {
    const res = evaluateRule(rule({}), market({ priceUsd: null }), NOW);
    expect(res.fire).toBe(false);
    expect(res.skipped).toBe("no_price");
  });
});

describe("price_spike", () => {
  it("fires on a big 5m drop and re-arms after it clears", () => {
    const r = rule({
      type: "price_spike",
      params: { window: "m5", direction: "down", change_pct: 8 },
      cooldownMinutes: 5,
    });
    const z = { m5: 0, h1: 0, h6: 0, h24: 0 };
    const { fired } = run(
      r,
      [
        { change: { ...z, m5: -3 } },
        { change: { ...z, m5: -9 } }, // fire
        { change: { ...z, m5: -12 } }, // still met → no duplicate
        { change: { ...z, m5: 1 } }, // clears → re-arm
        { change: { ...z, m5: -10 } }, // fire again (cooldown elapsed: 10 min steps)
        { change: { ...z, m5: 20 } }, // up move ignored (direction=down)
      ],
      10,
    );
    expect(fired).toEqual([1, 4]);
  });
});

describe("volume_drop", () => {
  it("compares last hour to the previous 5h hourly average", () => {
    // prev avg = (6000 - 200) / 5 = 1160; drop = 82.7%
    const res = evaluateRule(
      rule({ type: "volume_drop", params: { drop_pct: 50, min_avg_hourly_volume_usd: 100 } }),
      market({ volume: { m5: 10, h1: 200, h6: 6000, h24: 20000 } }),
      NOW,
    );
    expect(res.fire).toBe(true);
    expect(res.event?.metrics.drop_pct).toBeCloseTo(82.76, 1);
  });

  it("ignores illiquid tokens below the noise floor", () => {
    const res = evaluateRule(
      rule({ type: "volume_drop", params: { drop_pct: 50, min_avg_hourly_volume_usd: 5000 } }),
      market({ volume: { m5: 1, h1: 10, h6: 600, h24: 2000 } }),
      NOW,
    );
    expect(res.fire).toBe(false);
    expect(res.skipped).toBe("volume_too_low");
  });
});

describe("momentum_loss", () => {
  it("requires prior gain, hourly drop and sell pressure", () => {
    const r = rule({
      type: "momentum_loss",
      params: { min_gain_h6_pct: 50, drop_h1_pct: 10, min_sell_buy_ratio: 1.2 },
    });
    const base = { m5: -1, h24: 100 };
    expect(
      evaluateRule(r, market({ change: { ...base, h1: -15, h6: 80 }, txnsH1: { buys: 100, sells: 150 } }), NOW).fire,
    ).toBe(true);
    expect(
      evaluateRule(r, market({ change: { ...base, h1: -15, h6: 80 }, txnsH1: { buys: 150, sells: 100 } }), NOW).fire,
    ).toBe(false);
    expect(
      evaluateRule(r, market({ change: { ...base, h1: -15, h6: 20 }, txnsH1: { buys: 100, sells: 150 } }), NOW).fire,
    ).toBe(false);
  });
});

describe("market_cap_cross", () => {
  it("only fires on an actual cross, not when already above at creation", () => {
    const r = rule({
      type: "market_cap_cross",
      params: { direction: "above", value_usd: 1_000_000 },
      cooldownMinutes: 5,
    });
    const already = run(r, [{ marketCap: 2_000_000 }, { marketCap: 2_100_000 }]);
    expect(already.fired).toEqual([]);

    const crossing = run(
      r,
      [
        { marketCap: 800_000 }, // init, below → armed
        { marketCap: 950_000 },
        { marketCap: 1_050_000 }, // cross → fire
        { marketCap: 1_200_000 }, // no duplicate
        { marketCap: 900_000 }, // back below → re-arm
        { marketCap: 1_100_000 }, // cross again → fire
      ],
      10,
    );
    expect(crossing.fired).toEqual([2, 5]);
  });
});

describe("invalid params", () => {
  it("never fires with params that fail validation", () => {
    const res = evaluateRule(rule({ params: { drop_pct: "lots" } }), market(), NOW);
    expect(res.fire).toBe(false);
    expect(res.skipped).toBe("invalid_params");
  });
});
