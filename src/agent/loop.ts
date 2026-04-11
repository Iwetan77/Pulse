// ─────────────────────────────────────────────────
//  Stellar Pulse — Autonomous Agent Loop
//
//  The core agent. Runs continuously:
//    Perceive → Evaluate → Decide → Execute → Log
//
//  Architecture:
//    1. Read wallet state (Horizon + Soroban SAC)
//    2. Evaluate priority vault against available funds
//    3. Produce ordered decisions
//    4. Execute: SAC transfers (Soroban) or x402 payments
//    5. Record every action to the ledger
// ─────────────────────────────────────────────────

import { config } from "../utils/config.js";
import { logger } from "../utils/logger.js";
import { getWalletSnapshot } from "../utils/wallet.js";
import {
  getSortedVaultEntries,
  seedDemoVault,
  getVaultSummary,
  killAllDiscretionary,
  getAllVaultEntries,
} from "./vault.js";
import { evaluatePolicy, logPolicyEvaluation } from "./policy.js";
import { executeDecision } from "./executor.js";
import { printLedger, recordSnapshot, getRecentEvents, getTotalSpent, getX402Summary } from "./ledger.js";
import type { AgentLoopState, PulseSnapshot } from "../types/index.js";

// ── Global agent state ────────────────────────────
export const agentState: AgentLoopState = {
  iteration: 0,
  isRunning: false,
  lastSnapshot: null,
  killSwitchActive: false,
  pausedCategories: [],
};

// ── Bootstrap ─────────────────────────────────────
async function bootstrap(): Promise<void> {
  logger.divider("STELLAR PULSE — AUTONOMOUS FINANCIAL OS");
  logger.info("Initializing agent…");
  logger.info(`Network:     ${config.network}`);
  logger.info(`Demo Mode:   ${config.demoMode}`);
  logger.info(`Horizon:     ${config.horizonUrl}`);
  logger.info(`Soroban RPC: ${config.rpcUrl}`);
  logger.info(`x402 Facil.: ${config.facilitatorUrl}`);

  // Seed demo vault
  const wallet = await getWalletSnapshot();
  logger.info(`Wallet: ${wallet.publicKey.slice(0, 12)}…  XLM: ${wallet.xlmBalance}  USDC: ${wallet.usdcBalance}`);

  seedDemoVault(wallet.publicKey);

  const summary = getVaultSummary();
  logger.snapshot("Priority Vault Summary", {
    "Total entries":    summary.total,
    "Pending":          summary.pending,
    "x402 services":    summary.x402Services,
    "Total scheduled":  `${summary.totalScheduledUSDC} USDC`,
    "CRITICAL entries": summary.byPriority.CRITICAL,
    "HIGH entries":     summary.byPriority.HIGH,
    "MEDIUM entries":   summary.byPriority.MEDIUM,
    "LOW entries":      summary.byPriority.LOW,
    "DISCRETIONARY":    summary.byPriority.DISCRETIONARY,
  });
}

// ── Single agent tick ─────────────────────────────
async function tick(): Promise<void> {
  agentState.iteration++;
  logger.agent(`Agent tick #${agentState.iteration}`);

  // 1. PERCEIVE — read wallet state from Horizon + Soroban SAC
  const wallet = await getWalletSnapshot();

  // 2. EVALUATE — run policy engine
  const entries = getSortedVaultEntries();
  const evaluation = evaluatePolicy(
    wallet,
    entries,
    agentState.killSwitchActive,
    agentState.pausedCategories
  );

  logPolicyEvaluation(evaluation);

  // 3. EXECUTE — act on each decision
  const executableActions = evaluation.decisions.filter(
    (d) => d.action === "EXECUTE" || d.action === "SIMULATE" || d.action === "KILL"
  );

  if (executableActions.length === 0) {
    logger.agent("No executable actions this cycle — all entries deferred or already settled");
  }

  for (const decision of executableActions) {
    await executeDecision(decision);
  }

  // 4. SNAPSHOT — build full system snapshot
  const snapshot: PulseSnapshot = {
    timestamp: new Date(),
    wallet,
    vaultEntries: getAllVaultEntries(),
    recentEvents: getRecentEvents(20),
    agentDecisions: evaluation.decisions,
    totalScheduledUSDC: evaluation.totalRequiredUSDC,
    totalSpentUSDC: getTotalSpent(),
    x402ServicesActive: evaluation.decisions.filter(
      (d) => d.vaultEntry.method === "X402" && d.action !== "KILL"
    ).length,
  };

  agentState.lastSnapshot = snapshot;
  recordSnapshot(snapshot);

  // 5. LOG — print ledger summary
  printLedger(10);

  const x402 = getX402Summary();
  logger.snapshot("x402 Activity Summary", {
    "Total requests":   x402.totalRequests,
    "Total paid (USDC)": x402.totalPaidUSDC,
    "Active services":  x402.services.join(", ") || "none",
  });
}

// ── Kill switch (external control) ───────────────
export function activateKillSwitch(): void {
  agentState.killSwitchActive = true;
  const killed = killAllDiscretionary();
  logger.warn(`⚡ KILL SWITCH ACTIVATED — ${killed} discretionary payments halted`);
}

export function deactivateKillSwitch(): void {
  agentState.killSwitchActive = false;
  logger.success("Kill switch deactivated — agent resuming normal operations");
}

// ── Main agent loop ───────────────────────────────
export async function startAgentLoop(): Promise<void> {
  agentState.isRunning = true;
  await bootstrap();

  // First iteration — comprehensive demo snapshot
  logger.divider("ITERATION 1 — DEMO SNAPSHOT");
  await tick();

  // Continuous loop
  const intervalMs = config.agentLoopIntervalSeconds * 1000;
  logger.info(`Agent loop running every ${config.agentLoopIntervalSeconds}s — Ctrl+C to stop`);

  while (agentState.isRunning) {
    await sleep(intervalMs);
    if (agentState.isRunning) {
      await tick();
    }
  }
}

// ── Run standalone ────────────────────────────────
if (process.argv[1]?.endsWith("loop.ts") || process.argv[1]?.endsWith("loop.js")) {
  startAgentLoop().catch((err) => {
    logger.error("Agent loop fatal error", err);
    process.exit(1);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}