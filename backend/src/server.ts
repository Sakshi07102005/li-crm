import app from "./app";
import { env } from "./config/env";

const server = app.listen(env.port, () => {
  console.log(`LI CRM API running on http://localhost:${env.port} (${env.nodeEnv})`);
});

const shutdown = (signal: string) => {
  console.log(`${signal} received, shutting down...`);
  server.close(() => process.exit(0));
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

