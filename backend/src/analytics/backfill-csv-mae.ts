import fs from 'fs';
import path from 'path';
import { initializeDatabase, queryDb } from '../db/database';
import * as queries from '../db/queries';
import { calculateTradeExcursion, loadDetailedTradeExcursions, buildSequenceExcursionCSV, buildCandleReplayCSV, preloadCandlesForSymbols } from './candle-excursion-service';
import { createLogger } from '../telemetry/logger';

const logger = createLogger('BackfillCsvMae');

/**
 * Backfills database outcomes with accurate historical candle excursions.
 */
export async function backfillDatabaseOutcomes(strategyFilter?: string) {
  logger.info({ strategyFilter: strategyFilter || 'all' }, 'Starting database outcomes MAE backfill...');
  await initializeDatabase();

  let query = `SELECT * FROM outcomes`;
  const params: any[] = [];
  if (strategyFilter) {
    query += ` WHERE strategy_id = ?`;
    params.push(strategyFilter);
  }
  query += ` ORDER BY created_at ASC`;

  const outcomes = await queryDb(query, params);
  logger.info({ count: outcomes.length }, `Found ${outcomes.length} outcomes to process.`);

  let updatedCount = 0;

  for (const o of outcomes) {
    try {
      const setup = await queries.getSetupById(o.setup_id, o.setup_market || 'futures');
      const instrument = setup?.instrument || o.instrument || 'NQ=F';
      const bias = setup?.bias || o.bias || 'long';
      const entryPrice = setup?.entry_price_recorded || setup?.entry_zone_mid || o.execution_price || 0;
      const initialStop = setup?.initial_stop || setup?.stop || (bias === 'long' ? entryPrice * 0.995 : entryPrice * 1.005);
      const entryTime = setup?.entry_triggered_at || setup?.created_at || o.created_at;
      const exitTime = setup?.resolved_at || o.execution_time || o.created_at;
      const exitPrice = o.execution_price;

      if (!entryPrice || !initialStop || !entryTime) {
        logger.warn({ outcomeId: o.id }, 'Skipping outcome due to missing price/time coordinates');
        continue;
      }

      logger.info({ outcomeId: o.id, instrument, bias, entryTime, exitTime }, 'Calculating historical candle excursion...');

      const excursion = await calculateTradeExcursion({
        instrument,
        bias,
        entryPrice,
        initialStop,
        entryTime,
        exitTime,
        exitPrice
      });

      await queryDb(`
        UPDATE outcomes 
        SET mae = ?, mfe = ?, highest_price = ?, lowest_price = ?, bars_held = ?
        WHERE id = ?
      `, [excursion.maeR, excursion.mfeR, excursion.highestPrice, excursion.lowestPrice, excursion.barsHeld, o.id]);

      logger.info({
        outcomeId: o.id,
        maeR: excursion.maeR,
        mfeR: excursion.mfeR,
        highestPrice: excursion.highestPrice,
        lowestPrice: excursion.lowestPrice,
        timeframe: excursion.timeframeUsed
      }, 'Successfully updated outcome with accurate historical MAE');

      updatedCount++;
    } catch (err: any) {
      logger.error({ outcomeId: o.id, error: err.message }, 'Failed to backfill outcome');
    }
  }

  logger.info({ updatedCount }, `Database backfill complete! Updated ${updatedCount} outcomes.`);
  return { updatedCount, totalProcessed: outcomes.length };
}

/**
 * Backfills an arbitrary CSV tracking file with accurate historical candle excursions.
 */
export async function backfillCsvFile(csvPath: string, outputPath?: string, strategyFilter?: string) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found at path: ${csvPath}`);
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split(/\r?\n/);

  // Separate header comments (# ...) from the data rows
  const headerComments: string[] = [];
  let headerRowIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#')) {
      headerComments.push(line);
    } else if (line.length > 0) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('Could not find column headers in the CSV file.');
  }

  const headerCols = lines[headerRowIndex].split(',').map(c => c.trim());
  const colMap = new Map<string, number>();
  headerCols.forEach((col, idx) => colMap.set(col, idx));

  // Verify critical columns exist
  const getIdx = (name: string) => colMap.get(name) ?? -1;

  const symIdx = getIdx('symbol');
  const stratIdx = getIdx('strategy_id');
  const dirIdx = getIdx('trade_direction');
  const entryPriceIdx = getIdx('entry_price');
  const stopPriceIdx = getIdx('initial_stop_price');
  const exitPriceIdx = getIdx('final_exit_price');
  const entryIsoIdx = getIdx('entry_timestamp_utc');
  const exitIsoIdx = getIdx('exit_timestamp_utc');
  const entryDateIdx = getIdx('entry_date');
  const entryTimeIdx = getIdx('entry_time');
  const exitDateIdx = getIdx('exit_date');
  const exitTimeIdx = getIdx('exit_time');
  const maeIdx = getIdx('maximum_adverse_excursion_mae');
  const mfeIdx = getIdx('maximum_favourable_excursion_mfe');
  const highPriceIdx = getIdx('highest_price_during_trade');
  const lowPriceIdx = getIdx('lowest_price_during_trade');
  const barsIdx = getIdx('bars_held');

  if (symIdx === -1 || entryPriceIdx === -1 || stopPriceIdx === -1 || maeIdx === -1) {
    throw new Error('CSV is missing required tracking columns (symbol, entry_price, initial_stop_price, maximum_adverse_excursion_mae).');
  }

  // Preload historical candles for all unique symbols to accelerate processing
  const uniqueSymbols = Array.from(new Set(lines.slice(headerRowIndex + 1).map(l => l.split(',')[symIdx]).filter(Boolean)));
  console.log(`Preloading historical candle data for ${uniqueSymbols.length} unique symbols...`);
  await preloadCandlesForSymbols(uniqueSymbols);

  const updatedRows: string[] = [lines[headerRowIndex]];
  let tradesCount = 0;
  let maeSum = 0;
  let mfeSum = 0;

  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const row = line.split(',');
    const strat = stratIdx !== -1 ? row[stratIdx] : '';

    if (strategyFilter && strat && strat.toLowerCase() !== strategyFilter.toLowerCase()) {
      updatedRows.push(line);
      continue;
    }

    const instrument = row[symIdx];
    const bias = dirIdx !== -1 ? (row[dirIdx].toLowerCase().includes('short') || row[dirIdx].toLowerCase().includes('bear') ? 'short' : 'long') : 'long';
    const entryPrice = parseFloat(row[entryPriceIdx]);
    const initialStop = parseFloat(row[stopPriceIdx]);
    const exitPrice = exitPriceIdx !== -1 && row[exitPriceIdx] ? parseFloat(row[exitPriceIdx]) : undefined;

    let entryIso = entryIsoIdx !== -1 ? row[entryIsoIdx] : '';
    if (!entryIso && entryDateIdx !== -1 && entryTimeIdx !== -1) {
      entryIso = `${row[entryDateIdx]}T${row[entryTimeIdx]}Z`;
    }

    let exitIso = exitIsoIdx !== -1 ? row[exitIsoIdx] : '';
    if (!exitIso && exitDateIdx !== -1 && exitTimeIdx !== -1) {
      exitIso = `${row[exitDateIdx]}T${row[exitTimeIdx]}Z`;
    }

    if (!instrument || isNaN(entryPrice) || isNaN(initialStop) || !entryIso) {
      updatedRows.push(line);
      continue;
    }

    try {
      console.log(`Analyzing historical candles for ${instrument} (${bias}) from ${entryIso} to ${exitIso || 'now'}...`);
      const excursion = await calculateTradeExcursion({
        instrument,
        bias,
        entryPrice,
        initialStop,
        entryTime: entryIso,
        exitTime: exitIso,
        exitPrice
      });

      // Update row values
      row[maeIdx] = excursion.maeR.toFixed(2);
      if (mfeIdx !== -1) row[mfeIdx] = excursion.mfeR.toFixed(2);
      if (highPriceIdx !== -1) row[highPriceIdx] = excursion.highestPrice.toString();
      if (lowPriceIdx !== -1) row[lowPriceIdx] = excursion.lowestPrice.toString();
      if (barsIdx !== -1) row[barsIdx] = excursion.barsHeld.toString();

      tradesCount++;
      maeSum += excursion.maeR;
      mfeSum += excursion.mfeR;

      updatedRows.push(row.join(','));
      console.log(`  -> Exact MAE: ${excursion.maeR}R (${excursion.maePoints} pts), MFE: ${excursion.mfeR}R [${excursion.timeframeUsed}]`);
    } catch (err: any) {
      console.error(`  -> Failed to calculate excursion: ${err.message}`);
      updatedRows.push(line);
    }
  }

  // Update header comments if present
  const avgMae = tradesCount > 0 ? (maeSum / tradesCount).toFixed(2) : '0.00';
  const avgMfe = tradesCount > 0 ? (mfeSum / tradesCount).toFixed(2) : '0.00';

  const updatedHeaders = headerComments.map(h => {
    if (h.includes('Average MAE:')) return `# Average MAE: ${avgMae}R`;
    if (h.includes('Average MFE:')) return `# Average MFE: ${avgMfe}R`;
    return h;
  });

  const finalContent = [...updatedHeaders, ...updatedRows].join('\n');
  const targetOutput = outputPath || csvPath;
  fs.writeFileSync(targetOutput, finalContent, 'utf8');

  console.log(`\n🎉 Processed ${tradesCount} trades! Updated CSV saved to: ${targetOutput}`);
  return { tradesCount, avgMae, avgMfe, targetOutput };
}

/**
 * Exports the Trade-Level Sequence & Excursion CSV for revised rules validation.
 */
export async function exportSequenceCsv(outputPath: string, strategyFilter?: string) {
  await initializeDatabase();
  console.log(`Loading trade excursion data for strategy: ${strategyFilter || 'all'}...`);
  const trades = await loadDetailedTradeExcursions(strategyFilter);
  const csv = buildSequenceExcursionCSV(trades);
  fs.writeFileSync(outputPath, csv, 'utf8');
  console.log(`\n🎉 Exported ${trades.length} trades with MAE/MFE sequencing & half-floor metrics to: ${outputPath}`);
  return { count: trades.length, outputPath };
}

/**
 * Exports the Granular Candle-Level Replay CSV for revised rules validation.
 */
export async function exportReplayCsv(outputPath: string, strategyFilter?: string) {
  await initializeDatabase();
  console.log(`Loading minute-by-minute candle replay data for strategy: ${strategyFilter || 'all'}...`);
  const trades = await loadDetailedTradeExcursions(strategyFilter);
  const csv = buildCandleReplayCSV(trades);
  fs.writeFileSync(outputPath, csv, 'utf8');
  console.log(`\n🎉 Exported minute candle replay data for ${trades.length} trades to: ${outputPath}`);
  return { count: trades.length, outputPath };
}

// Direct CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const isDb = args.includes('--db');
  const stratArg = args.find(a => a.startsWith('--strategy='))?.split('=')[1] || 'manna_snd';
  const exportType = args.find(a => a.startsWith('--export='))?.split('=')[1];
  const outputArg = args.find(a => a.startsWith('--out='))?.split('=')[1];

  (async () => {
    try {
      if (exportType === 'sequence') {
        const out = outputArg || `manna_${stratArg}_excursion_sequence_${new Date().toISOString().slice(0, 10)}.csv`;
        await exportSequenceCsv(out, stratArg === 'all' ? undefined : stratArg);
      } else if (exportType === 'replay') {
        const out = outputArg || `manna_${stratArg}_candle_replay_${new Date().toISOString().slice(0, 10)}.csv`;
        await exportReplayCsv(out, stratArg === 'all' ? undefined : stratArg);
      } else if (isDb || args.length === 0) {
        await backfillDatabaseOutcomes(stratArg === 'all' ? undefined : stratArg);
      } else {
        const fileArg = args[0];
        await backfillCsvFile(fileArg, outputArg, stratArg === 'all' ? undefined : stratArg);
      }
    } catch (e: any) {
      console.error('Fatal error during backfill/export:', e.message);
      process.exit(1);
    }
  })();
}
