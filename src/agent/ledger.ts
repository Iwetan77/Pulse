// ─────────────────────────────────────────────────
//  Stellar Pulse — Ledger of Life
//  Records every payment event + SDEX swap events
// ─────────────────────────────────────────────────

import type { PaymentEvent, PulseSnapshot } from "../types/index.js";
import { logger } from "../utils/logger.js";

const ledger: PaymentEvent[] = [];
const snapshots: PulseSnapshot[] = [];

// ── Swap events (XLM → USDC via SDEX) ────────────
export interface SwapEvent {
  id: string;
  timestamp: Date;
  type: "XLM_USDC_SWAP";
  xlmSpent: string;
  usdcReceived: string;
  txHash: string;
  explorerUrl: string;
}
const swapLog: SwapEvent[] = [];

export function recordSwapEvent(hash: string, url: string, xlm: string, usdc: string): void {
  swapLog.push({
    id: hash, timestamp: new Date(), type: "XLM_USDC_SWAP",
    xlmSpent: xlm, usdcReceived: usdc, txHash: hash, explorerUrl: url,
  });
  logger.success(`[SWAP] ${xlm} XLM → ${usdc} USDC via SDEX | ${url}`);
}

export function getSwapEvents(): SwapEvent[] { return [...swapLog]; }

// ── Payment events ────────────────────────────────
export function recordEvent(event: PaymentEvent): void {
  ledger.push(event);
  const icon = event.status === "SETTLED" ? "✓" : event.status === "FAILED" ? "✗" : event.status === "KILLED" ? "⊘" : "⟳";
  const tx   = event.txHash ? ` | tx:${event.txHash.slice(0, 12)}…` : "";
  const url  = (event as any).explorerUrl ? ` → ${(event as any).explorerUrl}` : "";
  logger.info(`[LEDGER] ${icon} ${event.priority.padEnd(14)} ${event.label.padEnd(30)} ${event.amountUSDC.padStart(10)} XLM [${event.status}]${tx}${url}`);
}

export function getRecentEvents(n = 50):  PaymentEvent[] { return ledger.slice(-n); }
export function getAllEvents():           PaymentEvent[] { return [...ledger]; }
export function getTotalSpent():         string         { return ledger.filter(e => e.status === "SETTLED").reduce((s, e) => s + parseFloat(e.amountUSDC), 0).toFixed(7); }

export function getX402Summary() {
  const x = ledger.filter(e => e.method === "X402" && e.status === "SETTLED");
  return { totalRequests: x.length, totalPaidUSDC: x.reduce((s, e) => s + parseFloat(e.amountUSDC), 0).toFixed(7), services: [...new Set(x.map(e => e.label))] };
}

export function recordSnapshot(snap: PulseSnapshot): void { snapshots.push(snap); }
export function getLatestSnapshot(): PulseSnapshot | null { return snapshots.length ? snapshots[snapshots.length - 1] : null; }

export function printLedger(n = 10): void {
  logger.divider("LEDGER OF LIFE");
  const evts = ledger.slice(-n);
  if (!evts.length) { logger.info("No events yet."); return; }
  for (const e of evts) {
    const t   = e.timestamp.toISOString().slice(11, 19);
    const url = (e as any).explorerUrl ? ` ↗ ${(e as any).explorerUrl}` : "";
    console.log(`  ${t}  ${e.priority.padEnd(14)}  ${e.label.padEnd(30)}  ${e.amountUSDC.padStart(8)} XLM  [${e.status}]${url}`);
  }
  console.log();
}