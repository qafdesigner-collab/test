# XAUUSD MTF Pullback / Breakout-Retest Strategy (Pine Script v6)

File: [`xauusd_mtf_strategy.pine`](xauusd_mtf_strategy.pine). This is one overlay `strategy()` script. It produces BUY/SELL signals, chart drawings, a dashboard, alerts and Strategy Tester results.

> **Status: baseline v1.0. NOT TESTED.** The script was written without access to TradingView or to intraday XAUUSD data. The network policy of the environment it was written in blocks tradingview.com and the Dukascopy data feed, and no Pine compiler was available. So the script has **not been compiled** and has produced **no backtest results**. Fix any compile error TradingView reports before anything else. Every number in this document is an input default, not a measured result. See [TESTING.md](TESTING.md) for the tests still required.

---

## Easy version: `xauusd_easy.pine`
A simpler edition of the same strategy, for everyday use. **Unvalidated, not compiled, not backtested.**
- About 20 settings instead of about 80. The rest are fixed values, listed in the `FIXED SETTINGS` block at the top of the script.
- Modes are **Safe / Normal / Scalp**. Setups and direction are chosen from simple dropdowns.
- The dashboard shows a **Status** line explaining why no trade is being taken right now, e.g. "Outside London/NY" or "Daily loss limit hit".
- **BUY ZONE / SELL ZONE:** a support zone is labelled BUY ZONE when the 15m and 1h trends were both up at the moment the zone was confirmed. A resistance zone is labelled SELL ZONE when both were down. Other zones are labelled Support or Resistance. Labels never change afterwards. A zone label does **not** mean a higher chance of winning; only a backtest can show that.
- **Buyer/seller pressure (estimate):** each candle's tick volume is split by where the candle closed within its range, then summed over 20 bars. The result is shown on the dashboard and can optionally be used as a filter. It is an **estimate, not real buyer/seller orders**: spot gold has no central exchange, so real buy/sell volume isn't available on these feeds.
- The results table splits BUY/SELL × Pullback/Retest and adds totals, max drawdown and the longest losing streak.

The full version (`xauusd_mtf_strategy.pine`) keeps every option. Its instructions are below.

---

## B. Plain-English rules

### Timeframes
- **Entry chart:** 1m or 5m. Entries are blocked on other timeframes unless you turn off *Only trade on 1m / 5m charts*.
- **Trend filters:** 15m and 1h. Each one uses the **last fully closed** higher-timeframe bar: `request.security(..., f_trendClosed(), lookahead_on)`, where `f_trendClosed` returns `trend[1]`. This is TradingView's documented non-repainting pattern. Historical bars and live bars see the same information, and a bar never sees an unfinished higher-timeframe bar.
- **Trend definition (all timeframes):** Up when close > EMA50 and EMA20 > EMA50. Down is the mirror. Anything else is Flat.

### Filters and why each one is there
| Filter | Rule | Why it exists |
|---|---|---|
| HTF trend | 15m and 1h aligned with the trade direction (Scalping mode: 15m aligned and 1h not opposite) | Pullbacks and retests fail more often against the higher-timeframe trend; this is the main directional filter |
| Market structure | Break of structure (BOS): a candle **close** beyond the last *confirmed* swing high/low sets the bias | Gives an objective view of who controls the swings |
| S/R zones | Zones are built from confirmed pivots (pivot price ± 0.25×ATR). They are used for breakouts and for the "room to target" check | Avoids buying straight into resistance or selling into support |
| Momentum | RSI above 50 and rising for longs; below 50 and falling for shorts | Avoids entering while the pullback is still under way |
| ATR regime | ATR ÷ its 100-bar average must be between 0.7 and 2.5 | Too quiet: targets don't cover costs. Too wild: usually news, with unreliable fills |
| Cost filter | Trade rejected if estimated round-trip cost > 25% of the first target | Small targets on gold are eaten by spread |
| Volume (optional, off by default) | Volume > 1.2 × its 20-bar average | Participation proxy. See the volume note below |
| Session | London 08:00–16:30 Europe/London, or New York 08:00–17:00 America/New_York | Spreads are wider and moves smaller outside these hours. IANA timezones handle daylight-saving time automatically |
| News blackout | 4 manual event times (±15 / +30 min) and an optional recurring daily window | Pine cannot read an economic calendar |
| Risk limits | Daily loss limit 2%, at most 6 trades per day, 5-bar cooldown after each trade | Stops a bad day from compounding |

### Setup A: trend pullback (BUY; SELL is the mirror)
1. The entry-chart trend is Up (EMA20 > EMA50, close > EMA50).
2. Within the last 5 bars, a low touched EMA20 (within 0.2×ATR), and no close fell below EMA50.
3. The signal candle is bullish, closes above EMA20 **and** above the previous candle's high, and is no more than 1×ATR above EMA20, so the entry doesn't chase.

### Setup B: breakout retest (BUY; SELL is the mirror)
1. A candle **closes** above the top of an active resistance zone. That zone becomes the breakout zone.
2. Within 12 bars, price comes back to the zone top (within 0.15×ATR) and a bullish candle closes above it. That candle is the signal.
3. The setup is cancelled if price closes back below the zone bottom or if 12 bars pass. Each breakout can trigger at most one retest signal, whether or not that signal is taken.

### Signal confirmation
- Every condition is checked on the **closed** candle (`calc_on_every_tick = false`, plus a `barstate.isconfirmed` gate). The order fills at the **next bar's open**.
- BUY/SELL markers are `plotshape` marks on the signal bar. They are never moved, deleted or backdated. The detailed text labels (Full layout) are capped at 500 by TradingView, so the oldest ones disappear on long histories, but the markers stay.
- **Pivots:** a dot is drawn at the pivot's *location*. A small cross marks the bar on which it *became known*, which is `pivot length` bars later. Logic only uses a pivot from its confirmation bar onwards. S/R boxes are drawn starting at the pivot's location but are created on the confirmation bar.
- **"Confirmed" means the rule conditions were satisfied at the candle close. It does not mean the trade will win.**

### Setup score
The score adds up weighted filters: 15m trend 20, 1h trend 20, structure 15, momentum 15, entry-chart trend 10, ATR regime 10, room to target 10, and volume 10 when enabled. It is then scaled to 0–100. It is a **setup score, not a probability of winning**. It has not been calibrated against outcomes.

### Modes (all presets unvalidated)
| Mode | Min score | ATR stop | TP1 / TP2 | HTF requirement |
|---|---|---|---|---|
| Conservative | 80 | 2.0×ATR | 1.0R / 2.5R | 15m + 1h aligned |
| Balanced | 65 | 1.5×ATR | 1.0R / 2.0R | 15m + 1h aligned |
| Scalping | 50 | 1.0×ATR | 0.8R / 1.5R | 15m aligned, 1h not opposite |
| Custom | your inputs | | | |

No mode is assumed to be more accurate than another. Compare them with the procedure in TESTING.md.

### Stops and targets
- **Stop type:** compare *Structure* and *ATR* in the tester.
  - **Structure stop.** Pullback trades: below the last confirmed swing low, minus 0.2×ATR. Retest trades: below the broken zone, minus 0.2×ATR.
  - **ATR stop:** entry − (mode multiplier × ATR).
  - **Distance limits (both types):** the stop distance is at least 0.5×ATR. The trade is **skipped** if the stop would be farther than 3×ATR; the stop is never stretched or squeezed to make a trade fit.
- **The initial stop is fixed.** Breakeven and trailing can only move the stop toward profit. `math.max` / `math.min` enforce this, so the stop can never be widened.
- **Targets:** either R-multiples of the stop distance, or **Fixed pips** (default 10 / 20 pips).
  - Gold's pip size is editable (default 0.10). The dashboard shows the price distance, e.g. 10 pips = 1.00 and 20 pips = 2.00.
  - At the default 0.40 round-trip cost and the 25% cost limit, the first target must be at least **16 pips** (1.60). So a 10-pip TP1 is rejected unless your real costs are lower. This is intended: those trades lose most of their edge to the spread.
- **Exits:**
  - Partial exit at TP1 (50%), on by default.
  - Breakeven after TP1 (+0.20), on by default.
  - ATR trailing stop, off by default.
  - Optional forced exits: daily loss limit hit, news blackout, end of session, end of the test window.
- **Sizing:** risk % of equity (default 0.5%) ÷ (stop distance + estimated cost), capped by a maximum notional leverage. Martingale, averaging down and pyramiding are all disabled (`pyramiding = 0`). The strategy never reverses while in a trade.

### Volume: what the feed actually is
Spot XAUUSD is traded over the counter, with no central exchange. On OANDA, FXCM, FOREXCOM and broker CFD feeds, TradingView's `volume` is usually **tick volume**: the number of price updates from that one provider. It is **not** ounces traded, and it is **not** worldwide buy/sell orders. The dashboard shows `syminfo.volumetype` for your feed. COMEX gold futures (`COMEX:GC1!`) report real exchange volume, but they are a different instrument with different prices, sessions and rollovers. The volume filter is off by default and is skipped automatically on feeds without volume.

---

## C. Installation and alerts

### Install
1. In TradingView, open **Pine Editor** → *New* → paste `xauusd_mtf_strategy.pine` → **Save** → **Add to chart**.
2. Use a standard candlestick chart of your broker's XAUUSD feed (e.g. `OANDA:XAUUSD`) on **1m or 5m**. Heikin Ashi or Renko charts block entries.
3. **Properties tab: set costs once, and don't count them twice.**
   - *Commission* defaults to **0.20 USD per contract per order**, which is 0.40 per round trip per oz. That stands in for spread + commission on a feed where 1 contract = 1 oz (the dashboard shows the pointvalue).
   - *Slippage* defaults to **0 ticks**. If you add slippage there, it is in *ticks*, and tick size depends on the feed (mintick is shown on the dashboard).
   - Then set the script input **"Estimated round-trip cost"** to the **total** of what Properties charges, so the cost filter and the tester agree. That input is only used for filtering and sizing; it is never charged a second time.
   - If your plan supports it, enable **Bar Magnifier** (see "Fill assumptions" in TESTING.md).
4. Margin defaults to 5% (20:1). Change it to match your broker.

### Alerts
The script calls `alert()` once per confirmed signal. Example message:
`OANDA:XAUUSD BUY | TF 5 | Setup PB | Entry~2650.120 | SL 2647.400 | TP1 2652.840 | TP2 2655.560 | Setup score 72/100 (not a win probability)`

**Entry price note:** "Entry~" is the signal candle's close. The real fill is the next bar's open, so it can differ, especially after gaps.

To create the alert:
1. Click **Alert** (clock icon) and set **Condition** to this strategy.
2. Choose **"alert() function calls only"**. This avoids duplicate messages: the entry orders also carry an `alert_message`, so if you choose *Order fills and alert() calls* you get two alerts per trade.
3. Set **Expiration**, notifications and webhook (optional), then click **Create**.

Alert limitations:
- Alerts run on TradingView's servers using the settings in force **when the alert was created**. After you change inputs, delete the alert and create it again.
- How many alerts you can keep active, how long they last, whether webhooks are available and how much intrabar data you get all **depend on your TradingView plan**. Check your plan's current limits on TradingView.
- Alerts are notifications only. This script does not place broker orders.

### Platform limits respected
- 5 `request.security` calls (15m, 1h, and three dashboard-only calls).
- Boxes, labels and lines each capped at 500. Active S/R zones are capped per side.
- Signal markers and trade levels use `plot` / `plotshape`, which have no drawing limit.

---

## D. Test results

**Not tested.** No Strategy Tester run, walk-forward test, parameter sweep or stability test has been done. No win rate, profit factor, drawdown or any other performance figure exists for this script. The full list of required tests, the chronological split, the optimisation budget and the reporting template are in **[TESTING.md](TESTING.md)**.

## E. Suggested starting settings (UNVALIDATED)
These are reasonable places to start testing. They are **not** shown to be profitable.

| Setting | Start value |
|---|---|
| Chart | `OANDA:XAUUSD` (or your broker's feed), 5m, standard candles |
| Mode | Balanced |
| Setups | both on; also test each on its own |
| Stop type | Structure; compare against ATR |
| Target | R-multiple. Test Fixed pips 10/20 only if your real cost is ≤ 0.25 round trip |
| Partial / BE / Trail | on / on / off |
| Risk | 0.5% per trade, 2% daily loss limit, 6 trades/day, 5-bar cooldown |
| Sessions | London + New York on |
| Costs | Properties commission 0.20 per contract per side; script cost 0.40. Replace both with your broker's real spread + fees |
| Volume filter | off |
| News | enter the times of CPI, NFP, FOMC and other high-impact releases manually for the period you test |

Keep the baseline as it is. Only adopt a change if it improves the **validation** period after costs, and confirm it once on the untouched **test** period. Don't call any version "better" until that evidence exists.
