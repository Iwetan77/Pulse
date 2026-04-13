// ─────────────────────────────────────────────────
//  Stellar Pulse — Autonomous Agent Loop
//
//  Startup: 35-second countdown printed to terminal
//  so you can open http://localhost:4021 before
//  cycle 1 fires.
//
//  Funding logic:
//    - Start with XLM from Friendbot (10,000 XLM)
//    - Only call Friendbot again when XLM drops below 5
//    - Auto-swap XLM → USDC only if USDC < 5 (small top-up)
// ─────────────────────────────────────────────────

import { config } from "../utils/config.js";
import { logger } from "../utils/logger.js";
import {
  getWalletSnapshot, ensureTestnetWallet,
  refillViaFriendbot, swapXLMForUSDC,
} from "../utils/wallet.js";
import {
  getActionableEntries, getAllVaultEntries, seedDemoVault,
  getVaultSummary, killAllDiscretionary, resetX402ForNextCycle,
} from "./vault.js";
import { evaluatePolicy, logPolicyEvaluation } from "./policy.js";
import { executeDecision } from "./executor.js";
import {
  printLedger, recordSnapshot, getRecentEvents,
  getTotalSpent, getX402Summary, recordSwapEvent,
} from "./ledger.js";
import type { AgentLoopState, PulseSnapshot } from "../types/index.js";

export const agentState: AgentLoopState = {
  iteration: 0, isRunning: false,
  lastSnapshot: null, killSwitchActive: false, pausedCategories: [],
};

// ── Bootstrap ─────────────────────────────────────
async function bootstrap(): Promise<void> {
  logger.divider("STELLAR PULSE — AUTONOMOUS FINANCIAL OS");
  logger.info("Network:  Stellar Testnet (real transactions)");
  logger.info("Explorer: https://stellar.expert/explorer/testnet");
  logger.info(`Loop:     Every ${config.agentLoopIntervalSeconds}s`);
  logger.info(`x402:     ${config.demoMode ? "DEMO mode" : "LIVE mode"}`);

  const keypair = await ensureTestnetWallet();
  logger.success(`Wallet:   ${keypair.publicKey()}`);
  logger.info(`View:     https://stellar.expert/explorer/testnet/account/${keypair.publicKey()}`);

  const wallet = await getWalletSnapshot();
  logger.info(`XLM:      ${parseFloat(wallet.xlmBalance).toFixed(2)}`);
  logger.info(`USDC:     ${parseFloat(wallet.usdcBalance).toFixed(4)}`);

  // Only refill if wallet is nearly empty
  if (parseFloat(wallet.xlmBalance) < 5) {
    logger.warn("XLM < 5 — requesting Friendbot refill…");
    await refillViaFriendbot(keypair.publicKey());
    await sleep(4000);
  }

  // Small USDC top-up so dashboard shows a non-zero USDC balance
  const refreshed = await getWalletSnapshot();
  if (parseFloat(refreshed.xlmBalance) > 50 && parseFloat(refreshed.usdcBalance) < 5) {
    logger.info("USDC < 5 — auto-swapping 20 XLM → USDC via Stellar SDEX…");
    try {
      const swap = await swapXLMForUSDC("20", "0.01");
      recordSwapEvent(swap.hash, swap.explorerUrl, "20", swap.usdcReceived);
      logger.success(`Swap confirmed: ${swap.usdcReceived} USDC received`);
    } catch (e: any) {
      logger.warn(`SDEX swap failed (no liquidity on testnet) — continuing with XLM: ${e.message}`);
    }
  }

  seedDemoVault(keypair.publicKey());

  const s = getVaultSummary();
  logger.snapshot("Priority Vault", {
    "Entries":       s.total,
    "Pending":       s.pending,
    "Real XLM txs":  s.realTxEntries,
    "x402 services": s.x402Services,
  });
}

// ── Countdown before first cycle ──────────────────
async function startupCountdown(seconds: number): Promise<void> {
  logger.divider("DASHBOARD READY");
  logger.success(`Open http://localhost:${config.port} NOW`);
  logger.info(`First payment cycle starts in ${seconds} seconds…`);

  for (let i = seconds; i > 0; i -= 5) {
    logger.agent(`Starting in ${i}s… (http://localhost:${config.port})`);
    await sleep(Math.min(5000, i * 1000));
  }
  logger.agent("Firing cycle 1 NOW ▶");
}

// ── Agent tick ────────────────────────────────────
async function tick(): Promise<void> {
  agentState.iteration++;

  const wallet  = await getWalletSnapshot();
  const summary = getVaultSummary();
  const entries = getActionableEntries();

  logger.agent(
    `Cycle #${agentState.iteration} | ` +
    `Pending: ${entries.length} | Settled: ${summary.settled} | ` +
    `XLM: ${parseFloat(wallet.xlmBalance).toFixed(2)} | USDC: ${parseFloat(wallet.usdcBalance).toFixed(4)}`
  );

  // Only refill when nearly empty (< 5 XLM)
  if (parseFloat(wallet.xlmBalance) < 5) {
    logger.warn("XLM < 5 — auto-refilling via Friendbot…");
    await refillViaFriendbot();
    await sleep(4000);
  }

  // Small USDC top-up mid-cycle if needed
  if (parseFloat(wallet.xlmBalance) > 30 && parseFloat(wallet.usdcBalance) < 2) {
    logger.info("Agent: USDC low — initiating autonomous XLM→USDC SDEX swap…");
    try {
      const swap = await swapXLMForUSDC("15", "0.01");
      recordSwapEvent(swap.hash, swap.explorerUrl, "15", swap.usdcReceived);
      logger.success(`Autonomous swap: received ${swap.usdcReceived} USDC — tx: ${swap.explorerUrl}`);
    } catch (e: any) {
      logger.warn(`Swap failed: ${e.message} — will use XLM for payments`);
    }
  }

  if (entries.length === 0) {
    resetX402ForNextCycle();
    logger.agent(`All settled — x402 entries reset for next cycle`);
    const snap = buildSnap(wallet, [], { decisions: [], totalAffordableUSDC: "0", totalRequiredUSDC: "0", walletHealthy: true, recommendation: "idle" });
    agentState.lastSnapshot = snap;
    recordSnapshot(snap);
    return;
  }

  const evaluation = evaluatePolicy(wallet, entries, agentState.killSwitchActive, agentState.pausedCategories);
  logPolicyEvaluation(evaluation);

  const actOn = evaluation.decisions.filter(
    d => d.action === "EXECUTE" || d.action === "SIMULATE" || d.action === "KILL"
  );

  for (const decision of actOn) {
    await executeDecision(decision);
    if (decision.action === "EXECUTE") {
      logger.info("⏳ Waiting 8s between transactions (check stellar.expert)…");
      await sleep(8000);
    }
  }

  const snap = buildSnap(wallet, actOn, evaluation);
  agentState.lastSnapshot = snap;
  recordSnapshot(snap);

  printLedger(8);
  const x = getX402Summary();
  if (x.totalRequests > 0) {
    logger.snapshot("x402 Activity", { "Requests": x.totalRequests, "Paid": x.totalPaidUSDC + " USDC" });
  }
}

function buildSnap(wallet: any, actOn: any[], evaluation: any): PulseSnapshot {
  return {
    timestamp: new Date(), wallet,
    vaultEntries: getAllVaultEntries(), recentEvents: getRecentEvents(20),
    agentDecisions: evaluation.decisions || [],
    totalScheduledUSDC: evaluation.totalRequiredUSDC || "0",
    totalSpentUSDC: getTotalSpent(),
    x402ServicesActive: actOn.filter((d: any) => d.vaultEntry?.method === "X402").length,
  };
}

export function activateKillSwitch()   { agentState.killSwitchActive = true;  killAllDiscretionary(); logger.warn("⚡ KILL SWITCH ON"); }
export function deactivateKillSwitch() { agentState.killSwitchActive = false; logger.success("Kill switch OFF"); }
export async function requestFriendbot() { return refillViaFriendbot(); }

export async function startAgentLoop(): Promise<void> {
  agentState.isRunning = true;
  await bootstrap();

  await startupCountdown(35);

  await tick();

  const ms = config.agentLoopIntervalSeconds * 1000;
  logger.info(`Next cycle in ${config.agentLoopIntervalSeconds}s…`);

  while (agentState.isRunning) {
    await sleep(ms);
    if (agentState.isRunning) await tick();
  }
}

if (process.argv[1]?.endsWith("loop.ts") || process.argv[1]?.endsWith("loop.js")) {
  startAgentLoop().catch(e => { logger.error("Fatal", e); process.exit(1); });
}

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }