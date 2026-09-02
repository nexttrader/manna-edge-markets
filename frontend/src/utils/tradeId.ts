/**
 * Utility to format Trade IDs to match the Telegram bot notification format.
 * Matches fmtId(setup) in backend/src/notifications/telegram-bot.ts
 */

/** Removes slashes from instrument names: EUR/USD → EURUSD */
export function cleanSymbol(instrument: string): string {
  return (instrument || '').replace(/\//g, '').toUpperCase();
}

/**
 * Derives the exact Trade ID format used by the Telegram bot.
 * Example: #GBPUSD-06C7, #ES-E2E8, #RTY-2920
 */
export function formatTelegramTradeId(setup: { id?: string; instrument?: string }): string {
  if (!setup || !setup.id) return '#SND-0001';
  const sym = cleanSymbol(setup.instrument || '');
  const rawId = setup.id.replace(/^test_/, '');
  const parts = rawId.split('-');
  const suffix = parts.length > 1
    ? parts[0].substring(0, 4).toUpperCase()
    : rawId.substring(rawId.length - 4).toUpperCase();
  return `#${sym}-${suffix}`;
}
