# Testing protocol and results

## Current status: **Not tested**

| Item | Status |
|---|---|
| Script compiles in TradingView | **Not tested.** No Pine compiler was available |
| Data feed / timeframe / date range | **Not tested.** TradingView and intraday XAUUSD data could not be reached from the authoring environment |
| Strategy Tester results (any mode) | **Not tested** |
| Walk-forward / out-of-sample | **Not tested** |
| Parameter combinations tried | **0** (all defaults are hand-chosen) |

No result below may be filled in from memory, estimates or other strategies. Fill in only figures the tester actually produced, and record the feed and date range next to each.

---

## 1. Data
- **Feed:** use one feed throughout, e.g. `OANDA:XAUUSD`, and record it. Different brokers have different spreads, sessions and volume types.
- **Timeframes:** 1m and 5m only. **Never run this on daily data and call it a scalping backtest.**
- **History depth:** how much 1m/5m history TradingView loads depends on your plan. Five years of 1m data is about 1.8 million bars, which usually needs *Deep Backtesting* (a higher-tier plan). Write down the **actual first and last bar date** the tester used. If you get less than 5 years, report the real span; do not extrapolate.
- **Candles:** standard OHLC only. The script blocks entries on non-standard chart types.

## 2. Chronological split (no shuffling)
Use the *Test window* inputs to run each period separately. Example for 2021-01-01 → present:

| Period | Use | Example range |
|---|---|---|
| Training | develop / tune | 2021-01-01 → 2023-06-30 |
| Validation | accept or reject changes | 2023-07-01 → 2024-12-31 |
| Test (untouched) | one final run only | 2025-01-01 → latest |

Check that each run's first and last trade fall inside its window.

**Walk-forward** (if history allows):
- Tune on 12 months, then test on the next 3 months.
- Roll forward by 3 months and repeat.
- Report the joined out-of-sample segments only.

## 3. Optimisation budget
- Freeze the baseline first and record its results.
- Change **one parameter at a time**. Limit the total to about **30 combinations** and record every one in the log below, including the ones that failed.
- Suggested parameters to vary:
  - mode (3 presets)
  - stop type (2)
  - setups on/off (3)
  - target type (2)
  - pivot length (3, 5, 8)
  - partial on/off
- **Stability check:** a setting is acceptable only if nearby values (e.g. pivot length 4 and 6 around 5, ATR multiplier ±0.25) also show similar results, and its results hold up in each calendar year rather than coming from one exceptional period.
- **Do not remove most trades to raise the win rate.** Report the trade count with every result. Treat any period with fewer than about 100 trades as statistically weak.

## 4. Costs and fills
- **Costs:**
  - Properties *commission* covers spread + broker commission. *Slippage* (in ticks) is added on market and stop fills.
  - Set the script's *Estimated round-trip cost* to the sum of the two, so the cost filter matches what the tester charges. That input is not charged again.
  - Test again with costs ×1.5 to check sensitivity.
- **Fill assumptions:**
  - Entries are market orders at the next bar's open after the signal close. TP orders are limit orders; SL and breakeven/trail orders are stop orders.
  - When **SL and TP fall inside the same candle**, TradingView's broker emulator doesn't know which came first. By default it assumes the path open → nearest extreme → other extreme → close.
  - Enable **Bar Magnifier** (Properties, plan-dependent) to resolve this with lower-timeframe data. On 1m charts the lower-timeframe data may be limited or unavailable.
  - Report how many trades had SL and TP in the same bar. Treat those trades' outcomes as uncertain, e.g. by re-running the test with a pessimistic assumption.
- **Strategy Tester trade counts with partial exits:** the tester lists the TP1 part and the remainder of a position as **separate trades**. The on-chart statistics table merges them back into one result per position. Report which counting method you use.

## 5. Results template (fill in only with real tester output)

Feed: ______  Timeframe: ___  Range: ______ → ______  Mode: ______  Stop: ______  Costs: ______

| Group | Trades | Win % | Avg win | Avg loss | Profit factor | Expectancy | Net profit | Max DD | Longest losing streak |
|---|---|---|---|---|---|---|---|---|---|
| BUY – pullback | | | | | | | | | |
| BUY – retest | | | | | | | | | |
| SELL – pullback | | | | | | | | | |
| SELL – retest | | | | | | | | | |
| BUY total | | | | | | | | | |
| SELL total | | | | | | | | | |
| **All** | | | | | | | | | |

The on-chart statistics table (Full layout) shows all of these columns per setup and direction. Copy the values from the table, then cross-check them against the Strategy Tester *Performance Summary* and *List of Trades*.

## 6. Tests still required (checklist)
- [ ] Compile in TradingView Pine v6 and fix any errors
- [ ] Record feed, timeframe and actual date range loaded (1m and 5m)
- [ ] Baseline (Balanced, Structure stop, R-multiple) on training period
- [ ] Each mode (Conservative / Balanced / Scalping) on the same period and costs
- [ ] Structure vs ATR stops
- [ ] Setup A only vs Setup B only vs both
- [ ] Fixed 10/20-pip targets vs R-multiple, including how many trades the cost filter rejects
- [ ] Partial / breakeven / trailing each on vs off
- [ ] Volume filter on vs off (note feed volume type)
- [ ] Session filter on vs off; London-only vs New York-only
- [ ] Cost sensitivity (×1.0, ×1.5)
- [ ] Nearby-parameter stability check
- [ ] Per-year breakdown
- [ ] Validation run of the chosen configuration
- [ ] Single run on the untouched test period
- [ ] Walk-forward (if enough history)
- [ ] Count of trades where SL and TP fell in the same bar, plus a Bar Magnifier comparison
- [ ] Forward/paper test in real time to confirm live signals match historical ones

## 7. Change log of parameter trials
| # | Date | Change | Period | Trades | PF | Net | Max DD | Kept? | Why |
|---|---|---|---|---|---|---|---|---|---|
| 0 | – | Baseline defaults | – | Not tested | | | | | |
