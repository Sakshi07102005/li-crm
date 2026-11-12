import app from './app';
import { env } from './config/env';
import { checkDatabaseConnection, pool } from './db/pool';
import { scheduleReminders, stopScheduledReminders } from './jobs/followupReminders';

async function startServer(): Promise<void> {
  console.log('Connecting to PostgreSQL database...');
  const isDbConnected = await checkDatabaseConnection();

  if (!isDbConnected) {
    console.error(
      `CRITICAL: Unable to reach PostgreSQL at ${env.database.host}:${env.database.port}/${env.database.name}. Server startup aborted.`,
    );
    process.exit(1);
  }

  console.log(`Database connection verified: ${env.database.name}`);

  // Start background job scheduler
  scheduleReminders();

  const server = app.listen(env.port, () => {
    console.log(`LI CRM Backend server running on port ${env.port} [${env.nodeEnv}]`);
    console.log(`API Base: http://localhost:${env.port}/api`);
    console.log(`Swagger Docs: http://localhost:${env.port}/api/docs`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    stopScheduledReminders();
    server.close(async () => {
      console.log('HTTP server closed.');
      await pool.end();
      console.log('Database pool drained.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
