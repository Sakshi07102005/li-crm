import { runSeed } from './tasks';

console.log('Seeding users...');
runSeed()
  .then(() => console.log('Done.'))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
