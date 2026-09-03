export interface DecisionMatrixFactorScores {
  conviction: number;      // 0 - 100 (25%)
  winrate: number;         // 0 - 100 (25%)
  liquiditySweep: number;  // 0 - 100 (15%)
  riskReward: number;      // 0 - 100 (15%)
  timing: number;          // 0 - 100 (10%)
  proximity: number;       // 0 - 100 (10%)
}

export interface AssetDecisionItem {
  id: string;
  instrument: string;
  market: 'futures' | 'forex' | string;
  bias: 'long' | 'short' | string;
  signal_state: string;
  conviction_score: number;
  entry_zone_low: number;
  entry_zone_high: number;
  entry_zone_mid: number;
  stop: number;
  tp1: number;
  r_multiple_1: number;
  current_price?: number;
  distance_in_r?: number;
  is_in_zone: boolean;
  
  // Matrix calculated metrics
  priority_score: number;       // 0 - 100
  priority_tier: 'IMMINENT_FOCUS' | 'HIGH_ATTENTION' | 'MONITORING' | 'LOW_PRIORITY';
  actionable_recommendation: 'EXECUTE_OR_ARM' | 'ARM_ORDER' | 'MONITOR_STRUCTURE' | 'STAND_BY';
  status_label: string;
  rank: number;
  
  factors: DecisionMatrixFactorScores;
  killzone_origin?: string;
  opposing_strategy_warning?: string;
}

export interface NewsEvent {
  currency: string;
  title: string;
  impact: 'high' | 'medium' | 'low';
  time: string;
}

export function getCurrentKillzone(dateStr?: string): { name: string; isActive: boolean; score: number } {
  const now = dateStr ? new Date(dateStr) : new Date();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const totalUtcMinutes = utcHours * 60 + utcMinutes;

  if (totalUtcMinutes >= 420 && totalUtcMinutes <= 600) {
    return { name: 'london', isActive: true, score: 100 };
  }
  if (totalUtcMinutes >= 720 && totalUtcMinutes <= 900) {
    return { name: 'ny_am', isActive: true, score: 100 };
  }
  if (totalUtcMinutes >= 1080 && totalUtcMinutes <= 1200) {
    return { name: 'ny_pm', isActive: true, score: 100 };
  }
  if (totalUtcMinutes >= 0 && totalUtcMinutes <= 240) {
    return { name: 'asia', isActive: true, score: 75 };
  }

  return { name: 'off_hours', isActive: false, score: 35 };
}

function getRelevantCurrencies(instrument: string, market: string): string[] {
  const inst = instrument.toUpperCase();
  if (market === 'forex') {
    const parts = inst.split('/');
    if (parts.length === 2) {
      return [parts[0], parts[1]];
    }
    if (inst.length === 6) {
      return [inst.substring(0, 3), inst.substring(3, 6)];
    }
    return ['USD'];
  } else {
    return ['USD'];
  }
}

export function calculateAssetMatrixItem(
  setup: any,
  currentPrice?: number,
  newsEvents: NewsEvent[] = [],
  customTimestamp?: string
): AssetDecisionItem {
  const instrument = setup.instrument || 'UNKNOWN';
  const market = (setup.market || 'futures').toLowerCase();
  const bias = (setup.bias || 'long').toLowerCase();
  
  const entryLow = Number(setup.entry_zone_low ?? setup.levels?.entryMin ?? 0);
  const entryHigh = Number(setup.entry_zone_high ?? setup.levels?.entryMax ?? 0);
  const entryMid = Number(setup.entry_zone_mid ?? (entryLow + entryHigh) / 2);
  const stop = Number(setup.stop ?? setup.levels?.stopLoss ?? 0);
  const tp1 = Number(setup.tp1 ?? setup.levels?.takeProfit1 ?? 0);
  const rMultiple1 = Number(setup.r_multiple_1 ?? 2.0);

  const price = currentPrice !== undefined && currentPrice > 0 
    ? currentPrice 
    : (setup.current_price !== undefined && setup.current_price > 0 ? setup.current_price : undefined);

  // 1. Conviction Score (Weight: 25%)
  const rawConviction = setup.conviction_score ?? setup.conviction ?? 75;
  let S_conviction = Math.max(0, Math.min(100, rawConviction));
  try {
    const meta = typeof setup.metadata === 'string' ? JSON.parse(setup.metadata) : setup.metadata || {};
    const strat = (setup.strategy_id || '').toLowerCase();
    const isMannaSnd = strat === 'manna_snd';
    const trend15m = meta.trend15m;
    const curveLocation = meta.curveLocation;

    // For non-Manna SnD strategies (Sentinel / Manna Elite), apply trend & curve adjustments if available.
    // For Manna SnD, computeMannaSndConvictionScore already natively and rigorously integrates Curve Location (25%)
    // and Trend Structure (5%) into rawConviction, so we preserve the calibrated institutional score.
    if (!isMannaSnd) {
      if (trend15m) {
        if (bias === 'long') {
          if (trend15m === 'up') S_conviction += 5;
          else if (trend15m === 'down') S_conviction -= 10;
        } else {
          if (trend15m === 'down') S_conviction += 5;
          else if (trend15m === 'up') S_conviction -= 10;
        }
      }
      
      if (curveLocation) {
        if (bias === 'long') {
          if (curveLocation === 'low') S_conviction += 5;
          else if (curveLocation === 'high') S_conviction -= 15;
        } else {
          if (curveLocation === 'high') S_conviction += 5;
          else if (curveLocation === 'low') S_conviction -= 15;
        }
      }
    }
    S_conviction = Math.max(0, Math.min(100, S_conviction));
  } catch {}

  // 2. Historical Win-Rate Edge Factor (Weight: 25%)
  const rawWinRate = setup.historical_winrate ?? setup.historical_win_rate ?? 78;
  let S_winrate = 75;
  if (rawWinRate >= 80) S_winrate = 100;
  else if (rawWinRate >= 75) S_winrate = 90;
  else if (rawWinRate >= 70) S_winrate = 80;
  else if (rawWinRate >= 60) S_winrate = 70;
  else if (rawWinRate < 50) S_winrate = 40;

  // 3. Liquidity Sweep Validation (Weight: 15%)
  const rawLiquidity = setup.liquidity_score ?? 80;
  const S_liquidity = Math.max(0, Math.min(100, rawLiquidity));

  // 4. Target Risk-Reward Profile (Weight: 15%)
  const S_rr = Math.min(100, Math.max(0, (rMultiple1 / 2.5) * 100));

  // 5. Timing & News Window (Weight: 10%)
  const kz = getCurrentKillzone(customTimestamp);
  const relevantCurrencies = getRelevantCurrencies(instrument, market);
  let S_news = 100;
  const now = customTimestamp ? new Date(customTimestamp) : new Date();
  for (const event of newsEvents) {
    const eventCurrency = (event.currency || '').toUpperCase();
    if (event.impact === 'high' && (relevantCurrencies.includes(eventCurrency) || eventCurrency === 'ALL')) {
      const eventTime = new Date(event.time);
      const diffMinutes = Math.abs(eventTime.getTime() - now.getTime()) / (1000 * 60);
      if (diffMinutes <= 15) {
        S_news = 15;
        break;
      } else if (diffMinutes <= 30) {
        S_news = 60;
      }
    }
  }
  const S_timing = Math.round(0.7 * kz.score + 0.3 * S_news);

  // 6. Zone Proximity Score (Weight: 10% - Rebalanced so proximity doesn't override edge)
  let S_proximity = 70;
  let isInZone = false;
  let distInR = 999;

  if (price !== undefined && price > 0) {
    const minEntry = Math.min(entryLow, entryHigh);
    const maxEntry = Math.max(entryLow, entryHigh);

    if (price >= minEntry && price <= maxEntry) {
      isInZone = true;
      S_proximity = 100;
      distInR = 0;
    } else {
      const distToZone = price < minEntry ? (minEntry - price) : (price - maxEntry);
      const riskDist = Math.abs(entryMid - stop) || 1;
      distInR = distToZone / riskDist;
      S_proximity = Math.max(0, Math.min(100, 100 - (distInR * 40)));
    }
  } else if ((setup.signal_state || setup.state) === 'active') {
    isInZone = true;
    S_proximity = 95;
    distInR = 0;
  }

  // Data-Driven Weighted Priority Score Calculation
  const priorityScore = Number(
    (
      0.25 * S_conviction +
      0.25 * S_winrate +
      0.15 * S_liquidity +
      0.15 * S_rr +
      0.10 * S_timing +
      0.10 * S_proximity
    ).toFixed(1)
  );

  // Determine Tiers and Actions
  let priorityTier: 'IMMINENT_FOCUS' | 'HIGH_ATTENTION' | 'MONITORING' | 'LOW_PRIORITY' = 'LOW_PRIORITY';
  let actionableRec: 'EXECUTE_OR_ARM' | 'ARM_ORDER' | 'MONITOR_STRUCTURE' | 'STAND_BY' = 'STAND_BY';
  let statusLabel = 'Distant / Low Priority';

  if (priorityScore >= 85 || (priorityScore >= 75 && isInZone)) {
    priorityTier = 'IMMINENT_FOCUS';
    actionableRec = 'EXECUTE_OR_ARM';
    statusLabel = isInZone ? 'IN EXECUTION ZONE' : 'HIGH EDGE IMMINENT';
  } else if (priorityScore >= 70 || distInR <= 0.3) {
    priorityTier = 'HIGH_ATTENTION';
    actionableRec = 'ARM_ORDER';
    statusLabel = 'HIGH PROBABILITY';
  } else if (priorityScore >= 50) {
    priorityTier = 'MONITORING';
    actionableRec = 'MONITOR_STRUCTURE';
    statusLabel = 'IN DEVELOPMENT';
  }

  return {
    id: setup.id,
    instrument,
    market,
    bias,
    signal_state: setup.signal_state || setup.state || 'awaiting_entry',
    conviction_score: rawConviction,
    entry_zone_low: entryLow,
    entry_zone_high: entryHigh,
    entry_zone_mid: entryMid,
    stop,
    tp1,
    r_multiple_1: rMultiple1,
    current_price: price,
    distance_in_r: Number(distInR.toFixed(2)),
    is_in_zone: isInZone,
    priority_score: priorityScore,
    priority_tier: priorityTier,
    actionable_recommendation: actionableRec,
    status_label: statusLabel,
    rank: 1,
    factors: {
      conviction: Math.round(S_conviction),
      winrate: Math.round(S_winrate),
      liquiditySweep: Math.round(S_liquidity),
      riskReward: Math.round(S_rr),
      timing: Math.round(S_timing),
      proximity: Math.round(S_proximity),
    },
    killzone_origin: setup.killzone_origin || setup.killzone,
    opposing_strategy_warning: setup.opposing_strategy_warning
  };
}

function areCorrelated(instA: string, instB: string): boolean {
  const a = instA.toUpperCase();
  const b = instB.toUpperCase();
  
  // Futures Stock Indexes
  const indices = ['ES', 'NQ', 'RTY', 'YM'];
  if (indices.includes(a) && indices.includes(b)) return true;
  
  // USD-based Forex majors
  const usdMajors = ['EUR/USD', 'GBP/USD', 'AUD/USD', 'NZD/USD'];
  if (usdMajors.includes(a) && usdMajors.includes(b)) return true;
  
  return false;
}

export function calculateAssetMatrix(
  setups: any[],
  marketPrices: Record<string, number> = {},
  newsEvents: NewsEvent[] = [],
  customTimestamp?: string
): AssetDecisionItem[] {
  const items: AssetDecisionItem[] = setups.map(setup => {
    const price = marketPrices[setup.instrument] || setup.current_price;
    return calculateAssetMatrixItem(setup, price, newsEvents, customTimestamp);
  });

  // Sort descending by priority_score
  items.sort((a, b) => b.priority_score - a.priority_score);

  // Apply Correlation Penalty
  for (let i = 0; i < items.length; i++) {
    const itemA = items[i];
    if (itemA.signal_state !== 'awaiting_entry' && itemA.signal_state !== 'active') continue;

    for (let j = 0; j < i; j++) {
      const itemB = items[j];
      if (itemB.signal_state !== 'awaiting_entry' && itemB.signal_state !== 'active') continue;

      if (itemA.bias === itemB.bias && areCorrelated(itemA.instrument, itemB.instrument)) {
        // Apply correlation penalty to the lower-priority setup (itemA since items is sorted desc)
        const penalty = 12.0;
        itemA.priority_score = Number(Math.max(0, itemA.priority_score - penalty).toFixed(1));

        // Downgrade its tier/action if needed
        if (itemA.priority_score >= 85 || (itemA.priority_score >= 75 && itemA.is_in_zone)) {
          itemA.priority_tier = 'IMMINENT_FOCUS';
          itemA.actionable_recommendation = 'EXECUTE_OR_ARM';
          itemA.status_label = itemA.is_in_zone ? 'IN EXECUTION ZONE' : 'HIGH EDGE IMMINENT';
        } else if (itemA.priority_score >= 70 || (itemA.distance_in_r !== undefined && itemA.distance_in_r <= 0.3)) {
          itemA.priority_tier = 'HIGH_ATTENTION';
          itemA.actionable_recommendation = 'ARM_ORDER';
          itemA.status_label = 'HIGH PROBABILITY';
        } else if (itemA.priority_score >= 50) {
          itemA.priority_tier = 'MONITORING';
          itemA.actionable_recommendation = 'MONITOR_STRUCTURE';
          itemA.status_label = 'IN DEVELOPMENT';
        } else {
          itemA.priority_tier = 'LOW_PRIORITY';
          itemA.actionable_recommendation = 'STAND_BY';
          itemA.status_label = 'Distant / Low Priority';
        }
        break; // Only apply penalty once
      }
    }
  }

  // Assign ranks
  items.forEach((item, idx) => {
    item.rank = idx + 1;
  });

  return items;
}
