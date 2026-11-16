export type EdgeFinderKbTopicId =
  | 'risk_regime'
  | 'strength_meter'
  | 'feed_health_cadences'
  | 'horizon_engine'
  | 'conviction_radar'
  | 'scanner_matrix'
  | 'correlation_matrix'
  | 'scorecard_gauge'
  | 'killzone_synergy'
  | 'tug_of_war'
  | 'historical_score_chart'
  | 'eleven_pillars'
  | 'gold_scorecard'
  | 'carry_scanner'
  | 'cot_positioning'
  | 'smart_money_tracker'
  | 'retail_contrarian'
  | 'seasonality_killzones'
  | 'yield_curve_fred'
  | 'sovereign_macro_matrix'
  | 'futures_crypto_macro';

export type EdgeFinderKbCategory =
  | 'Scoring & Horizons'
  | 'Scanner & Matrix'
  | 'COT & Sentiment'
  | 'Macro & Yields'
  | 'Futures, Gold & Crypto'
  | 'Technicals, Seasonality & Feeds';

export interface EdgeFinderKbTopic {
  id: EdgeFinderKbTopicId;
  title: string;
  shortTitle: string;
  category: EdgeFinderKbCategory;
  badge: string;
  updateCadence: string;
  dataSource: string;
  summary: string;
  whatItIs: string;
  simpleExplanation: string[];
  calculationFormula: string[];
  howToTrade: {
    scalper: string;
    intraday: string;
    swing: string;
  };
  readingSignals: string[];
  relatedIds: EdgeFinderKbTopicId[];
}

export const EDGE_FINDER_KB_TOPICS: EdgeFinderKbTopic[] = [
  {
    id: 'horizon_engine',
    title: 'Multi-Timeframe Execution Horizon Engine (Scalp · Intraday · Swing)',
    shortTitle: 'Execution Horizons',
    category: 'Scoring & Horizons',
    badge: '3-HORIZON ENGINE',
    updateCadence: '60s Live Auto-Sync (M15/H1/H4) + 2m–60m Macro',
    dataSource: 'Yahoo 15m Bars · D1 Bars · CFTC COT · BIS Macro · Manna Killzones',
    summary:
      'Separates Buy/Sell directional bias into three clear holding styles—Scalper (M5–M15), Intraday (H1–H4), and Swing (D1–W1)—each graded from -10 to +10.',
    whatItIs:
      'Traders lose edge when an indicator calls "Buy" or "Sell" without saying whether it refers to a 20-minute scalp or a 3-week swing trade. Manna EdgeFinder Pro solves this by evaluating short-term price speed, session momentum, and big-picture macro strength separately for each holding style.',
    simpleExplanation: [
      'Scalper Mode focuses on fast session speed, short-term trend alignment, whether price is inside an active Manna Killzone session, and whether today’s move is already stretched too far.',
      'Intraday Mode balances today’s H1/H4 trend direction with session institutional flow, retail positioning, and currency/asset macro strength.',
      'Swing Mode zooms out to the big picture: central bank interest rates, economic growth, weekly hedge-fund positioning (COT), retail extremes, 10-year seasonal tendencies, and daily trends.',
      'Every mode outputs an easy score from -10 (Strongest Sell) to +10 (Strongest Buy), with -2 to +2 treated as Neutral.'
    ],
    calculationFormula: [
      'SCALP (M1/M5/M15 · Hold 15m–2h): M15 EMA(9/21) [w=2.5] + H1 EMA(20/50) [w=1.75] + 1H Velocity [w=1.0] + 4H Velocity [w=0.75] + Manna Killzone [w=1.5] + M15 RSI Zone [w=0.75] + Retail Contrarian [w=0.75] + Macro Directional Guard [w=1.0]. Total max weight = 10.0.',
      'SCALP Exhaustion Guard (adrWarning): If Daily ADR used >= 95% OR M15 RSI >= 75 or <= 25, raw score is damped x0.72 so scalpers avoid chasing stretched tops/bottoms.',
      'INTRADAY (M15/H1/H4 · Hold 2h–24h): H1 EMA(20/50) [w=2.0] + H4 EMA(12/26) [w=2.0] + D1 Trend [w=1.0] + 4H Velocity [w=0.75] + H1 RSI Zone [w=0.5] + Manna Killzone [w=1.0] + COT [w=0.75] + Retail Fade [w=0.75] + Macro Diff [w=1.25]. Total max = 10.0; damped x0.78 if ADR >= 115% or H1 RSI >= 76 / <= 24.',
      'SWING (H4/D1/W1 · Hold 3d–4w): Full 11-pillar composite combining Fundamentals [4.75], COT [1.5], Retail Fade [1.0], Daily EMA20/50 Trend [1.25], 10Y Seasonality [0.75], and Manna Killzone [0.75].',
      'Bias thresholds across every horizon: Strong Buy (>= +5.0), Buy (+2.0 to +4.99), Neutral (-1.99 to +1.99), Sell (-2.0 to -4.99), Strong Sell (<= -5.0).'
    ],
    howToTrade: {
      scalper:
        'Select SCALP mode, check that ADR Exhaustion Guard is not active (<95% ADR), and execute M5/M15 FVG or liquidity sweeps during the asset’s optimal Killzone window.',
      intraday:
        'Select INTRADAY mode, confirm H1 & H4 structure align with your direction, and aim for session liquidity pools across London/NY overlap.',
      swing:
        'Select SWING mode and focus on assets with |Score| >= 5.0 backed by wide rate/growth differentials and non-crowded 52W COT positioning.'
    },
    readingSignals: [
      '★ 3/3 TF ALIGNED means Scalp, Intraday, and Swing all point Long (>= +2.0) or Short (<= -2.0).',
      'COUNTER-HTF warns that a short-term bounce/pullback opposes the multi-day Swing macro trend—reduce lot size and take quicker profits.',
      '⚠ ADR STRETCHED alerts you that today’s range already consumes nearly all 14D ATR—wait for an EMA9/21 pullback.'
    ],
    relatedIds: ['scanner_matrix', 'scorecard_gauge', 'killzone_synergy', 'eleven_pillars']
  },
  {
    id: 'risk_regime',
    title: 'Global Risk-On / Risk-Off Regime Gauge (0–100)',
    shortTitle: 'Global Risk Regime',
    category: 'Macro & Yields',
    badge: 'INTERMARKET PULSE',
    updateCadence: '60s–2m Live Equity, Carry & Haven Sync',
    dataSource: 'ES, NQ, GBP/JPY, Gold (GC) & 10Y Treasury Note (ZN)',
    summary:
      'Synthesizes cross-asset risk appetite on a 0–100 scale to tell you whether global capital is flowing into growth/carry or hiding in safe havens.',
    whatItIs:
      'Markets move in synchronized risk regimes. Before taking a trade in high-beta FX, Equity Indices, Commodities, or Crypto, institutional desks check whether capital prefers growth assets (Risk-On) or defensive hedges (Risk-Off).',
    simpleExplanation: [
      'Think of this gauge as the market’s daily "weather mood" from 0 to 100.',
      'High readings (60+) mean Risk-On: investors feel confident, stock indices like S&P 500 (ES) and Nasdaq (NQ) are climbing, and money flows into growth assets.',
      'Low readings (40 or below) mean Risk-Off: investors are cautious and moving money into safe havens like Gold, US Treasury Bonds, USD, JPY, and CHF.',
      'Between 41 and 59 is a mixed, selective rotation where both buyers and sellers are active.'
    ],
    calculationFormula: [
      'Starts from a balanced neutral baseline of 50.',
      'Adds risk appetite impulse: + (ES Total Score × 2.2) + (NQ Total Score × 1.5) + (GBP/JPY Total Score × 1.6).',
      'Subtracts safe-haven flight: - (Gold 1D Change% × 2.2) - (10Y Treasury Note ZN 1D Change% × 3.0).',
      'Clamped to [5, 95]: >= 60 = Risk-On Expansion, <= 40 = Risk-Off Defensive, 41–59 = Balanced Rotation.'
    ],
    howToTrade: {
      scalper:
        'During Risk-On (>=60), prioritize long momentum on NQ, ES, SOL, and JPY crosses; during Risk-Off (<=40), trade JPY/CHF strength or Gold dips.',
      intraday:
        'Avoid fighting the Risk Regime on breakout days when ES, NQ, and ZN all agree on capital flow direction.',
      swing:
        'Wait for regime shifts across 40/60 boundaries backed by Treasury yield curve direction before scaling into carry or risk-beta trades.'
    },
    readingSignals: [
      '>= 60 RISK-ON: Equities & carry pairs outperform; defensive JPY/CHF/Bonds lag.',
      '<= 40 RISK-OFF: Capital rotates into USD, JPY, CHF, Bonds (ZN/ZB), and Gold.',
      'Each driver chip shows its real-time classification (`Risk-On`, `Risk-Off`, `Neutral`).'
    ],
    relatedIds: ['strength_meter', 'yield_curve_fred', 'gold_scorecard']
  },
  {
    id: 'strength_meter',
    title: 'Multi-Asset Strength Meter (FX · Futures Sectors · Crypto)',
    shortTitle: 'Asset Strength Meter',
    category: 'Futures, Gold & Crypto',
    badge: 'CROSS-ASSET RANK',
    updateCadence: '60s–2m Price/Trend + 30m COT + 60m BIS Macro',
    dataSource: 'G8 Sovereign Scores, 28 FX Pairs, 18 Futures, 10 Crypto',
    summary:
      'Ranks relative strength from -10 to +10 across all 8 major currencies, all 5 Futures sectors, and all 10 institutional Crypto contracts.',
    whatItIs:
      'Strongest-vs-weakest pairing is one of the highest-probability institutional methods. Instead of guessing a single chart in isolation, this meter lets you toggle between G8 Currencies, 5 Futures Sectors, and 10 Crypto assets to spot capital rotation instantly.',
    simpleExplanation: [
      'Every currency, futures sector, and crypto coin is ranked from strongest (top) to weakest (bottom).',
      'In Forex, matching one of the strongest currencies (#1 or #2) against one of the weakest (#7 or #8) points you toward cleaner, smoother trends.',
      'In Futures and Crypto, you can quickly see which entire sector (like Metals or Equity Indices) or coin is leading money inflow right now.'
    ],
    calculationFormula: [
      'FX (8 Currencies): Composite = (Currency Economic Score × 0.60) + (Average FX Scorecard Bias across all pairs containing that currency × 0.40), ranked #1 to #8.',
      'Futures (5 Sectors — Equity Index, Metals, Energy, Rates, Agriculture): Average Swing Total Score across every futures contract in that sector, paired with mean CFTC Non-Commercial Long% and Top/Weakest contract.',
      'Crypto (10 Contracts — BTC through SUI): Ranked #1 to #10 by Swing Total Score with live 1D momentum% and multi-horizon signals.'
    ],
    howToTrade: {
      scalper:
        'In FX, pair rank #1–#2 against rank #7–#8 during overlaps; in Crypto, scalp the #1 relative-strength leader on BTC dips.',
      intraday:
        'Click any Futures Sector or Crypto tile to jump straight to its top contract deep-dive scorecard.',
      swing:
        'Focus swing exposure on wide currency divergence (e.g., #1 Hawkish USD/AUD vs #8 Dovish JPY/CHF) or leading Futures sector accumulation.'
    },
    readingSignals: [
      'Green bars (>= +0.8) indicate net institutional & macro tailwinds.',
      'Red bars (<= -0.8) signal distribution, dovish policy, or structural weakness.',
      'Gold `#1 Top Contract` label on Futures tiles identifies the strongest individual futures ticker in that sector.'
    ],
    relatedIds: ['scanner_matrix', 'carry_scanner', 'futures_crypto_macro']
  },
  {
    id: 'feed_health_cadences',
    title: 'Manna Feed Health & Live Data Refresh Cadences',
    shortTitle: 'Feed Health & Cadences',
    category: 'Technicals, Seasonality & Feeds',
    badge: 'ZERO SYNTHETIC DATA',
    updateCadence: '60s Auto-Poll Timer (Toggleable)',
    dataSource: 'Yahoo Finance, CFTC Socrata, St. Louis FRED, BIS SDMX, World Bank, IMF, ForexFactory',
    summary:
      'Audits live connectivity across all 56 instruments and reports the exact polling TTL and upstream release frequency of all 8 institutional data pipelines.',
    whatItIs:
      'Institutional reliability requires knowing both where every data point comes from and how frequently it refreshes. Every badge across Manna EdgeFinder Pro discloses its exact refresh cadence rather than using an ambiguous "Live" label.',
    simpleExplanation: [
      'Different market reports come out at different speeds in real life—price moves every minute, while weekly hedge-fund positioning comes out every Friday afternoon.',
      'This panel shows you the live countdown timer, whether all 56 markets are connected cleanly, and how often each data feed updates automatically so you always know how fresh your numbers are.'
    ],
    calculationFormula: [
      '1. Live Quotes (Spot/Futures/Crypto): Polled every 60s via Yahoo 15m + Meta quote (Auto-Sync countdown).',
      '2. Intraday M15 / H1 / H4 Structure: Rebuilt every 60s from real 14-day Yahoo 15m OHLC candles.',
      '3. Daily Trend, ADR & 30D History: Cached 2 minutes (120s TTL) from daily exchange bars.',
      '4. US Treasury Yield Curve, DXY & VIX: Cached 5 minutes across Yahoo Treasury tickers (^IRX/^FVX/^TNX/^TYX) and FRED (DGS2, DFII10, T10Y2Y).',
      '5. CFTC COT Reports: Polled every 30 minutes from Socrata (`6dca-aqww`); CFTC publishes upstream weekly Fridays at 15:30 ET.',
      '6. G8 Central Bank Policy, Macro Releases & SEC Smart Money (Form 4 / 13F / Street Targets): Polled every 60 minutes (+ instant calendar surprise updates); 10Y Seasonality refreshes every 6 hours.'
    ],
    howToTrade: {
      scalper:
        'Verify Intraday 15m/H1/H4 reads `LIVE 15M (60s)` and leave Auto-Sync ON during active London/NY sessions.',
      intraday:
        'Click `⟳ Sync Now` just after major 08:30 NY macro releases (CPI, NFP, FOMC) to force immediate recalculation.',
      swing:
        'Check `Feed Cadences` on Friday afternoons after 15:30 ET CFTC releases to catch fresh weekly COT positioning shifts.'
    },
    readingSignals: [
      'LIVE quotes counter should read 56 / 56 across all Forex, Futures, and Crypto symbols.',
      'Cache Age tracks seconds elapsed since the last backend snapshot assembly (max 60s).'
    ],
    relatedIds: ['horizon_engine', 'cot_positioning', 'yield_curve_fred']
  },
  {
    id: 'conviction_radar',
    title: 'Top Conviction Diverging Radar (-10 to +10)',
    shortTitle: 'Conviction Radar',
    category: 'Scanner & Matrix',
    badge: 'RANKED LEADERS',
    updateCadence: '60s Dynamic Horizon Sort',
    dataSource: 'Top 8 Highest |Score| Instruments for Selected Horizon',
    summary:
      'Visualizes the 8 strongest directional opportunities right now for your chosen horizon (Scalper, Intraday, or Swing) plotted from a central zero line.',
    whatItIs:
      'Instead of scanning 56 rows manually, the Diverging Radar immediately bubbles up the highest absolute conviction scores (|Score| closest to 10.0) dynamically filtered by your active Execution Horizon.',
    simpleExplanation: [
      'This chart puts the top 8 clearest market opportunities right at the top of your screen so you do not have to hunt through 56 rows.',
      'Long green bars pushing right show the strongest Buy setups for your chosen trading style (Scalper, Intraday, or Swing). Long red bars pushing left show the strongest Sell setups.'
    ],
    calculationFormula: [
      'Reads `sc.timeframes[selectedHorizon].score` for all 56 assets.',
      'Sorts descending by `Math.abs(score)` and displays the Top 8 instruments.',
      'Green bars extend rightward from center `0` toward `+10` (Bullish); Red bars extend leftward toward `-10` (Bearish).'
    ],
    howToTrade: {
      scalper:
        'Switch to Scalper Mode and inspect top bars for immediate M15 momentum displacement setups.',
      intraday:
        'Use Intraday Mode at London/NY opens to build your 2–3 pair intraday watchlist in seconds.',
      swing:
        'Use Swing Mode at the start of the week to isolate structurally imbalanced pairs (e.g., +7.5 or -8.0).'
    },
    readingSignals: [
      'Longer bar = stronger multi-pillar agreement in your active timeframe.',
      'Click any bar row to open the full Asset Scorecard Deep-Dive.'
    ],
    relatedIds: ['horizon_engine', 'scanner_matrix', 'correlation_matrix']
  },
  {
    id: 'scanner_matrix',
    title: '56-Asset Institutional Scanner Matrix & 3-TF Confluence',
    shortTitle: 'Scanner Matrix',
    category: 'Scanner & Matrix',
    badge: '56 ASSETS',
    updateCadence: '60s Live Auto-Sync',
    dataSource: '28 Forex · 18 Futures · 10 Crypto Live Engine',
    summary:
      'Sortable institutional heatmap matrix combining horizon-specific Edge Scores, 3-Timeframe (`S · I · SW`) alignment, COT Flow, Retail Fade, ADR/MTF volatility, Macro Diff, and Manna Killzone status.',
    whatItIs:
      'The core screening desk of Manna EdgeFinder Pro. It brings FX pairs, Futures contracts (Equity Index, Metals, Energy, Rates, Agriculture), and Crypto assets onto one unified sortable table with watchlist starring and multi-horizon clarity.',
    simpleExplanation: [
      'This main table lets you see every major Forex, Futures, and Crypto market in one view, ranked and filterable by your trading style.',
      'The `S · I · SW` column shows the Scalp, Intraday, and Swing scores side by side—when you see `★ 3/3 TF ALIGNED`, all three trading timeframes agree on the same direction.',
      'The Volatility/ADR column warns you if price has already moved most of its typical daily range so you avoid buying the exact top or selling the exact bottom.'
    ],
    calculationFormula: [
      'Active Horizon Score column (`Scalp`, `Intra`, or `Swing`) renders `sc.timeframes[selectedHorizon].score` on [-10, +10].',
      '3-TF Matrix column (`S · I · SW`) displays `SCALP`, `INTRADAY`, and `SWING` scores side-by-side; `★ 3/3 TF ALIGNED` triggers when all 3 horizons agree in the same direction (all >= +2.0 or all <= -2.0).',
      'ADR / 7-TF MTF column compares today’s High-Low range against 14-day ATR (`dayRangePctOfAtr`), 1H return%, MTF aligned count out of 7 (`M15, H1, H4, 5D, 20D, 50D, Monthly`), and M15 RSI.'
    ],
    howToTrade: {
      scalper:
        'Filter by `3/3 TF Aligned` or sort by `Scalp (M5-15)` descending/ascending, then confirm `ADR` < 95% and active Killzone alignment.',
      intraday:
        'Filter by asset class (`Forex`, `Futures`, `Crypto`) or `Killzone Aligned` to pair fundamental bias with active Manna setups.',
      swing:
        'Use `52W COT Extremes` and `Strong Bias (|Score| >= 5)` filters to isolate major institutional inflection trends.'
    },
    readingSignals: [
      'Star icon (`★`) persists your personal watchlist locally across sessions.',
      'Column headers toggle ascending/descending sort cleanly across numeric metrics and instrument names.'
    ],
    relatedIds: ['horizon_engine', 'cot_positioning', 'retail_contrarian', 'killzone_synergy']
  },
  {
    id: 'correlation_matrix',
    title: '30-Day Cross-Asset Pearson Correlation Heatmap',
    shortTitle: 'Correlation Matrix',
    category: 'Scanner & Matrix',
    badge: 'RISK CLUSTERING',
    updateCadence: '2m Daily Session Series',
    dataSource: '30-Day Daily Close Returns (Yahoo Benchmarks)',
    summary:
      'Measures linear return correlation `r` (`-1.00` inverse to `+1.00` coupled) across 16 benchmark FX, Index, Bond, Commodity, and Crypto markets.',
    whatItIs:
      'Taking three Long positions in `EUR/USD`, `GBP/USD`, and `AUD/USD` simultaneously is not three independent trades—it is triple-leveraged USD short risk. This matrix exposes hidden portfolio overlap and hedging pairs.',
    simpleExplanation: [
      'Green squares near `+1.00` show markets that usually move up and down together (like EUR/USD and GBP/USD, or ES and NQ).',
      'Red squares near `-1.00` show markets that usually move in opposite directions (like US Dollar strength vs Gold).',
      'Check this table before opening several trades at once so you do not accidentally double or triple your risk on the same market move.'
    ],
    calculationFormula: [
      'Computes 30-day daily percentage returns `r_t = (Close_t - Close_{t-1}) / Close_{t-1}` for each asset.',
      'Applies sample Pearson Correlation: `r(X,Y) = Σ((X_i - μ_X)(Y_i - μ_Y)) / sqrt(Σ(X_i - μ_X)² · Σ(Y_i - μ_Y)²)`.',
      'Highlights strong positive coupling (`r >= +0.60`, Green) and strong inverse coupling (`r <= -0.60`, Red).'
    ],
    howToTrade: {
      scalper:
        'Use high-correlation pairs (`EUR/USD` & `GBP/USD`, `ES` & `NQ`, `BTC` & `ETH`, `GC` & `SI`) to spot SMT (Smart Money Technique) divergence at swing highs/lows.',
      intraday:
        'Never double-size on two assets with `r > +0.75` unless intentionally splitting risk (e.g., 0.5% risk each instead of 1% each).',
      swing:
        'Hedge directional macro exposure using assets with `r <= -0.60` (e.g., long Equity Indices vs 10Y Treasury Note / Gold inverse dynamics).'
    },
    readingSignals: [
      '`+0.60 to +1.00` (Green): Assets move tightly together—avoid stacking identical full risk.',
      '`-0.60 to -1.00` (Red): Natural inverse hedge / opposing USD beta.',
      'Near `0.00`: Uncorrelated return streams ideal for portfolio diversification.'
    ],
    relatedIds: ['risk_regime', 'scanner_matrix', 'gold_scorecard']
  },
  {
    id: 'scorecard_gauge',
    title: 'Asset Edge Gauge, Confidence % & HTF Alignment',
    shortTitle: 'Asset Edge Gauge',
    category: 'Scoring & Horizons',
    badge: 'HORIZON GAUGE',
    updateCadence: '60s Live Price + Selected Horizon Score',
    dataSource: 'Active Horizon Profile (`SCALP`, `INTRADAY`, or `SWING`)',
    summary:
      'Displays the active horizon’s [-10, +10] score dial, Bias Classification, Signal Confidence %, and exact actionable note for the selected instrument.',
    whatItIs:
      'Inside the Asset Scorecard Deep-Dive, the top-left Edge Gauge dynamically adapts to whichever horizon you selected (Scalper M5–M15, Intraday H1–H4, or Swing D1–W1) while displaying live price and 1D change%.',
    simpleExplanation: [
      'The speedometer needle moves right into green when buyers hold the upper hand, and left into red when sellers control the market.',
      'Confidence % shows how strongly the underlying indicators agree with one another right now, and HTF Confluence tells you whether a short-term Scalp or Intraday call agrees with the bigger multi-day Swing trend.'
    ],
    calculationFormula: [
      'Gauge score = `timeframes[selectedHorizon].score` clamped to [-10, +10].',
      'Confidence % (32%–97%) combines absolute score magnitude with agreement count across constituent timeframes, reduced when ADR exhaustion warning triggers.',
      'HTF Confluence (`ALIGNED`, `COUNTER_TREND`, `NEUTRAL`) compares Scalp/Intraday directional bias against the Swing macro direction.'
    ],
    howToTrade: {
      scalper:
        'Switch between the 3 side-by-side horizon cards on the right to see if your M15 scalp flows with or against H1/H4 and D1/W1.',
      intraday:
        'Look for >= 65% Confidence with `HTF Confluence: ALIGNED` before deploying full intraday sizing.',
      swing:
        'Inspect the Swing card’s 10Y Seasonality win rate and 52W COT Index before anchoring multi-day holds.'
    },
    readingSignals: [
      'Dial zones: Strong Sell (-10 to -5), Sell (-5 to -2), Neutral (-2 to +2), Buy (+2 to +5), Strong Buy (+5 to +10).',
      'Click any of the three horizon cards (`⚡ SCALPER`, `⏱️ INTRADAY`, `🏛️ SWING`) to switch the active terminal horizon.'
    ],
    relatedIds: ['horizon_engine', 'eleven_pillars', 'killzone_synergy']
  },
  {
    id: 'killzone_synergy',
    title: '7-Timeframe MTF Structure, Daily ADR% & Manna Killzone Synergy',
    shortTitle: '7-TF MTF & Killzones',
    category: 'Technicals, Seasonality & Feeds',
    badge: '7-TF STRUCTURE',
    updateCadence: '60s (15m/H1/H4 + Killzones) / 2m (D1–Monthly)',
    dataSource: 'Yahoo 15m & 1D OHLC + Active Manna Killzone Signals DB',
    summary:
      'Tracks real trend alignment across 7 timeframes (`M15, H1, H4, 5D, 20D, 50D, Monthly`), intraday 1H/4H momentum, Daily ADR% exhaustion, and live Manna Killzone signals.',
    whatItIs:
      'Combining EdgeFinder’s macro/structural edge with Manna Edge Markets’ live Killzone Order-Flow engine prevents traders from buying dead Asia consolidation or shorting into an active NY AM Killzone reversal setup.',
    simpleExplanation: [
      'The 7-Timeframe tiles give you a quick green/red weather check from 15-minute candles all the way up to Monthly structure.',
      'Daily ADR Used % tells you how much of an asset’s normal daily travel has already happened today—once it nears 95%–100%, chasing breakouts gets riskier.',
      'Killzone Synergy checks whether Manna’s active live signal agrees with EdgeFinder’s overall bias (`ALIGNED`) or opposes it (`CONFLICT`).'
    ],
    calculationFormula: [
      '7-TF Matrix: M15 (EMA9/21), H1 (EMA20/50), H4 (EMA12/26) from live 15m bars; plus 5D (return >= ±0.25% vs EMA5), 20D (return >= ±0.4% vs EMA20), 50D (EMA20 vs EMA50), and Monthly (22D return >= ±0.5% vs EMA50).',
      'Daily ADR Used % = `(Today High - Today Low) / 14D ATR × 100`. Volatility Percentile ranks today’s True Range across the last 30 sessions (0–100%ile).',
      'Killzone Synergy: Matches live active setups in `getAllActiveSetups()` by instrument -> `ALIGNED` if active setup bias matches Edge Score sign, `CONFLICT` if opposite, `STANDBY` if no active signal.'
    ],
    howToTrade: {
      scalper:
        'Respect Optimal Session (`ASIA`, `LONDON`, `NY_AM`, `NY_PM`) and avoid chasing breakouts once Daily ADR Used > 95%.',
      intraday:
        'Best A+ setups show `ALIGNED` Killzone Synergy + >= 5/7 MTF agreement + 30–80% ADR consumed.',
      swing:
        'Ensure `5D`, `20D`, `50D`, and `Monthly` tiles share direction before adding swing size.'
    },
    readingSignals: [
      '`ALIGNED` Gold pill = Active Manna Killzone setup confirms quantitative Edge direction for higher-confidence alignment.',
      '`CONFLICT` Red pill = Short-term Killzone setup runs counter to macro edge; wait for resolution or tighten targets.'
    ],
    relatedIds: ['horizon_engine', 'seasonality_killzones', 'eleven_pillars']
  },
  {
    id: 'tug_of_war',
    title: 'Base vs Quote Macro & Liquidity Tug-of-War',
    shortTitle: 'Macro Tug-of-War',
    category: 'Macro & Yields',
    badge: 'HEAD-TO-HEAD',
    updateCadence: '60m BIS/WB Macro + 30m CFTC COT',
    dataSource: 'BIS Central Bank Policy, World Bank/IMF, ForexFactory, CFTC COT',
    summary:
      'Pits the Base currency/asset directly against the Quote currency (or USD Liquidity Regime for Futures & Crypto) across policy rates, growth, inflation, labor, and COT flow.',
    whatItIs:
      'Pairs only sustain trends when one leg exhibits clear structural superiority over the other. Tug-of-War highlights in green/red which side holds the macro advantage on every key metric.',
    simpleExplanation: [
      'Every currency pair is a tug-of-war between the left currency (Base) and right currency (Quote)—or between a Futures/Crypto contract and the US Dollar liquidity environment.',
      'Each row compares interest rates, economic growth, inflation, jobs, and hedge-fund demand side by side, lighting up whichever side currently holds the stronger hand.'
    ],
    calculationFormula: [
      'Forex pairs compare Base Economy vs Quote Economy side-by-side: Policy Rate (adv threshold ±0.25%), GDP QoQ (±0.3%), Core CPI YoY (±0.3%), Unemployment inverse (±0.4%), Composite Economy Score (±0.5), and CFTC Non-Commercial Long% vs Short%.',
      'Futures & Crypto compare Asset Beta / Commodity-Index sensitivity against the USD Liquidity Regime (Fed Funds Stance, US GDP, US Core CPI, US PMI/Unemployment, and Contract COT Managed Money).'
    ],
    howToTrade: {
      scalper:
        'Check Tug-of-War quickly to identify which side represents the path of least macro resistance on stop-runs.',
      intraday:
        'Favor breakouts in the direction favored by at least 4 out of 6 Tug-of-War rows.',
      swing:
        'Look for clean asymmetric mismatches—such as Higher Rate + Faster GDP + Strong COT on the same side.'
    },
    readingSignals: [
      'Green highlight on Left (`BASE`) supports LONG setups; Red highlight on Right (`QUOTE`) supports SHORT setups.',
      'Mixed rows signal balanced fundamentals—rely more heavily on technical levels and Killzone timing.'
    ],
    relatedIds: ['sovereign_macro_matrix', 'eleven_pillars', 'carry_scanner']
  },
  {
    id: 'historical_score_chart',
    title: '30-Day Price vs Historical Edge Score Overlay',
    shortTitle: '30D Score vs Price',
    category: 'Technicals, Seasonality & Feeds',
    badge: 'DUAL OVERLAY',
    updateCadence: '2m Daily Bars + Weekly CFTC Backfill',
    dataSource: 'Yahoo 30D Daily Closes + Historical Weekly CFTC COT Series',
    summary:
      'Dual-axis chart plotting 30-day asset Price (Gold line) against its reconstructed daily Historical Swing Edge Score (Cyan line).',
    whatItIs:
      'Verifies empirically whether rising Edge Scores preceded price expansion or when price has disconnected ahead of quantitative institutional backing.',
    simpleExplanation: [
      'The Gold line shows where price moved over the past 30 trading days, while the Cyan line tracks how bullish or bearish the Edge Score was on each day.',
      'When both lines rise together, institutional fundamentals and price momentum are marching in lockstep.',
      'When price makes a new high while the Cyan score line begins dropping, it often signals waning buyer conviction behind the rally.'
    ],
    calculationFormula: [
      'For each of the last 30 trading days `t`, recalculates local rolling `EMA20` vs `EMA50` trend signal (`±1.25`).',
      'Looks up the exact historical weekly CFTC report active on date `t` (`w.reportDate <= dateStr`) to compute point-in-time COT (`±1.5`) and Retail Fade (`±1.0`) contributions.',
      'Combines fixed fundamental/seasonal/Killzone weights with point-in-time trend and positioning on [-10, +10].'
    ],
    howToTrade: {
      scalper:
        'Note whether the Cyan Score line has stayed pinned bullish (>+4) over the past week so you buy M15 pullbacks with trend tailwind.',
      intraday:
        'Spot regime pivots where the Cyan line crosses above/below zero alongside Price breaking EMA20.',
      swing:
        'Look for bullish/bearish divergences where Score turns sharply days before price breaks out of 30D range.'
    },
    readingSignals: [
      'Cyan > +2 rising alongside Gold price = healthy trend continuation.',
      'Score flattening or dropping below zero while Price stays high warns of distribution.'
    ],
    relatedIds: ['eleven_pillars', 'cot_positioning', 'scorecard_gauge']
  },
  {
    id: 'eleven_pillars',
    title: '11-Pillar Institutional Drivers (Swing D1–W1 View)',
    shortTitle: '11-Pillar Swing Model',
    category: 'Scoring & Horizons',
    badge: '11 EDGE DRIVERS',
    updateCadence: '60s–60m Multi-Feed Composite',
    dataSource: 'CFTC, Yahoo Finance, BIS, World Bank, IMF, ForexFactory, Manna Engine',
    summary:
      'Breaks down the 11 institutional forces—Macro Fundamentals, Smart Money COT, Retail Positioning, Seasonality, Daily Trend, and Manna Order-Flow—that shape an asset’s overall Swing bias from -10 to +10.',
    whatItIs:
      'No black boxes. Every overall Edge Score combines five clear pillars of institutional market behavior: Sentiment, Technical Trend, Seasonality, Economic Fundamentals, and Manna Killzone Order-Flow.',
    simpleExplanation: [
      'Each card shows whether a specific economic or market driver is currently pushing the asset Bullish (Green), Bearish (Red), or Neutral (Gold).',
      'Core economic drivers (central bank interest rates, inflation, growth, and jobs) are paired with institutional COT futures demand and retail contrarian positioning.',
      'You do not need to calculate anything manually—simply scan whether most pillars glow green or red and check which fundamental reason explains why the market is moving.'
    ],
    calculationFormula: [
      'Sentiment (2.50): COT Smart Money [w=1.50] + Retail Contrarian Small Spec [w=1.00].',
      'Statistical & Technical (2.00): 10Y Live Seasonality [w=0.75] + Daily EMA20/50 & RSI Trend [w=1.25].',
      'Fundamentals (4.75): Interest Rate Diff / Real Yield [w=1.25] + GDP Growth Diff [w=0.75] + Core CPI Inflation [w=0.75] + Employment Advantage [w=0.75] + PMI Momentum [w=0.75] + Retail & News Surprise [w=0.50].',
      'Manna Flow (0.75): Active Manna Killzone Setup Alignment [w=0.75].',
      'Each pillar emits signal `-1`, `0`, or `+1` multiplied by weight `w`, summed and clamped to `[-10, +10]`.'
    ],
    howToTrade: {
      scalper:
        'Use the 11 pillars as your macro directional filter while executing off the higher-frequency M15/H1 Scalper score.',
      intraday:
        'Check that Fundamentals + Technical Trend aren’t fighting your intraday setup.',
      swing:
        'Require multi-pillar alignment across Fundamentals, COT, and Daily Trend (>= +5.0 or <= -5.0) for multi-week holds.'
    },
    readingSignals: [
      'Major macro drivers (Interest Rates, CFTC Smart Money, and Daily Trend) anchor multi-week structural direction.',
      'Neutral drivers indicate the difference between both currencies or macro legs is currently too narrow to give a strong edge.'
    ],
    relatedIds: ['horizon_engine', 'scorecard_gauge', 'tug_of_war']
  },
  {
    id: 'gold_scorecard',
    title: 'Dedicated 7-Pillar COMEX Gold (`GC / XAU`) Macro Model',
    shortTitle: 'Gold 7-Pillar Model',
    category: 'Futures, Gold & Crypto',
    badge: 'GOLD SPECIALIST',
    updateCadence: '5m Real Yields/DXY/VIX · 30m CFTC · 60s Gold Price',
    dataSource: 'FRED DFII10 (10Y TIPS), DXY, CBOE VIX, COMEX GC & SI, CFTC 088691',
    summary:
      'Specialized 7-factor Gold valuation engine built around the true institutional drivers of bullion: US 10Y TIPS Real Yields, DXY Inverse Dollar Flow, VIX Haven Bid, and COMEX Positioning.',
    whatItIs:
      'Gold does not trade like an ordinary currency pair—it is a zero-yielding monetary hedge driven primarily by real interest rates (`DFII10`), US Dollar liquidity (`DXY`), and systemic volatility (`VIX`).',
    simpleExplanation: [
      'Gold prefers falling inflation-adjusted US yields (because holding Gold costs less when bonds pay less) and a weaker US Dollar.',
      'When market fear rises (higher VIX) or large COMEX funds increase Gold futures buying, this specialized 7-driver model shifts Bullish.',
      'The Gold/Silver Ratio tells you whether Gold is expensive or cheap compared to Silver—helping metals traders pick which precious metal has catch-up potential.'
    ],
    calculationFormula: [
      '10Y TIPS Real Yield [w=2.25]: Bullish (+1) if DFII10 <= 1.20%, Bearish (-1) if >= 2.20%.',
      'DXY Inverse Flow [w=1.75]: Bullish if DXY <= 99 or 1D <= -0.20%; Bearish if DXY >= 105 or 1D >= +0.25%.',
      'COMEX Gold 52W COT Index [w=1.75]: Bullish if 52W percentile >= 60%; Bearish if <= 35%.',
      'VIX Haven [w=1.25]: Bullish if VIX >= 21; Bearish if <= 13.',
      'Gold/Silver Ratio [w=1.00], 10Y Monthly Gold Seasonality [w=1.00], and Fed Policy / Core CPI [w=1.00]. Total max weight = 10.0.'
    ],
    howToTrade: {
      scalper:
        'Check DXY 1D% and Real Yield direction before scalping GC/XAU around COMEX 08:20–10:30 NY Killzone opens.',
      intraday:
        'Watch Silver (`SI`) vs Gold (`GC`) via the Gold/Silver Ratio and SMT divergence at London/NY opens.',
      swing:
        'Strongest Gold bull swings happen when `DFII10` drops, `DXY` weakens, and `52W COT Index` rises from cyclical lows.'
    },
    readingSignals: [
      '30-Day Gold (Gold) vs DXY (Cyan) chart reveals inverse macro breakdowns or catch-up rallies.',
      'GSR >= 85 flags Silver relatively undervalued vs Gold; GSR <= 65 flags Silver leading metals higher.'
    ],
    relatedIds: ['yield_curve_fred', 'cot_positioning', 'futures_crypto_macro']
  },
  {
    id: 'carry_scanner',
    title: 'Multi-Asset Carry, Futures Roll Yield & Crypto Basis Scanner',
    shortTitle: 'Carry, Roll & Funding',
    category: 'Futures, Gold & Crypto',
    badge: '56-ASSET CARRY',
    updateCadence: '5m FRED 3M T-Bill · 30m CFTC · 60m BIS Rates',
    dataSource: 'BIS Central Bank Policy Rates, FRED 3M Bill (^IRX), CFTC Positioning, Spot Trends',
    summary:
      'Ranks all 56 assets—FX interest rate carry, Futures curve roll/cost-of-carry, and Crypto CME/Perp funding basis—scaled by daily volatility (Carry/ATR Ratio).',
    whatItIs:
      'Carry is the institutional yield earned simply for holding a position over time, normalized against how volatile the asset is. Expanding beyond FX, EdgeFinder computes real Treasury curve carry, Futures backwardation/contango regime, and Crypto basis funding.',
    simpleExplanation: [
      'In Forex, holding a higher-interest-rate currency against a lower-interest-rate currency naturally attracts institutional capital over time.',
      'In Futures and Crypto, this scanner checks bond yield curves, commercial hedger tightness, and funding demand so you can spot whether holding costs help or hurt a trade.',
      'Look for the `CARRY + EDGE ALIGNED` tag to find markets where overnight yield and macro direction point the exact same way.'
    ],
    calculationFormula: [
      'Forex (28 Pairs · `FX_RATE_DIFF`): `Spread = Base CB Rate - Quote CB Rate` (bps = Spread × 100). `Carry / ATR Ratio = |Spread%| / ATR%`.',
      'Futures Rates (`ZN`, `ZB` · `FUTURES_ROLL_YIELD`): True curve duration spread (`10Y` or `30Y` Treasury yield minus US 3M T-Bill `m3`). Positive spread = positive roll down the yield curve.',
      'Futures Commodities/Indices (`FUTURES_ROLL_YIELD`): Combines CFTC Commercial Hedger tightness `(commLongPct - 50)*0.14` + 20D trend slope vs US 3M T-Bill cost-of-carry.',
      'Crypto (`CRYPTO_FUNDING_BASIS`): Estimates implied annualized CME/perp basis from CFTC Non-Commercial skew, Retail leverage heat, and 5D momentum over US 3M risk-free funding.'
    ],
    howToTrade: {
      scalper:
        'Use the active horizon column (`S / I / SW`) to confirm short-term entries never fight extreme funding costs.',
      intraday:
        'In FX, positive Carry + Aligned Edge (`CARRY + EDGE ALIGNED`) attracts institutional Tokyo/London rollover demand.',
      swing:
        'Sort descending by `Carry / ATR Ratio` to find high yield spread relative to low daily volatility—prime institutional carry compounding trades.'
    },
    readingSignals: [
      'Carry / ATR Ratio >= 4.0x signals high interest yield per unit of daily price risk.',
      '`CARRY + EDGE ALIGNED` highlights assets where carry direction matches Swing conviction (>= +1.5 / <= -1.5).'
    ],
    relatedIds: ['yield_curve_fred', 'sovereign_macro_matrix', 'strength_meter']
  },
  {
    id: 'cot_positioning',
    title: 'CFTC Commitments of Traders (COT), 52W Index & Z-Score',
    shortTitle: 'CFTC COT & 52W Index',
    category: 'COT & Sentiment',
    badge: 'INSTITUTIONAL FLOW',
    updateCadence: 'Polled Every 30m (CFTC Publishes Fridays 15:30 ET)',
    dataSource: 'Official CFTC Legacy Futures API (`publicreporting.cftc.gov/resource/6dca-aqww.json`)',
    summary:
      'Decodes weekly futures positioning across Hedge Funds (Non-Commercials) and Commercial Hedgers for all 56 Forex, Futures, and Crypto assets—including 52-week extremes.',
    whatItIs:
      'Every Tuesday (released Friday 15:30 ET), the CFTC reports exact contract counts held by large institutional speculators (`Non-Commercial`) vs corporate hedgers (`Commercial`). EdgeFinder automates 52 weeks of history, Cross-FX leg pairing, and `USD/*` IMM inversion.',
    simpleExplanation: [
      'This report shows real-money futures positions held by large hedge funds ("Non-Commercials") and commercial corporations ("Commercials"), updated from official weekly government filings.',
      'When large funds steadily buy more contracts week over week (`WoW`), it tells you big money is building positions in that direction.',
      'The `52W COT Index` tells you whether fund positioning is near a 1-year extreme high (80%–100%) or extreme low (0%–20%), alerting you when a crowded trend might pause or turn.'
    ],
    calculationFormula: [
      'IMM & Cross Pairing: `USD/*` pairs (USD/JPY, USD/CAD, USD/CHF) invert foreign IMM futures. Cross FX pairs (`EUR/GBP`, `GBP/JPY`, etc.) net Base futures positions against inverted Quote futures positions.',
      'Non-Commercial Long% = `noncommLong / (noncommLong + noncommShort) × 100`. Signal = `+1` if >= 55%, `-1` if <= 45%.',
      '52-Week Percentile COT Index = `(Latest Net - 52W Min Net) / (52W Max Net - 52W Min Net) × 100`.',
      '52-Week Z-Score = `(Latest Net - 52W Mean Net) / 52W StdDev Net`.',
      'Extreme Flags: `BULLISH_EXTREME` when 52W Index >= 80% or Z >= +1.50; `BEARISH_EXTREME` when <= 20% or Z <= -1.50.'
    ],
    howToTrade: {
      scalper:
        'Check Week-over-Week (`WoW`) net contract changes and avoid shorting into aggressive fresh institutional accumulation.',
      intraday:
        'Use the 12-Week Net Positioning chart to verify whether Commercials and Funds are trending monotonically.',
      swing:
        'Combine `BULLISH_EXTREME` / `BEARISH_EXTREME` reversals off 0%–20% or 80%–100% 52W Index bounds with Daily structure shifts for major multi-week tops/bottoms.'
    },
    readingSignals: [
      'Yellow `WoW +Contracts` shows fresh weekly fund inflows; rising Commercial Long% near lows often signals smart hedging bottoms.',
      'Every Crypto contract (`BTC`..`SUI`) pulls live CFTC CME or Coinbase Derivatives regulated data.'
    ],
    relatedIds: ['retail_contrarian', 'eleven_pillars', 'futures_crypto_macro']
  },
  {
    id: 'smart_money_tracker',
    title: 'Smart Money Tracker (SEC Form 4, 13F Whales & Street Targets)',
    shortTitle: 'SEC Form 4 & 13F',
    category: 'COT & Sentiment',
    badge: 'EQUITY & CRYPTO FLOW',
    updateCadence: '60m Live Sync',
    dataSource: 'Yahoo Finance Institutional Ownership (13F), SEC Form 4 Filings & Analyst Consensus',
    summary:
      'Tracks corporate insider buys/sales (Form 4), largest institutional fund stakes (13F Whales), and Wall Street consensus upside targets across macro & crypto bellwethers.',
    whatItIs:
      'Macro, Indices, Metals, Energy, and Crypto correlate tightly with bellwether corporate capital (`NVDA, AAPL, MSFT, AMZN, TSLA, JPM, GS, XOM, NEM, FCX, COIN, MSTR`). Monitoring insider conviction and 13F whale rotation adds micro equity confirmation to macro index and crypto calls.',
    simpleExplanation: [
      'Watch what company executives (Form 4 Insiders) and giant institutional funds (13F Whales) are actually buying or selling with their own money.',
      'Bellwether tech stocks (`NVDA`, `AAPL`, `MSFT`) lead the Nasdaq (`NQ`), big banks (`JPM`, `GS`) reflect financial health (`ES`), mining giants (`NEM`, `FCX`) track Gold and Copper, and `COIN`/`MSTR` track institutional Crypto appetite.',
      'Street Price Targets compare Wall Street analyst average targets against current market price to show expected upside or downside.'
    ],
    calculationFormula: [
      'Wall Street Targets: Extracts `targetLowPrice`, `targetMeanPrice`, `targetHighPrice`, recommendation rating, and analyst coverage count (`upsidePct = (targetMean - currentPrice) / currentPrice × 100`).',
      'SEC Form 4 Insiders: Parses latest Officer/Director transactions (`BUY`, `SELL`, `OTHER`), shares, USD value, and filing date sorted newest-first.',
      '13F Whales: Aggregates top institutional holders, % ownership, QoQ stake change%, and position market value.'
    ],
    howToTrade: {
      scalper:
        'Check `COIN` / `MSTR` consensus & `NVDA` / `JPM` sentiment as pre-market catalysts when trading `NQ`, `ES`, or `BTC/USD`.',
      intraday:
        'Use high-implied-upside Strong Buy bellwethers or cluster insider buys as sector bias confirmation during 09:30 NY Cash Open.',
      swing:
        'Monitor rising 13F whale QoQ accumulation alongside `NEM`/`FCX`/`XOM` for commodities (`GC`/`HG`/`CL`) and `COIN`/`MSTR` for Crypto.'
    },
    readingSignals: [
      'Clustered Officer/Director open-market `BUY` filings carry significantly higher signal value than routine option sales.',
      'Positive `QoQ` stake change among mega-funds confirms long-only institutional sponsorship.'
    ],
    relatedIds: ['risk_regime', 'futures_crypto_macro', 'cot_positioning']
  },
  {
    id: 'retail_contrarian',
    title: 'Retail Crowd Contrarian Radar (Small Speculator Fade)',
    shortTitle: 'Retail Contrarian',
    category: 'COT & Sentiment',
    badge: 'LIQUIDITY FADE',
    updateCadence: '30m Poll (CFTC Weekly Non-Reportables)',
    dataSource: 'CFTC Non-Reportable Small Speculators (Long vs Short Split)',
    summary:
      'Fades crowded retail/small-speculator positioning to identify stop-hunt liquidity pools across all 56 Forex, Futures, and Crypto markets.',
    whatItIs:
      'Small non-reportable speculators tend to average into losing trends and crowd at extremes right before institutional liquidity sweeps. EdgeFinder tracks their exact Long/Short ratio directly from CFTC Non-Reportable contract data—never fabricated percentages.',
    simpleExplanation: [
      'Historically, small retail speculators tend to pile into the wrong side right near market turns or before institutional stop hunts.',
      'The green/red bar shows what small traders are actually holding. When the Contrarian Signal says `BULLISH`, it means the small-trader crowd is heavily Short—so institutions often hunt stops upward.',
      'Look for gold `CROWD EXTREME` borders where 65% or more of small speculators are stuck leaning on one side.'
    ],
    calculationFormula: [
      'Crowd Long% = `nonreptLong / (nonreptLong + nonreptShort) × 100`. Short% = `100 - Crowd Long%`.',
      'Contrarian Bearish (`-1`): triggered when Crowd Long >= 56.0%.',
      'Contrarian Bullish (`+1`): triggered when Crowd Short >= 56.0%.',
      'Crowd Extreme Alert (`CROWD EXTREME` gold border): triggered when either side reaches >= 65.0%.'
    ],
    howToTrade: {
      scalper:
        'Identify which side retail traders are trapped on (`65%+` crowded) and expect Killzone liquidity sweeps through that side’s stop orders.',
      intraday:
        'Best fading signal occurs when Small Specs are >= 65% Long while Large Speculators (COT) are Net Short.',
      swing:
        'Use Retail Contrarian as confirmation for turning points when COT also hits a 52W extreme.'
    },
    readingSignals: [
      'Green/Red split bar shows raw Crowd Long% vs Crowd Short%.',
      'The Contrarian Signal badge flips the crowd direction so green BULLISH (+1) means retail is heavily Short.'
    ],
    relatedIds: ['cot_positioning', 'scanner_matrix', 'eleven_pillars']
  },
  {
    id: 'seasonality_killzones',
    title: '10-Year Monthly Seasonality & Killzone Affinity Matrix',
    shortTitle: '10Y Seasonality & KZ',
    category: 'Technicals, Seasonality & Feeds',
    badge: '10Y HISTORICAL',
    updateCadence: '6h Yahoo 10Y Monthly Refresh',
    dataSource: 'Up to 10 Years Real Monthly Open-to-Close Closes (Yahoo Finance)',
    summary:
      'Computes average monthly return% and positive win-rate% across the past 10 years for every asset (up to max available history on newer crypto), paired with optimal ICT Killzone session.',
    whatItIs:
      'Fiscal tax cycles, commodity harvests, holiday liquidity, and bond refunding create recurring seasonal tendencies. Combining monthly historical probabilities with each instrument’s highest-displacement intraday Killzone aligns timing across macro and intraday execution.',
    simpleExplanation: [
      'This calendar checks the past 10 years of real market history for every month of the year so you can see whether an asset usually climbs or falls during the current month.',
      'Switch between `Avg Monthly Return (%)` and `Win Rate (%)` to see both how much an asset tends to move and how often it finished that month green.',
      'Each asset also shows its `Best KZ` (Asia, London, NY AM, or NY PM)—the exact session when liquidity and price movement are sharpest.'
    ],
    calculationFormula: [
      'Fetches 10 years of monthly OHLC bars (`interval: 1mo`) per instrument.',
      'Monthly Return `m` = mean of `((Close - Open) / Open) × 100` for calendar month `m`.',
      'Positive Win Rate = `count(Close > Open) / count(Total Years) × 100`.',
      'Seasonality Score (`w=0.75`): `+1` if current UTC month avg >= +0.35% AND win rate >= 55%; `-1` if <= -0.35% AND win rate <= 45%; else `0`.'
    ],
    howToTrade: {
      scalper:
        'Use each asset’s `Best KZ` (`ASIA`, `LONDON`, `NY_AM`, `NY_PM`) to focus your M5/M15 screen time strictly when institutional volume peaks.',
      intraday:
        'Combine a >= 70% Positive Win Rate month with aligned Intraday H1/H4 structure.',
      swing:
        'Avoid initiating counter-seasonal multi-week trades during historically lopsided months (e.g., <30% or >75% win-rate months).'
    },
    readingSignals: [
      'Gold cell outline highlights the current UTC calendar month across all 56 assets.',
      'Toggle between `Avg Monthly Return (%)` and `10Y Positive Win Rate (%)` above the matrix.'
    ],
    relatedIds: ['killzone_synergy', 'eleven_pillars', 'historical_score_chart']
  },
  {
    id: 'yield_curve_fred',
    title: 'US Treasury Yield Curve (`3M–30Y`), Real Yields & FRED US Macro',
    shortTitle: 'Yield Curve & FRED',
    category: 'Macro & Yields',
    badge: 'BOND & LIQUIDITY',
    updateCadence: '5m Yahoo Yields + St. Louis FRED CSV Sync',
    dataSource: 'Yahoo (`^IRX`, `^FVX`, `^TNX`, `^TYX`, `DXY`, `^VIX`, `^GSPC`, `^W5000`) + FRED (`DGS2`, `DFII10`, `T10Y2Y`, `PAYEMS`, `HOUST`, `M2SL`, `GDP`)',
    summary:
      'Tracks the full US Treasury term structure (`3M, 2Y, 5Y, 10Y, 30Y`), curve regime, 10Y TIPS Real Yield, Nonfarm Payrolls, M2 liquidity, Housing Starts, and the Buffett Indicator.',
    whatItIs:
      'Sovereign bond markets lead every asset class. An inverted curve prices slowing growth and eventual rate cuts; rising `DFII10` real yields tighten financial conditions across tech, gold, and crypto; expanding M2 liquidity fuels risk assets.',
    simpleExplanation: [
      'Interest rates on US government bonds set the borrowing cost for the entire global financial system.',
      'When short-term yields (3M or 2Y) pay more than long-term 10Y yields, the curve is "Inverted"—historically warning of tighter economic growth ahead.',
      'Watch `10Y TIPS Real Yield`: when inflation-adjusted bond yields fall, Gold and Bitcoin generally perform better; when they jump sharply, Tech stocks (`NQ`) and Gold face headwinds.'
    ],
    calculationFormula: [
      'Curve Regime: `Inverted Curve` if `10Y - 2Y < -0.05%` or `10Y - 3M < -0.05%`; `Normal Steepening` if `10Y - 2Y >= +0.25%` AND `10Y - 3M >= +0.15%`; else `Flat Curve`.',
      'Buffett Indicator = `(Wilshire 5000 Index Cap / US Nominal GDP in Billions) × 100` (`>= 160%` indicates stretched equity valuation).',
      'NFP Monthly Change = latest `PAYEMS` minus previous month print in thousands of jobs.'
    ],
    howToTrade: {
      scalper:
        'Watch 10Y yield (`^TNX`) and DXY intraday spikes when scalping `USD/JPY`, `NQ`, or `GC` during NY AM.',
      intraday:
        'Sharp bull-steepening (2Y dropping faster than 10Y) typically triggers strong `GC` and `ZN/ZB` intraday rallies.',
      swing:
        'Follow M2 Money Supply trends and `DFII10` real yields for multi-week structural positioning in Crypto (`BTC/USD`) and Precious Metals.'
    },
    readingSignals: [
      'Negative `10Y - 2Y` or `10Y - 3M` spread in Red confirms curve inversion.',
      'Lower 10Y TIPS Real Yield boosts Gold & Bitcoin monetary-hedge scores.'
    ],
    relatedIds: ['gold_scorecard', 'carry_scanner', 'sovereign_macro_matrix']
  },
  {
    id: 'sovereign_macro_matrix',
    title: 'G8 Central Bank Policy Matrix, Rate Odds & Multi-Year History',
    shortTitle: 'G8 Central Banks',
    category: 'Macro & Yields',
    badge: 'G8 SOVEREIGN HUB',
    updateCadence: '60m BIS/WB/IMF + Live ForexFactory Calendar Surprises',
    dataSource: 'BIS Policy Rate SDMX, World Bank WDI, IMF DataMapper & ForexFactory NewsEngine',
    summary:
      'Unifies central bank policy rates, stance (`Hawkish / Neutral / Dovish`), quantitative Hike/Hold/Cut probability odds, 6Y sovereign history charts, and Super Admin live overrides.',
    whatItIs:
      'Currency trends are ultimately repricings of central bank expectations. This hub pulls live official policy rates (BIS), multi-year GDP/CPI/Unemployment (IMF & World Bank), and real-time economic release surprises from Manna’s NewsEngine.',
    simpleExplanation: [
      'Every major economy’s central bank raises rates ("Hawkish") to fight inflation or lowers rates ("Dovish") to boost growth—and big money follows higher-yielding, stronger economies.',
      'The table summarizes each G8 country’s interest rate, growth, inflation, jobs, and estimated odds of a rate Hike, Hold, or Cut at its next meeting.',
      'Click any currency pill in the Multi-Year Explorer below to see 6 years of real economic trends and upcoming high-impact calendar events.'
    ],
    calculationFormula: [
      'Economy Score (`-10 to +10`): Weighs Policy Rate level, Stance (`±1.5`), GDP QoQ (`-1.5 to +2.0`), Core CPI (`±1.25`), Composite PMI (`±1.5`), Unemployment (`-1.25 to +1.0`), Retail MoM (`±0.75`), and News Surprise Score (`±2.0`).',
      'Implied Rate Probabilities (`Hike% / Hold% / Cut%`): Softmax exponential model over Core CPI gap vs `2.2%`, GDP gap vs `1.5%`, rate delta, unemployment gap vs `4.4%`, real rate (`rate - CPI`), and news surprise—always summing to `100%`.'
    ],
    howToTrade: {
      scalper:
        'Check upcoming `HIGH IMPACT` NewsEngine releases at the bottom of the Macro tab to avoid spread spikes around data prints.',
      intraday:
        'Trade the post-release Surprise drift when actual prints diverge strongly from consensus forecast on CPI, NFP, or GDP.',
      swing:
        'Pair High-Rate Hawkish currencies (`economicScore >= +3`) against Low-Rate Dovish currencies (`economicScore <= -2`).'
    },
    readingSignals: [
      'Click any currency pill (`USD`–`NZD`) in the Multi-Year Explorer to inspect its 12M policy rate & 6Y GDP/CPI/Jobless trajectories.',
      'Super Admins can click `Edit` on any G8 row to test central bank rate-shock overrides across all 56 asset scorecards instantly.'
    ],
    relatedIds: ['tug_of_war', 'carry_scanner', 'yield_curve_fred']
  },
  {
    id: 'futures_crypto_macro',
    title: 'Futures Sector Rotation & Crypto Institutional Regime Matrix',
    shortTitle: 'Futures & Crypto Hub',
    category: 'Futures, Gold & Crypto',
    badge: '18 FUT + 10 CRYPTO',
    updateCadence: '60s Prices/15m · 30m CFTC COT · 5m US Yields',
    dataSource: '18 CME/CBOT/COMEX/NYMEX Futures + 10 CME/Coinbase Derivatives Crypto Contracts',
    summary:
      'Dedicated institutional desk tracking capital rotation across all 5 Futures Sectors (Equity Index, Metals, Energy, Rates, Agriculture) and all 10 CFTC-regulated Cryptoassets.',
    whatItIs:
      'Extends EdgeFinder beyond Forex so futures index/commodity traders and crypto traders get sector breadth, CFTC Speculative Long%, and multi-timeframe (`Scalp / Intra / Swing`) alignment for every contract.',
    simpleExplanation: [
      'Shows all 5 Futures groups—Equity Indices, Metals, Energy, Rates, and Agriculture—plus all 10 major Crypto markets in one clean view.',
      'Green sectors (`Accumulation`) show where big funds are leaning bullish; Red sectors (`Distribution`) show where money is flowing out.',
      'Click any sector card or Crypto coin row to open its full multi-timeframe scorecard and see how Scalp, Intraday, and Swing compare.'
    ],
    calculationFormula: [
      'Futures Sectors (`Equity Index`, `Metals`, `Energy`, `Rates`, `Agriculture`): Averages component contracts’ Swing scores, 1D momentum, and CFTC Long%, classifying `Institutional Accumulation` (>= +2.0), `Institutional Distribution` (<= -2.0), or `Mixed`.',
      'Futures/Crypto Macro Scoring adjusts macro weights by asset class—treating High Real Rates/Hawkish Fed as headwinds to Tech/Crypto/Bonds/Metals while tracking CPI as a commodity/hard-asset tailwind.'
    ],
    howToTrade: {
      scalper:
        'In Crypto (`BTC`..`SUI`), trade NY Cash Equities Open (`09:30–11:30 NY`) or Asia (`XRP`/`SUI`) with attention to `BTC` SMT correlation.',
      intraday:
        'Trade the leading contract in the strongest Futures sector (`#1 Rank`) during its peak exchange open (`NY_AM` for ES/NQ/GC/CL/ZC; `LONDON` for BZ/HG; `ASIA` for NKD).',
      swing:
        'Combine Agriculture (`ZC/ZS/ZW`) or Energy (`CL/BZ/NG`) Commercial Hedger positioning extremes with 10Y seasonality windows.'
    },
    readingSignals: [
      'Click any Futures sector card or Crypto row to jump directly into its 11-pillar + 3-horizon Asset Scorecard.',
      'Compare `Scalp / Intra / Swing` chips on each Crypto row to avoid buying an overextended M15 spike in a bearish H4 trend.'
    ],
    relatedIds: ['strength_meter', 'carry_scanner', 'cot_positioning', 'gold_scorecard']
  }
];

export const EDGE_FINDER_KB_MAP: Record<EdgeFinderKbTopicId, EdgeFinderKbTopic> = EDGE_FINDER_KB_TOPICS.reduce(
  (acc, topic) => {
    acc[topic.id] = topic;
    return acc;
  },
  {} as Record<EdgeFinderKbTopicId, EdgeFinderKbTopic>
);

export function getEdgeFinderKbTopic(id: EdgeFinderKbTopicId): EdgeFinderKbTopic {
  return EDGE_FINDER_KB_MAP[id] || EDGE_FINDER_KB_TOPICS[0];
}
