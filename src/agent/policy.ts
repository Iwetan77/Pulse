// ─────────────────────────────────────────────────
//  Stellar Pulse — Agent Policy
//
//  Perceive → Evaluate → Decide
//
//  The policy evaluates wallet state against vault
//  obligations and produces ActionDecisions in
//  priority order.
// ─────────────────────────────────────────────────

import type {
  WalletSnapshot,
  VaultEntry,
  AgentDecision,
  PaymentPriority,
} from "../types/index.js";
import { logger } from "../utils/logger.js";

const PRIORITY_ORDER: PaymentPriority[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "DISCRETIONARY",
];

// Minimum XLM to keep for transaction fees (~0.5 XLM buffer)
const MIN_XLM_RESERVE = 1.5;

export interface PolicyEvaluation {
  decisions: AgentDecision[];
  totalAffordableUSDC: string;
  totalRequiredUSDC: string;
  walletHealthy: boolean;
  recommendation: string;
}

export function evaluatePolicy(
  wallet: WalletSnapshot,
  entries: VaultEntry[],
  killSwitchActive: boolean,
  pausedCategories: PaymentPriority[]
): PolicyEvaluation {
  const availableUSDC = parseFloat(wallet.usdcBalance);
  const availableXLM  = parseFloat(wallet.xlmBalance);

  const decisions: AgentDecision[] = [];
  let remainingUSDC = availableUSDC;

  // Sort entries by priority before evaluating
  const sorted = [...entries].sort(
    (a, b) =>
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
  );

  // Total required across all pending obligations
  const totalRequired = sorted
    .filter((e) => e.status === "PENDING")
    .reduce((sum, e) => sum + parseFloat(e.amountUSDC), 0);

  let totalAffordable = 0;
  const xlmHealthy = availableXLM >= MIN_XLM_RESERVE;

  for (const entry of sorted) {
    if (entry.status !== "PENDING") continue;

    const amount = parseFloat(entry.amountUSDC);

    // Kill switch: halt all non-CRITICAL spending
    if (killSwitchActive && entry.priority !== "CRITICAL") {
      decisions.push({
        action: "KILL",
        vaultEntry: entry,
        reason: `Kill switch active — halting ${entry.priority} payment`,
        walletSnapshot: wallet,
        projectedBalanceAfter: remainingUSDC.toFixed(7),
      });
      continue;
    }

    // Paused category
    if (pausedCategories.includes(entry.priority)) {
      decisions.push({
        action: "DEFER",
        vaultEntry: entry,
        reason: `Category ${entry.priority} is paused by user`,
        walletSnapshot: wallet,
        projectedBalanceAfter: remainingUSDC.toFixed(7),
      });
      continue;
    }

    // Not enough XLM for fees
    if (!xlmHealthy) {
      decisions.push({
        action: "DEFER",
        vaultEntry: entry,
        reason: `Insufficient XLM for fees (${availableXLM} XLM < ${MIN_XLM_RESERVE} minimum)`,
        walletSnapshot: wallet,
        projectedBalanceAfter: remainingUSDC.toFixed(7),
      });
      continue;
    }

    // Sufficient USDC: execute
    if (remainingUSDC >= amount) {
      remainingUSDC -= amount;
      totalAffordable += amount;
      decisions.push({
        action: entry.method === "X402" ? "SIMULATE" : "EXECUTE",
        vaultEntry: entry,
        reason:
          entry.method === "X402"
            ? `x402 pay-per-use request — ${amount} USDC via HTTP payment`
            : `Sufficient funds (${availableUSDC.toFixed(2)} USDC) — executing ${entry.priority} payment`,
        walletSnapshot: wallet,
        projectedBalanceAfter: remainingUSDC.toFixed(7),
      });
    } else {
      // Not enough for this payment
      if (entry.priority === "CRITICAL") {
        decisions.push({
          action: "DEFER",
          vaultEntry: entry,
          reason: `⚠ CRITICAL underfunding: need ${amount} USDC, have ${remainingUSDC.toFixed(2)}`,
          walletSnapshot: wallet,
          projectedBalanceAfter: remainingUSDC.toFixed(7),
        });
      } else {
        decisions.push({
          action: "DEFER",
          vaultEntry: entry,
          reason: `Insufficient funds for ${entry.priority} entry — deferring to next cycle`,
          walletSnapshot: wallet,
          projectedBalanceAfter: remainingUSDC.toFixed(7),
        });
      }
    }
  }

  const walletHealthy =
    xlmHealthy &&
    availableUSDC > 0 &&
    !decisions.some(
      (d) => d.action === "DEFER" && d.vaultEntry.priority === "CRITICAL"
    );

  const recommendation = buildRecommendation(
    walletHealthy,
    availableUSDC,
    totalRequired,
    totalAffordable,
    killSwitchActive
  );

  return {
    decisions,
    totalAffordableUSDC: totalAffordable.toFixed(7),
    totalRequiredUSDC: totalRequired.toFixed(7),
    walletHealthy,
    recommendation,
  };
}

function buildRecommendation(
  healthy: boolean,
  available: number,
  required: number,
  affordable: number,
  killSwitch: boolean
): string {
  if (killSwitch) return "Kill switch active — only CRITICAL payments allowed";
  if (!healthy && available < required) {
    const deficit = (required - available).toFixed(2);
    return `⚠ Wallet underfunded by ${deficit} USDC. Fund wallet to cover all obligations.`;
  }
  if (healthy && affordable >= required) {
    return "Wallet healthy — all scheduled payments can be executed";
  }
  return `Partial funding: ${affordable.toFixed(2)} / ${required.toFixed(2)} USDC covered`;
}

// ── Log the evaluation results ────────────────────
export function logPolicyEvaluation(eval_: PolicyEvaluation): void {
  logger.divider("PULSE AGENT — POLICY EVALUATION");

  logger.snapshot("Wallet & Obligations", {
    "Total Required (USDC)":  eval_.totalRequiredUSDC,
    "Affordable (USDC)":      eval_.totalAffordableUSDC,
    "Wallet Healthy":         eval_.walletHealthy ? "✓ YES" : "✗ NO",
    "Recommendation":         eval_.recommendation,
  });

  logger.info("Decision matrix:");
  for (const d of eval_.decisions) {
    const icon =
      d.action === "EXECUTE"  ? "▶" :
      d.action === "SIMULATE" ? "◎" :
      d.action === "DEFER"    ? "⏸" : "✗";

    const color =
      d.action === "EXECUTE"  ? "\x1b[32m" :
      d.action === "SIMULATE" ? "\x1b[34m" :
      d.action === "DEFER"    ? "\x1b[33m" : "\x1b[31m";

    console.log(
      `  ${color}${icon}\x1b[0m ${d.vaultEntry.priority.padEnd(14)} ` +
      `${d.vaultEntry.label.padEnd(32)} ` +
      `${d.vaultEntry.amountUSDC.padStart(12)} USDC  →  ${d.action}`
    );
    console.log(`     \x1b[90m${d.reason}\x1b[0m`);
  }

  console.log();
}