import { IBApi, EventName, Contract, SecType } from '@stoqey/ib';
import { queryDb } from '../db/database';
import { createLogger } from '../telemetry/logger';
import { processKillzoneMidpointScan } from '../scheduler/midpoint-scanner';
import { getCurrentKillzone } from '../scheduler/killzone-mapper';

const logger = createLogger('IBProvider');

// 1. Configuration from environment variables
const IB_HOST = process.env.IB_GATEWAY_HOST || '127.0.0.1';
const IB_PORT = Number(process.env.IB_GATEWAY_PORT || '4002'); // Default 4002 for paper trading
const IB_CLIENT_ID = process.env.IB_CLIENT_ID ? Number(process.env.IB_CLIENT_ID) : Math.floor(Math.random() * 8999) + 1000;

// How long the gateway must be continuously disconnected before the watchdog
// triggers a Yahoo-based gap-fill scan (10 minutes).
const WATCHDOG_TRIGGER_MS = 10 * 60 * 1000;
// How often the watchdog checks connection state (5 minutes).
const WATCHDOG_INTERVAL_MS = 5 * 60 * 1000;

let ib: IBApi | null = null;
let isConnected = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let disconnectedSince: number | null = null; // epoch ms when we first lost the gateway
let watchdogTimer: NodeJS.Timeout | null = null;

// Track active market data request IDs to map back to instruments
const activeRequests = new Map<number, string>();
let nextReqId = 1;
const lastErrors: any[] = [];
const receivedFirstTick = new Set<string>();

// 2. Dynamic Futures Expiry Calculators (Rollover automation)
function getIndexFuturesExpiry(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();
  
  // Index months: March (03), June (06), September (09), December (12)
  // Standard index rollover happens 8 days before expiry (usually around the 10th of the month)
  let expMonth: number;
  let expYear = year;
  
  if (month < 3 || (month === 3 && day < 10)) {
    expMonth = 3;
  } else if (month < 6 || (month === 6 && day < 10)) {
    expMonth = 6;
  } else if (month < 9 || (month === 9 && day < 10)) {
    expMonth = 9;
  } else if (month < 12 || (month === 12 && day < 10)) {
    expMonth = 12;
  } else {
    expMonth = 3;
    expYear = year + 1;
  }
  
  return `${expYear}${expMonth.toString().padStart(2, '0')}`;
}

function getGoldExpiry(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  
  if (month === 1 || (month === 2 && day < 25)) {
    return `${year}02`;
  } else if (month === 2 || month === 3 || (month === 4 && day < 25)) {
    return `${year}04`;
  } else if (month === 4 || month === 5 || (month === 6 && day < 25)) {
    return `${year}06`;
  } else if (month === 6 || (month === 7 && day < 25)) {
    return `${year}08`;
  } else if (month === 7 || month === 8 || month === 9 || month === 10 || (month === 11 && day < 25)) {
    return `${year}12`;
  } else {
    return `${year + 1}02`;
  }
}

function getSilverExpiry(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  
  if (month === 1 || month === 2 || (month === 3 && day < 25)) {
    return `${year}03`;
  } else if (month === 3 || month === 4 || (month === 5 && day < 25)) {
    return `${year}05`;
  } else if (month === 5 || month === 6 || (month === 7 && day < 25)) {
    return `${year}07`;
  } else if (month === 7 || month === 8 || (month === 9 && day < 25)) {
    return `${year}09`;
  } else if (month === 9 || month === 10 || month === 11 || (month === 12 && day < 25)) {
    return `${year}12`;
  } else {
    return `${year + 1}03`;
  }
}

function getCrudeOilExpiry(): string {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  const day = now.getDate();
  
  // Crude Oil rolls around the 20th of the month prior to the contract month
  let contractMonth = month + 1;
  if (day >= 20) {
    contractMonth += 1;
  }
  if (contractMonth > 12) {
    contractMonth -= 12;
    year += 1;
  }
  return `${year}${contractMonth.toString().padStart(2, '0')}`;
}

// 3. Resolve contract specifications dynamically
function getContractSpec(instrument: string): Contract | null {
  const symbol = instrument.toUpperCase();
  
  switch (symbol) {
    case 'ES':
      return { symbol: 'ES', secType: SecType.FUT, exchange: 'CME', currency: 'USD', multiplier: 50, lastTradeDateOrContractMonth: getIndexFuturesExpiry() };
    case 'NQ':
      return { symbol: 'NQ', secType: SecType.FUT, exchange: 'CME', currency: 'USD', multiplier: 20, lastTradeDateOrContractMonth: getIndexFuturesExpiry() };
    case 'YM':
      return { symbol: 'YM', secType: SecType.FUT, exchange: 'CBOT', currency: 'USD', multiplier: 5, lastTradeDateOrContractMonth: getIndexFuturesExpiry() };
    case 'GC':
      return { symbol: 'GC', secType: SecType.FUT, exchange: 'COMEX', currency: 'USD', multiplier: 100, lastTradeDateOrContractMonth: getGoldExpiry() };
    case 'CL':
      return { symbol: 'CL', secType: SecType.FUT, exchange: 'NYMEX', currency: 'USD', multiplier: 1000, lastTradeDateOrContractMonth: getCrudeOilExpiry() };
    case 'SI':
      return { symbol: 'SI', secType: SecType.FUT, exchange: 'COMEX', currency: 'USD', multiplier: 5000, lastTradeDateOrContractMonth: getSilverExpiry() };
    case 'RTY':
      return { symbol: 'RTY', secType: SecType.FUT, exchange: 'CME', currency: 'USD', multiplier: 50, lastTradeDateOrContractMonth: getIndexFuturesExpiry() };
    case 'ZN':
      return { symbol: 'ZN', secType: SecType.FUT, exchange: 'CBOT', currency: 'USD', multiplier: 1000, lastTradeDateOrContractMonth: getIndexFuturesExpiry() };
    
    default:
      return null;
  }
}

// 4. Update the database cache
async function updateCachedPrice(instrument: string, price: number) {
  try {
    await queryDb(
      `INSERT INTO instrument_prices (instrument, price, updated_at) 
       VALUES (?, ?, ?) 
       ON CONFLICT(instrument) DO UPDATE SET price = EXCLUDED.price, updated_at = EXCLUDED.updated_at`,
      [instrument, price, new Date().toISOString()]
    );
  } catch (err: any) {
    logger.error({ instrument, err: err.message }, 'Failed to save price tick to database');
  }
}

// ── IB Gateway Watchdog ────────────────────────────────────────────────────
// Runs every 5 minutes. If the gateway has been unreachable for > 10 minutes
// it fires a Yahoo-based gap-fill scan so signals still appear on the board.
function startIBWatchdog() {
  if (watchdogTimer) return; // already running

  watchdogTimer = setInterval(async () => {
    if (isConnected || !disconnectedSince) return; // All good — nothing to do

    const downMs = Date.now() - disconnectedSince;
    if (downMs < WATCHDOG_TRIGGER_MS) {
      logger.info(
        { downSec: Math.round(downMs / 1000), triggerSec: WATCHDOG_TRIGGER_MS / 1000 },
        'IB Watchdog: gateway still down but below trigger threshold — waiting...'
      );
      return;
    }

    logger.warn(
      { downMinutes: Math.round(downMs / 60000) },
      '🚨 IB Watchdog: Gateway has been unreachable for > 10 minutes. Triggering Yahoo fallback gap-fill scan to ensure signals remain live.'
    );

    try {
      const kzInfo = getCurrentKillzone();
      const result = await processKillzoneMidpointScan(kzInfo, 'live');
      if (result.scanned) {
        logger.info(
          { scope: result.marketScope, futuresCount: result.futuresCount, forexCount: result.forexCount },
          '✅ IB Watchdog: Yahoo fallback gap-fill scan completed — signals topped up while IB is offline.'
        );
      } else {
        logger.info(
          { futuresCount: result.futuresCount, forexCount: result.forexCount },
          '✅ IB Watchdog: Signal counts are already sufficient — no fill needed.'
        );
      }
    } catch (err: any) {
      logger.error({ err: err.message }, 'IB Watchdog: fallback gap-fill scan failed');
    }
  }, WATCHDOG_INTERVAL_MS);

  logger.info(
    { intervalMin: WATCHDOG_INTERVAL_MS / 60000, triggerMin: WATCHDOG_TRIGGER_MS / 60000 },
    '🐕 IB Gateway Watchdog started — will trigger Yahoo fallback scan if gateway is down > 10 minutes.'
  );
}

// 5. Connect and Stream Ticks
export function startIBPriceStreaming() {
  if (process.env.MARKET_DATA_PROVIDER !== 'ibkr') {
    logger.info('IBKR Price streaming is disabled (MARKET_DATA_PROVIDER is not set to "ibkr").');
    return;
  }

  if (ib) {
    logger.warn('IBPriceStreaming is already initialized.');
    return;
  }

  logger.info({ host: IB_HOST, port: IB_PORT, clientId: IB_CLIENT_ID }, 'Initializing IBKR live price streaming...');

  ib = new IBApi({
    host: IB_HOST,
    port: IB_PORT,
    clientId: IB_CLIENT_ID
  });

  setupListeners();
  connectWithRetry();
  startIBWatchdog(); // Start the crash-recovery watchdog alongside the connection
}


function connectWithRetry() {
  if (!ib || isConnected) return;
  
  logger.info('Connecting to IB Gateway...');
  try {
    ib.disconnect();
  } catch (err) {
    // Ignore disconnect errors
  }

  try {
    ib.connect();
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to initiate ib.connect');
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;

  logger.info('Scheduling reconnection to IB Gateway in 5 seconds...');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWithRetry();
  }, 5000);
}

function setupListeners() {
  if (!ib) return;

  ib.on(EventName.connected, () => {
    isConnected = true;
    disconnectedSince = null; // Gateway is back — reset the watchdog clock
    logger.info('Successfully connected to IBKR Gateway. Registering active symbol subscriptions...');
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    try {
      // Enable delayed market data fallback (type 3) so that if real-time subscriptions are missing,
      // the gateway will stream 15-minute delayed ticks instead of failing silently.
      ib!.reqMarketDataType(3);
      logger.info('Set IBKR market data type to 3 (delayed fallback)');
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Failed to set market data type');
    }
    subscribeToAllSymbols();
  });

  ib.on(EventName.disconnected, () => {
    isConnected = false;
    if (!disconnectedSince) {
      disconnectedSince = Date.now(); // Start the watchdog clock on first disconnect
    }
    logger.warn({ disconnectedSince: new Date(disconnectedSince).toISOString() }, 'Disconnected from IBKR Gateway. Watchdog clock started.');
    activeRequests.clear();
    scheduleReconnect();
  });


  ib.on(EventName.error, (err: any, code: number, id: number) => {
    // Suppress warning code 2104, 2106, 2158 (Standard connection status messages from IB)
    if (code === 2104 || code === 2106 || code === 2158) {
      logger.debug({ code, message: err?.message }, 'IBKR Info');
      return;
    }
    const message = err?.message || String(err);
    logger.error({ id, code, message }, 'IBKR Error received');
    lastErrors.unshift({
      timestamp: new Date().toISOString(),
      code,
      message,
      id
    });
    if (lastErrors.length > 20) {
      lastErrors.pop();
    }

    // Auto-resubscribe on competing session error (code 10197) after 10 seconds
    if (code === 10197) {
      const instrument = activeRequests.get(id);
      if (instrument) {
        logger.warn({ instrument, id }, 'Market data subscription rejected due to competing session. Retrying in 10s...');
        setTimeout(() => {
          if (isConnected && ib) {
            const contract = getContractSpec(instrument);
            if (contract) {
              ib.reqMktData(id, contract, '', false, false);
              logger.info({ instrument, id }, 'Retried market data subscription');
            }
          }
        }, 10000);
      }
    }
  });

  // Handle incoming price ticks
  ib.on(EventName.tickPrice, async (reqId: number, field: number, price: number) => {
    const instrument = activeRequests.get(reqId);
    if (!instrument || price <= 0) return;

    if (!receivedFirstTick.has(`${instrument}-${field}`)) {
      receivedFirstTick.add(`${instrument}-${field}`);
      logger.info({ instrument, field, price }, 'Received first price tick from IBKR');
    }

    // Support both real-time fields (1=Bid, 2=Ask, 4=Last, 9=Close) and delayed fields (66=Bid, 67=Ask, 68=Last, 75=Close)
    if (field === 1 || field === 2 || field === 4 || field === 9 || 
        field === 66 || field === 67 || field === 68 || field === 75) {
      await updateCachedPrice(instrument, price);
    }
  });
}

function subscribeToAllSymbols() {
  if (!ib || !isConnected) return;

  const instruments = [
    'ES', 'NQ', 'YM', 'GC', 'CL', 'SI', 'RTY', 'ZN'
  ];

  activeRequests.clear();

  instruments.forEach(instrument => {
    const contract = getContractSpec(instrument);
    if (!contract) {
      logger.warn({ instrument }, 'Could not resolve contract specification for instrument');
      return;
    }

    const reqId = nextReqId++;
    activeRequests.set(reqId, instrument);

    // Request market data stream
    // genericTickList = '' (empty)
    // snapshot = false (continuous streaming)
    // regulatorySnaps = false
    ib!.reqMktData(reqId, contract, '', false, false);
    logger.info({ instrument, reqId, expiry: contract.lastTradeDateOrContractMonth || 'CASH' }, 'Requested market data stream');
  });
}

export function getIBKRGatewayStatus() {
  return {
    isConnected,
    clientId: IB_CLIENT_ID,
    host: IB_HOST,
    port: IB_PORT,
    disconnectedSince: disconnectedSince ? new Date(disconnectedSince).toISOString() : null,
    downMinutes: disconnectedSince ? Math.round((Date.now() - disconnectedSince) / 60000) : 0,
    watchdogActive: !!watchdogTimer,
    activeRequests: Array.from(activeRequests.entries()).map(([reqId, instrument]) => ({ reqId, instrument })),
    lastErrors
  };
}

