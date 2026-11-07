import { createDatabaseIfMissing, dropEverything, runMigrations, runSeed } from './tasks';

(async () => {
  console.log('RESET (development only)');
  await createDatabaseIfMissing();
  await dropEverything();
  console.log('Running migrations...');
  await runMigrations();
  console.log('Seeding users...');
  await runSeed();
  console.log('Reset complete.');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
