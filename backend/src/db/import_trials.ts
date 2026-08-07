import fs from 'fs';
import path from 'path';
import { initializeDatabase } from './database.js';
import { addUser } from './user-store.js';

async function main() {
  // Initialize database connection
  await initializeDatabase();

  const csvPath = '/Users/chadwinsolomon/.gemini/antigravity/brain/c3235abb-e755-4e74-92ec-a8ae7997f1bd/scratch/trials_import.csv';
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found at ${csvPath}`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const lines = csvContent.split('\n').filter(l => l.trim().length > 0);
  
  // Custom CSV parser to handle quotes and commas correctly
  function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  // Find column indices
  const headers = parseCsvLine(lines[0]);
  const nameIdx = headers.indexOf('Name');
  const emailIdx = headers.indexOf('Email');

  if (emailIdx === -1) {
    console.error('Email column not found in CSV.');
    process.exit(1);
  }

  const usersToImport = [];

  // Parse CSV trials
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const name = nameIdx !== -1 ? cols[nameIdx]?.trim() : 'Manna Trial Trader';
    const email = cols[emailIdx]?.trim();

    if (email && email.includes('@')) {
      usersToImport.push({
        name: name || 'Manna Trial Trader',
        email: email,
        trialDays: 21,
        tier: 'futures_forex'
      });
    }
  }

  // Add Mary explicitly to the list
  usersToImport.push({
    name: 'Mary',
    email: 'maryww0306@gmail.com',
    trialDays: 21,
    tier: 'futures_forex'
  });

  let successCount = 0;
  let failCount = 0;

  for (const item of usersToImport) {
    try {
      console.log(`Importing trial user: ${item.name} (${item.email})...`);
      await addUser({
        name: item.name,
        email: item.email,
        password: 'needs_password_reset_temp',
        mustChangePassword: true,
        role: 'trader',
        tier: item.tier,
        isTrial: true,
        trialDays: item.trialDays,
        trialStartedAt: null, // Trial does NOT start yet
        trialExpiresAt: null  // Expiration is null until first password reset
      });
      successCount++;
    } catch (err: any) {
      console.error(`Failed to import trial user ${item.email}:`, err.message);
      failCount++;
    }
  }

  console.log(`\nTrial Import complete!`);
  console.log(`Successfully imported/updated: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  process.exit(0);
}

main().catch(err => {
  console.error('Critical failure in trial import script:', err);
  process.exit(1);
});
