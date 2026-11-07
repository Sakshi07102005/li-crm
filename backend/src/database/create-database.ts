import { createDatabaseIfMissing } from './tasks';

createDatabaseIfMissing().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
