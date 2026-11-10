import { app } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";

const host = config.HOST || (config.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const server = app.listen(config.PORT, host, () => console.log(`API listening on ${host}:${config.PORT}`));

async function shutdown() {
  server.close();
  await prisma.$disconnect();
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
