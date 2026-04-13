// ─────────────────────────────────────────────────
//  Stellar Pulse — Agent Policy
//
//  Evaluates vault entries against wallet balances
//  and decides: EXECUTE, SIMULATE, DEFER, or KILL.
//
//  EXECUTE  = real on-chain USDC payment (SAC_TRANSFER)
//  SIMULATE = x402 micropayment flow (demo or live)
//  DEFER    = insufficient funds or category paused
//  KILL     = kill switch active for non-CRITICAL items
//
//  In demo mode: x402 entries always SIMULATE (real flow,
//  simulated settlement). SAC_TRANSFER entries always EXECUTE
//  (real on-chain USDC tx after XLM→USDC swap if needed).
// ─────────────────────────────────────────────────

import type {
  WalletSnapshot,
  VaultEntry,
  AgentDecision,
  PaymentPriority,
} from "../types/index.js";
import { config } from "../utils/config.js";
import { logger } from "../utils/logger.js";

const PRIORITY_ORDER: PaymentPriority[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "DISCRETIONARY",
];

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
  const availableUSDC = parseFloat(wallet.usdcBalance) || 0;
  const availableXLM  = parseFloat(wallet.xlmBalance)  || 0;
  const isDemo        = config.demoMode;

  const decisions: AgentDecision[] = [];
  let remainingUSDC   = availableUSDC;
  let totalAffordable = 0;

  const sorted = [...entries].sort(
    (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
  );

  const totalRequired = sorted.reduce((s, e) => s + parseFloat(e.amountUSDC), 0);
  const xlmHealthy    = availableXLM >= MIN_XLM_RESERVE;

  for (const entry of sorted) {
    const amount = parseFloat(entry.amountUSDC);

    // Kill switch halts everything except CRITICAL
    if (killSwitchActive && entry.priority !== "CRITICAL") {
      decisions.push({
        action: "KILL",
        vaultEntry: entry,
        reason: `Kill switch active — halting ${entry.priority} payment`,
        walletSnapshot: wallet,
        projectedBalanceAfter: remainingUSDC.toFixed(2),
      });
      continue;
    }

    // Paused category
    if (pausedCategories.includes(entry.priority)) {
      decisions.push({
        action: "DEFER",
        vaultEntry: entry,
        reason: `Category ${entry.priority} paused by user`,
        walletSnapshot: wallet,
        projectedBalanceAfter: remainingUSDC.toFixed(2),
      });
      continue;
    }

    // XLM fee check — need some XLM for transaction fees
    if (!xlmHealthy) {
      decisions.push({
        action: "DEFER",
        vaultEntry: entry,
        reason: `Insufficient XLM for fees (${availableXLM.toFixed(2)} XLM < ${MIN_XLM_RESERVE} minimum)`,
        walletSnapshot: wallet,
        projectedBalanceAfter: remainingUSDC.toFixed(2),
      });
      continue;
    }

    // x402 entries: always SIMULATE (demo) — shows real protocol flow
    if (entry.method === "X402") {
      totalAffordable += amount;
      decisions.push({
        action: "SIMULATE",
        vaultEntry: entry,
        reason: isDemo
          ? `[DEMO] x402 micropayment — $${amount.toFixed(2)} USDC via Soroban auth entry`
          : `x402 HTTP payment — $${amount.toFixed(2)} USDC, Soroban auth entry signed`,
        walletSnapshot: wallet,
        projectedBalanceAfter: (remainingUSDC - totalAffordable).toFixed(2),
      });
      continue;
    }

    // SAC_TRANSFER entries: EXECUTE — real USDC on-chain
    // The executor will swap XLM→USDC if wallet USDC is insufficient
    // We check only that XLM is available for the swap
    const xlmNeededForSwap = amount > availableUSDC ? Math.ceil((amount - availableUSDC) / 0.08 * 1.3) : 0;
    const canAfford = availableXLM >= xlmNeededForSwap + MIN_XLM_RESERVE;

    if (canAfford) {
      totalAffordable += amount;
      remainingUSDC   -= amount;
      decisions.push({
        action: "EXECUTE",
        vaultEntry: entry,
        reason: availableUSDC >= amount
          ? `USDC available ($${availableUSDC.toFixed(2)}) — executing $${amount.toFixed(2)} USDC transfer`
          : `Will swap ~${xlmNeededForSwap} XLM → USDC then send $${amount.toFixed(2)} USDC`,
        walletSnapshot: wallet,
        projectedBalanceAfter: Math.max(0, remainingUSDC).toFixed(2),
      });
    } else {
      decisions.push({
        action: "DEFER",
        vaultEntry: entry,
        reason: entry.priority === "CRITICAL"
          ? `⚠ CRITICAL: need ~${xlmNeededForSwap} XLM for swap, only ${availableXLM.toFixed(2)} available`
          : `Insufficient XLM for swap — deferring to next cycle`,
        walletSnapshot: wallet,
        projectedBalanceAfter: remainingUSDC.toFixed(2),
      });
    }
  }

  const walletHealthy =
    xlmHealthy &&
    !decisions.some((d) => d.action === "DEFER" && d.vaultEntry.priority === "CRITICAL");

  const recommendation = availableXLM >= totalRequired / 0.08
    ? `Wallet healthy — ${availableXLM.toFixed(0)} XLM can cover all $${totalRequired.toFixed(2)} USDC obligations`
    : `Wallet short — ${availableXLM.toFixed(0)} XLM available for swaps`;

  return {
    decisions,
    totalAffordableUSDC: totalAffordable.toFixed(2),
    totalRequiredUSDC:   totalRequired.toFixed(2),
    walletHealthy,
    recommendation,
  };
}

export function logPolicyEvaluation(eval_: PolicyEvaluation): void {
  logger.divider("POLICY EVALUATION");
  logger.snapshot("Obligations", {
    "Required (USDC)":   `$${eval_.totalRequiredUSDC}`,
    "Affordable (USDC)": `$${eval_.totalAffordableUSDC}`,
    "Status":            eval_.walletHealthy ? "✓ HEALTHY" : "⚠ UNDERFUNDED",
    "Note":              eval_.recommendation,
  });

  for (const d of eval_.decisions) {
    const icon = d.action === "EXECUTE"  ? "\x1b[32m▶\x1b[0m"
               : d.action === "SIMULATE" ? "\x1b[34m◎\x1b[0m"
               : d.action === "DEFER"    ? "\x1b[33m⏸\x1b[0m"
               :                          "\x1b[31m✗\x1b[0m";
    const amt = `$${parseFloat(d.vaultEntry.amountUSDC).toFixed(2)}`;
    console.log(
      `  ${icon} ${d.vaultEntry.priority.padEnd(14)} ${d.vaultEntry.label.padEnd(34)} ` +
      `${amt.padStart(10)} USDC  → ${d.action}`
    );
  }
  console.log();
}