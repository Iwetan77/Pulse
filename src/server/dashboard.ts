// ─────────────────────────────────────────────────
//  Stellar Pulse — Dashboard API Server
//
//  Serves live agent state and ledger data to the
//  Pulse Dashboard HTML frontend over REST.
// ─────────────────────────────────────────────────

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../utils/config.js";
import { logger } from "../utils/logger.js";
import { getWalletSnapshot } from "../utils/wallet.js";
import { getAllVaultEntries, getVaultSummary, killAllDiscretionary, updateEntryStatus } from "../agent/vault.js";
import { getAllEvents, getX402Summary, getTotalSpent } from "../agent/ledger.js";
import { agentState, activateKillSwitch, deactivateKillSwitch } from "../agent/loop.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// Serve static dashboard
app.use(express.static(path.join(__dirname, "../../public")));

// ── API Routes ────────────────────────────────────

// Full system snapshot
app.get("/api/snapshot", async (req, res) => {
  try {
    const wallet = await getWalletSnapshot();
    const vault  = getAllVaultEntries();
    const events = getAllEvents().slice(-50);
    const summary = getVaultSummary();
    const x402   = getX402Summary();

    res.json({
      timestamp: new Date().toISOString(),
      agent: {
        iteration: agentState.iteration,
        isRunning: agentState.isRunning,
        killSwitchActive: agentState.killSwitchActive,
        pausedCategories: agentState.pausedCategories,
      },
      wallet,
      vaultSummary: summary,
      x402Summary: x402,
      totalSpentUSDC: getTotalSpent(),
      vault,
      events,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Wallet only
app.get("/api/wallet", async (_req, res) => {
  try {
    const wallet = await getWalletSnapshot();
    res.json(wallet);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Vault entries
app.get("/api/vault", (_req, res) => {
  res.json(getAllVaultEntries());
});

// Kill a specific vault entry
app.post("/api/vault/:id/kill", (req, res) => {
  updateEntryStatus(req.params.id, "KILLED");
  logger.warn(`Dashboard: killed vault entry ${req.params.id.slice(0, 8)}`);
  res.json({ success: true, id: req.params.id, status: "KILLED" });
});

// Ledger events
app.get("/api/ledger", (req, res) => {
  const limit = parseInt((req.query.limit as string) || "50");
  res.json(getAllEvents().slice(-limit));
});

// Agent state
app.get("/api/agent", (_req, res) => {
  res.json({
    iteration: agentState.iteration,
    isRunning: agentState.isRunning,
    killSwitchActive: agentState.killSwitchActive,
    pausedCategories: agentState.pausedCategories,
    lastSnapshot: agentState.lastSnapshot?.timestamp ?? null,
  });
});

// Kill switch toggle
app.post("/api/agent/kill-switch", (req, res) => {
  const { active } = req.body as { active: boolean };
  if (active) {
    activateKillSwitch();
  } else {
    deactivateKillSwitch();
  }
  res.json({ killSwitchActive: agentState.killSwitchActive });
});

// Kill all discretionary
app.post("/api/agent/kill-discretionary", (_req, res) => {
  const count = killAllDiscretionary();
  res.json({ killed: count });
});

// x402 summary
app.get("/api/x402", (_req, res) => {
  res.json(getX402Summary());
});

// Config info (no secrets)
app.get("/api/config", (_req, res) => {
  res.json({
    network: config.network,
    horizonUrl: config.horizonUrl,
    rpcUrl: config.rpcUrl,
    x402Network: config.x402Network,
    facilitatorUrl: config.facilitatorUrl,
    demoMode: config.demoMode,
    agentLoopIntervalSeconds: config.agentLoopIntervalSeconds,
  });
});

// Serve dashboard for all unmatched routes
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../../public/index.html"));
});

export function startDashboardServer(): void {
  app.listen(config.port, () => {
    logger.success(`Dashboard running at http://localhost:${config.port}`);
    logger.info(`API base:    http://localhost:${config.port}/api`);
  });
}

export default app;