export interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  roleRequired: 'all' | 'admin';
  tags: string[];
  updatedAt: string;
}

export const FAQ_DATA: FaqItem[] = [
  // --- GENERAL / TRADER FAQS ---
  {
    id: 'gen-1',
    category: '🚀 Platform Overview',
    question: 'What is Manna Edge Markets 2.0?',
    answer: 'Manna Edge Markets 2.0 is an institutional-grade automated signal discovery and analytics engine for Futures (NQ, ES, YM, CL, GC) and Forex (EUR/USD, GBP/USD, USD/JPY, AUD/USD). It scans market sessions during specific liquidity Killzones to generate high-conviction setup signals with exact entry zones, stop losses, and multi-tier take profit targets.',
    roleRequired: 'all',
    tags: ['overview', 'futures', 'forex'],
    updatedAt: '2026-07-31'
  },
  {
    id: 'strat-1',
    category: '⚡ Strategies Explained',
    question: 'What is the difference between Manna Basic and Manna SnD strategies?',
    answer: '• Manna Basic (Cyan Card Border): Uses classic ICT/SMC concepts including Fair Value Gaps (FVG), Liquidity Sweeps, and Order Block displacement on the 15M timeframe.\n\n• Manna SnD (Gold Card Border): Institutional Supply & Demand strategy. Integrates 1H HTF Supply/Demand Curve analysis with 15M SnD entry zones, enforcing higher conviction thresholds and strict HTF alignment before publishing.',
    roleRequired: 'all',
    tags: ['strategy', 'manna_basic', 'manna_snd'],
    updatedAt: '2026-07-31'
  },
  {
    id: 'exec-1',
    category: '🎯 Orders & Entry Markers',
    question: 'How do I read entry zones and candlestick chart flags?',
    answer: 'Each setup card displays an Entry Zone (e.g. 21,450.00 – 21,460.00). When viewing the live interactive chart:\n• Shaded Entry Box: Highlights the 15M entry zone starting at the zone base candle.\n• ⚡ ENTRY Candle Marker: Superimposed directly on the exact bar where price first tapped the entry zone (e.g. ⚡ ENTRY @ 09:45 (21452.50)).\n• Vertical Canvas Line: Visual line indicating exact entry fill timestamp.\n• 🔮 1H Curve Boxes (Manna SnD): Shows 1H Higher Timeframe Demand (Emerald) or Supply (Rose) curve zones.',
    roleRequired: 'all',
    tags: ['chart', 'markers', 'entry_zone'],
    updatedAt: '2026-07-31'
  },
  {
    id: 'kz-1',
    category: '⏰ Killzones & Timing',
    question: 'What are Killzones and when are signals generated?',
    answer: 'Killzones are peak institutional liquidity windows during which trading algorithms execute orders:\n• ASIA KILLZONE: 20:00 – 00:00 ET\n• LONDON KILLZONE: 02:00 – 05:00 ET\n• NY AM KILLZONE: 08:00 – 11:00 ET\n• NY PM KILLZONE: 13:30 – 16:00 ET\n\nSignals are published at session boundaries or during manual admin scans.',
    roleRequired: 'all',
    tags: ['killzone', 'time', 'sessions'],
    updatedAt: '2026-07-31'
  },
  {
    id: 'status-1',
    category: '🔔 Signals & Statuses',
    question: 'What do the signal states (Awaiting Entry, Active, Resolved, Invalidated) mean?',
    answer: '• AWAITING ENTRY (Gold): Signal published; price has not yet filled the entry zone.\n• ACTIVE (Green): Price entered the entry zone and trade is currently live.\n• RESOLVED (Emerald): Trade reached TP1 (+2.0R) or TP2 (+3.0R).\n• INVALIDATED (Red): Signal cancelled due to price displacement without fill or stop loss hit.',
    roleRequired: 'all',
    tags: ['status', 'active', 'resolved', 'invalidated'],
    updatedAt: '2026-07-31'
  },
  {
    id: 'watch-1',
    category: '🔔 Watchlists & Voice Alerts',
    question: 'How do Watchlists and Voice Alerts work?',
    answer: 'Click the ⭐ icon on any signal card to add it to your Watchlist. When a watchlisted signal triggers an entry fill, reaches TP, or gets replaced by Admin, the platform triggers an instant audio voice alert (e.g. "Attention: Pending signal for NQ replaced by Admin") and visual toast notification.',
    roleRequired: 'all',
    tags: ['watchlist', 'audio', 'alerts'],
    updatedAt: '2026-07-31'
  },

  // --- ADMIN-ONLY FAQS ---
  {
    id: 'admin-rescan',
    category: '🛡️ Admin: Rescan & Replacement',
    question: 'How does Single-Asset Rescan & Replacement work?',
    answer: 'As an Admin, pending signals (AWAITING_ENTRY) display a glowing 🔍 Rescan & Replace button. Clicking it triggers an instant scan for ONLY that instrument using its EXACT strategy. If a higher conviction setup is found:\n1. Side-by-side comparison modal displays current setup vs proposed replacement candidate using full SetupCard UI.\n2. Preview Candidate on Chart lets you visually inspect levels.\n3. Confirm Replace supersedes old signal (reason: manual_replaced_by_admin), publishes candidate, and sends watchlist replacement voice alerts to traders.',
    roleRequired: 'admin',
    tags: ['admin', 'rescan', 'replacement'],
    updatedAt: '2026-07-31'
  },
  {
    id: 'admin-disable',
    category: '🛡️ Admin: Signal Invalidations',
    question: 'How do I manually disable a signal safely?',
    answer: 'On the Admin Control Desk (/admin), click ⛔ DISABLE SIGNAL. The system prompts a mandatory confirmation dialog to prevent accidental clicks: "Are you sure you want to disable and invalidate the signal for [INSTRUMENT]?". Confirming marks the setup as non-tradable.',
    roleRequired: 'admin',
    tags: ['admin', 'invalidation', 'disable'],
    updatedAt: '2026-07-31'
  },
  {
    id: 'admin-breaker',
    category: '🛡️ Admin: Circuit Breaker & Safety',
    question: 'What is the Circuit Breaker safety system?',
    answer: 'If the Discovery Engine encounters 5 consecutive strategy execution errors, the Circuit Breaker trips automatically into Dry-Run mode to protect market integrity. Admins can inspect logs and click RESET CIRCUIT BREAKER on the Admin Panel once resolved.',
    roleRequired: 'admin',
    tags: ['admin', 'circuit_breaker', 'safety'],
    updatedAt: '2026-07-31'
  },
  {
    id: 'admin-archive',
    category: '📊 Admin: Performance Matrix & Archives',
    question: 'How are strategy win rates calculated and how do I export archives?',
    answer: 'The Strategy Performance Matrix tracks win rate %, total trade outcomes, and net realized R for Manna Basic vs Manna SnD strategies. Admins can click 📥 Download CSV in the Historical Archived Datasets table to export raw trade logs for quantitative backtesting.',
    roleRequired: 'admin',
    tags: ['admin', 'analytics', 'archives', 'csv'],
    updatedAt: '2026-07-31'
  }
];
