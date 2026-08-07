import fs from 'fs';
import path from 'path';
import { initializeDatabase } from './database.js';
import { addUser } from './user-store.js';

async function main() {
  // Initialize database connection
  await initializeDatabase();

  const csvPath = '/Users/chadwinsolomon/.gemini/antigravity/brain/c3235abb-e755-4e74-92ec-a8ae7997f1bd/scratch/users_import.csv';
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

  if (lines.length <= 1) {
    console.log('No users to import.');
    return;
  }

  // Find column indices
  const headers = parseCsvLine(lines[0]);
  const nameIdx = headers.indexOf('Name');
  const emailIdx = headers.indexOf('Email');

  if (emailIdx === -1) {
    console.error('Email column not found in CSV.');
    process.exit(1);
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const name = nameIdx !== -1 ? cols[nameIdx]?.trim() : 'Manna Trader';
    const email = cols[emailIdx]?.trim();

    if (!email || !email.includes('@')) {
      console.warn(`Skipping invalid email row at line ${i + 1}: ${email}`);
      continue;
    }

    try {
      console.log(`Importing user: ${name} (${email})...`);
      await addUser({
        name: name || 'Manna Trader',
        email: email,
        password: 'needs_password_reset_temp',
        mustChangePassword: true,
        role: 'trader',
        tier: 'futures_forex',
        isTrial: false,
      });
      successCount++;
    } catch (err: any) {
      console.error(`Failed to import user ${email}:`, err.message);
      failCount++;
    }
  }

  console.log(`\nImport complete!`);
  console.log(`Successfully imported/updated: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  process.exit(0);
}

main().catch(err => {
  console.error('Critical failure in import script:', err);
  process.exit(1);
});
