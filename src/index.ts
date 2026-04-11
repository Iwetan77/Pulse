// ─────────────────────────────────────────────────
//  Stellar Pulse — Main Entry Point
//
//  Boots three concurrent processes:
//    1. x402 Resource Server  (port 4022) — paid APIs
//    2. Dashboard API Server  (port 4021) — frontend + REST
//    3. Autonomous Agent Loop             — Perceive → Execute
// ─────────────────────────────────────────────────

import { logger } from "./utils/logger.js";
import { startX402Server } from "./server/x402.js";
import { startDashboardServer } from "./server/dashboard.js";
import { startAgentLoop } from "./agent/loop.js";
import { config } from "./utils/config.js";

async function main() {
  logger.divider("STELLAR PULSE");
  logger.info("Autonomous On-Chain Financial Operating System");
  logger.info("Built on Stellar · x402 · Soroban SAC");
  logger.info(`Mode: ${config.demoMode ? "DEMO (simulated payments)" : "LIVE (testnet)"}`);
  console.log();

  // 1. Start x402 resource server (paid API endpoints)
  startX402Server();

  // 2. Start dashboard + API server
  startDashboardServer();

  // Small delay to let servers bind before agent starts
  await new Promise((r) => setTimeout(r, 500));

  // 3. Start autonomous agent loop
  await startAgentLoop();
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  logger.warn("\nShutting down Stellar Pulse…");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.warn("SIGTERM received — shutting down");
  process.exit(0);
});

main().catch((err) => {
  logger.error("Fatal startup error", err instanceof Error ? err.message : err);
  process.exit(1);
});