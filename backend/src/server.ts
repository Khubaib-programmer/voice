import { app } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";

const host = config.HOST || (config.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const server = app.listen(config.PORT, host, () => console.log(`API listening on ${host}:${config.PORT}`));

let shutdownPromise: Promise<void> | undefined;
async function shutdown() {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = new Promise<void>((resolve) => {
    server.close((error) => {
      if (error) console.error(`[api] HTTP server shutdown failed: ${error.name}`);
      resolve();
    });
  }).then(async () => {
    await prisma.$disconnect();
  });
  return shutdownPromise;
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
