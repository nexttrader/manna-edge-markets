import { initializeDatabase } from './database.js';
import { addUser } from './user-store.js';

async function main() {
  // Initialize database connection
  await initializeDatabase();

  const adminsToImport = [
    // Kaylin
    { name: 'Kaylin Meyer', email: 'kaylinangelinemeyer@gmail.com', role: 'admin' as const },
    { name: 'Kaylin Van Oordt', email: 'kaylinvanoordt@gmail.com', role: 'admin' as const },
    
    // Cindy
    { name: 'Cindy King', email: 'cindyking@kingdomdaytraders.com', role: 'admin' as const },
    { name: 'Cindy Leigh Meyer', email: 'meyercindyleigh777@gmail.com', role: 'admin' as const },
    { name: 'Cindy King (trades)', email: 'cindy.kingtrades@gmail.com', role: 'admin' as const },
    
    // Brian
    { name: 'Brian King', email: 'hope@coachbrianking.com', role: 'admin' as const },
    { name: 'Brian King (iglobal)', email: 'info@iglobalcoach.com', role: 'admin' as const },
    
    // Chadwin Solomon
    { name: 'Chadwin Solomon', email: 'chadwinsolomon@gmail.com', role: 'super_admin' as const }
  ];

  let successCount = 0;
  let failCount = 0;

  for (const item of adminsToImport) {
    try {
      console.log(`Importing admin: ${item.name} (${item.email}) as ${item.role}...`);
      await addUser({
        name: item.name,
        email: item.email,
        password: 'needs_password_reset_temp',
        mustChangePassword: true,
        role: item.role,
        tier: 'futures_forex',
        isTrial: false
      });
      successCount++;
    } catch (err: any) {
      console.error(`Failed to import admin ${item.email}:`, err.message);
      failCount++;
    }
  }

  console.log(`\nAdmin Import complete!`);
  console.log(`Successfully imported/updated: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  process.exit(0);
}

main().catch(err => {
  console.error('Critical failure in admin import script:', err);
  process.exit(1);
});
