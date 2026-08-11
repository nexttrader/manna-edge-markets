import { IBApi, EventName, Contract, SecType } from '@stoqey/ib';
import { queryDb } from '../db/database';
import { createLogger } from '../telemetry/logger';

const logger = createLogger('IBProvider');

// 1. Configuration from environment variables
const IB_HOST = process.env.IB_GATEWAY_HOST || '127.0.0.1';
const IB_PORT = Number(process.env.IB_GATEWAY_PORT || '4002'); // Default 4002 for paper trading
const IB_CLIENT_ID = Number(process.env.IB_CLIENT_ID || '1');

let ib: IBApi | null = null;
let isConnected = false;
let reconnectTimer: NodeJS.Timeout | null = null;

// Track active market data request IDs to map back to instruments
const activeRequests = new Map<number, string>();
let nextReqId = 1;

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
  const goldMonths = [2, 4, 6, 8, 12]; // Feb, Apr, Jun, Aug, Dec
  
  // Roll on the 25th of the month before expiration (or 25th of the month)
  for (const m of goldMonths) {
    if (month < m || (month === m && day < 25)) {
      return `${year}${m.toString().padStart(2, '0')}`;
    }
  }
  return `${year + 1}02`;
}

function getSilverExpiry(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const silverMonths = [3, 5, 7, 9, 12]; // Mar, May, Jul, Sep, Dec
  
  for (const m of silverMonths) {
    if (month < m || (month === m && day < 25)) {
      return `${year}${m.toString().padStart(2, '0')}`;
    }
  }
  return `${year + 1}03`;
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
      return { symbol: 'ES', secType: SecType.FUT, exchange: 'GLOBEX', currency: 'USD', lastTradeDateOrContractMonth: getIndexFuturesExpiry() };
    case 'NQ':
      return { symbol: 'NQ', secType: SecType.FUT, exchange: 'GLOBEX', currency: 'USD', lastTradeDateOrContractMonth: getIndexFuturesExpiry() };
    case 'YM':
      return { symbol: 'MYM', secType: SecType.FUT, exchange: 'ECBOT', currency: 'USD', lastTradeDateOrContractMonth: getIndexFuturesExpiry() };
    case 'GC':
      return { symbol: 'GC', secType: SecType.FUT, exchange: 'NYMEX', currency: 'USD', lastTradeDateOrContractMonth: getGoldExpiry() };
    case 'CL':
      return { symbol: 'CL', secType: SecType.FUT, exchange: 'NYMEX', currency: 'USD', lastTradeDateOrContractMonth: getCrudeOilExpiry() };
    case 'SI':
      return { symbol: 'SI', secType: SecType.FUT, exchange: 'NYMEX', currency: 'USD', lastTradeDateOrContractMonth: getSilverExpiry() };
    
    // Forex (CASH)
    case 'EUR/USD':
      return { symbol: 'EUR', secType: SecType.CASH, exchange: 'IDEALPRO', currency: 'USD' };
    case 'GBP/USD':
      return { symbol: 'GBP', secType: SecType.CASH, exchange: 'IDEALPRO', currency: 'USD' };
    case 'USD/JPY':
      return { symbol: 'USD', secType: SecType.CASH, exchange: 'IDEALPRO', currency: 'JPY' };
    case 'AUD/USD':
      return { symbol: 'AUD', secType: SecType.CASH, exchange: 'IDEALPRO', currency: 'USD' };
    case 'EUR/GBP':
      return { symbol: 'EUR', secType: SecType.CASH, exchange: 'IDEALPRO', currency: 'GBP' };
    case 'GBP/JPY':
      return { symbol: 'GBP', secType: SecType.CASH, exchange: 'IDEALPRO', currency: 'JPY' };
    
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

  logger.info({ host: IB_HOST, port: IB_PORT }, 'Initializing IBKR live price streaming...');

  ib = new IBApi({
    host: IB_HOST,
    port: IB_PORT,
    clientId: IB_CLIENT_ID
  });

  setupListeners();
  connectWithRetry();
}

function connectWithRetry() {
  if (!ib) return;
  
  logger.info('Connecting to IB Gateway...');
  ib.connect();

  // Reconnection logic if connection fails to establish
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    if (!isConnected) {
      logger.warn('Connection timeout. Retrying connection to IB Gateway...');
      connectWithRetry();
    }
  }, 10000);
}

function setupListeners() {
  if (!ib) return;

  ib.on(EventName.connected, () => {
    isConnected = true;
    logger.info('Successfully connected to IBKR Gateway. Registering active symbol subscriptions...');
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    subscribeToAllSymbols();
  });

  ib.on(EventName.disconnected, () => {
    isConnected = false;
    logger.warn('Disconnected from IBKR Gateway. Retrying connection in 5 seconds...');
    activeRequests.clear();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connectWithRetry(), 5000);
  });

  ib.on(EventName.error, (err: any, code: number, id: number) => {
    // Suppress warning code 2104, 2106, 2158 (Standard connection status messages from IB)
    if (code === 2104 || code === 2106 || code === 2158) {
      logger.debug({ code, message: err?.message }, 'IBKR Info');
      return;
    }
    logger.error({ id, code, message: err?.message || String(err) }, 'IBKR Error received');
  });

  // Handle incoming price ticks
  ib.on(EventName.tickPrice, async (reqId: number, field: number, price: number) => {
    const instrument = activeRequests.get(reqId);
    if (!instrument || price <= 0) return;

    // Field 4: Last Price (Futures)
    // Field 9: Close Price
    // Field 1 & 2: Bid/Ask (Forex) - using midpoint
    if (field === 4 || field === 9) {
      await updateCachedPrice(instrument, price);
    } else if (field === 1 || field === 2) {
      // Calculate a simple mid-price for Forex
      // For simplicity, we directly write the bid or ask, or keep track of them.
      // Writing any active bid/ask quote updates the current trade price immediately.
      await updateCachedPrice(instrument, price);
    }
  });
}

function subscribeToAllSymbols() {
  if (!ib || !isConnected) return;

  const instruments = [
    'ES', 'NQ', 'YM', 'GC', 'CL', 'SI',
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'EUR/GBP', 'GBP/JPY'
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
