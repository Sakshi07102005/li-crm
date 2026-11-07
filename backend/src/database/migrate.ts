import { runMigrations } from './tasks';

console.log('Running migrations...');
runMigrations()
  .then((applied) => console.log(`Done. ${applied.length} migration(s) applied.`))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
