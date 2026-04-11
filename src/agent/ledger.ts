// ─────────────────────────────────────────────────
//  Stellar Pulse — On-Chain Ledger of Life
//
//  Every financial event is recorded here.
//  In production this would write to Horizon/RPC
//  as structured memos. For this demo it maintains
//  a comprehensive in-memory audit log.
// ─────────────────────────────────────────────────

import type { PaymentEvent, PulseSnapshot } from "../types/index.js";
import { logger } from "../utils/logger.js";

const ledger: PaymentEvent[] = [];
const snapshots: PulseSnapshot[] = [];

export function recordEvent(event: PaymentEvent): void {
  ledger.push(event);

  const icon =
    event.status === "SETTLED"    ? "✓" :
    event.status === "FAILED"     ? "✗" :
    event.status === "KILLED"     ? "⊘" :
    event.status === "PROCESSING" ? "⟳" : "◦";

  logger.info(
    `[LEDGER] ${icon} ${event.priority.padEnd(14)} ` +
    `${event.label.padEnd(30)} ` +
    `${event.amountUSDC.padStart(12)} USDC  [${event.status}]` +
    (event.txHash ? `  tx:${event.txHash.slice(0, 12)}…` : "")
  );
}

export function getRecentEvents(limit = 50): PaymentEvent[] {
  return ledger.slice(-limit);
}

export function getAllEvents(): PaymentEvent[] {
  return [...ledger];
}

export function getEventsByStatus(status: PaymentEvent["status"]): PaymentEvent[] {
  return ledger.filter((e) => e.status === status);
}

export function getTotalSpent(): string {
  const total = ledger
    .filter((e) => e.status === "SETTLED")
    .reduce((sum, e) => sum + parseFloat(e.amountUSDC), 0);
  return total.toFixed(7);
}

export function getX402Summary() {
  const x402Events = ledger.filter((e) => e.method === "X402" && e.status === "SETTLED");
  const totalPaid = x402Events.reduce((s, e) => s + parseFloat(e.amountUSDC), 0);
  return {
    totalRequests: x402Events.length,
    totalPaidUSDC: totalPaid.toFixed(7),
    services: [...new Set(x402Events.map((e) => e.label))],
  };
}

export function recordSnapshot(snapshot: PulseSnapshot): void {
  snapshots.push(snapshot);
}

export function getLatestSnapshot(): PulseSnapshot | null {
  return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
}

export function printLedger(limit = 20): void {
  logger.divider("LEDGER OF LIFE — RECENT TRANSACTIONS");
  const events = ledger.slice(-limit);

  if (events.length === 0) {
    logger.info("No events recorded yet.");
    return;
  }

  for (const e of events) {
    const ts  = e.timestamp.toISOString().slice(11, 19);
    const st  = e.status.padEnd(12);
    const pri = e.priority.padEnd(14);
    const lbl = e.label.padEnd(32);
    const amt = e.amountUSDC.padStart(12);
    const mth = e.method;

    console.log(`  ${ts}  ${pri}  ${lbl}  ${amt} USDC  [${st}]  ${mth}`);
    if (e.txHash) {
      console.log(`           └─ tx: ${e.txHash}`);
    }
    if (e.x402Response?.facilitatorSettlementTxHash) {
      console.log(`           └─ x402 settled: ${e.x402Response.facilitatorSettlementTxHash}`);
    }
  }
  console.log();
}