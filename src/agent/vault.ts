// ─────────────────────────────────────────────────
//  Stellar Pulse — Priority Vault
//
//  Entries use small XLM amounts so real testnet
//  payments don't drain the wallet quickly.
//  SAC_TRANSFER = real XLM tx on testnet
//  X402         = x402 micropayment flow
// ─────────────────────────────────────────────────

import { v4 as uuidv4 } from "uuid";
import type { VaultEntry, PaymentPriority, PaymentStatus } from "../types/index.js";
import { logger } from "../utils/logger.js";

const PRIORITY_ORDER: PaymentPriority[] = ["CRITICAL","HIGH","MEDIUM","LOW","DISCRETIONARY"];
const vault: Map<string, VaultEntry> = new Map();
let seeded = false;

export function seedDemoVault(agentPublicKey: string): void {
  if (seeded) return;
  seeded = true;

  // Small XLM amounts — real payments, but wallet stays funded
  // 1 XLM ≈ $0.09 — small enough for demo, real enough to prove testnet
  const entries: Omit<VaultEntry,"id"|"createdAt">[] = [
    {
      label: "Rent — PULSE Demo",
      description: "Real XLM payment on Stellar testnet (simulating USDC rent)",
      priority: "CRITICAL",
      // Public testnet address (Stellar's own testnet account)
      recipientAddress: "GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR",
      amountUSDC: "1",   // 1 XLM — real testnet payment
      method: "SAC_TRANSFER",
      memo: "PULSE:RENT",
      status: "PENDING",
      tags: ["housing","critical","real-tx"],
    },
    {
      label: "Payroll — PULSE Demo",
      description: "Real XLM payment on Stellar testnet (simulating salary)",
      priority: "CRITICAL",
      recipientAddress: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGMREASRD1SUFKPKBZNL1Q",
      amountUSDC: "1",
      method: "SAC_TRANSFER",
      memo: "PULSE:PAYROLL",
      status: "PENDING",
      tags: ["payroll","critical","real-tx"],
    },
    {
      label: "Analytics API (x402)",
      description: "x402 HTTP micropayment — Soroban auth entry flow",
      priority: "HIGH",
      recipientAddress: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGMREASRD1SUFKPKBZNL1Q",
      amountUSDC: "0.005",
      method: "X402",
      x402Endpoint: "http://localhost:4022/api/analytics",
      memo: "x402:analytics",
      status: "PENDING",
      tags: ["saas","x402"],
    },
    {
      label: "Market Data (x402)",
      description: "x402 pay-per-request market data feed",
      priority: "MEDIUM",
      recipientAddress: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGMREASRD1SUFKPKBZNL1Q",
      amountUSDC: "0.001",
      method: "X402",
      x402Endpoint: "http://localhost:4022/api/market-data",
      memo: "x402:market-data",
      status: "PENDING",
      tags: ["data","x402"],
    },
    {
      label: "AI Research Agent (x402)",
      description: "Agent-to-agent task payment via x402",
      priority: "LOW",
      recipientAddress: "GCFONE23AB7Y6C5XTEWARNJ3I3VWMS7IGHIVCAHOI3KKNCD44DTIWJXQ",
      amountUSDC: "0.005",
      method: "X402",
      x402Endpoint: "http://localhost:4022/api/research",
      memo: "x402:research",
      status: "PENDING",
      tags: ["agent","x402"],
    },
    {
      label: "Weather Feed (x402)",
      description: "Discretionary weather data per request",
      priority: "DISCRETIONARY",
      recipientAddress: "GCFONE23AB7Y6C5XTEWARNJ3I3VWMS7IGHIVCAHOI3KKNCD44DTIWJXQ",
      amountUSDC: "0.001",
      method: "X402",
      x402Endpoint: "http://localhost:4022/api/weather",
      memo: "x402:weather",
      status: "PENDING",
      tags: ["data","x402","discretionary"],
    },
  ];

  for (const e of entries) {
    vault.set(uuidv4(), { ...e, id: uuidv4(), createdAt: new Date() });
  }
  logger.info(`Vault seeded: ${vault.size} entries (2 real XLM txs + ${vault.size-2} x402)`);
}

export function resetX402ForNextCycle(): void {
  for (const [id, e] of vault.entries()) {
    if (e.method === "X402" && e.status === "SETTLED") {
      vault.set(id, { ...e, status: "PENDING" });
    }
  }
}

export function getActionableEntries(): VaultEntry[] {
  return [...vault.values()]
    .filter(e => e.status === "PENDING")
    .sort((a,b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));
}

export function addVaultEntry(e: Omit<VaultEntry,"id"|"createdAt">): VaultEntry {
  const id = uuidv4();
  const full = { ...e, id, createdAt: new Date() };
  vault.set(id, full);
  logger.info(`Vault: added [${e.priority}] ${e.label}`);
  return full;
}

export function getVaultEntry(id: string)      { return vault.get(id); }
export function getAllVaultEntries()            { return [...vault.values()]; }
export function updateEntryStatus(id: string, status: PaymentStatus) {
  const e = vault.get(id);
  if (e) vault.set(id, { ...e, status, lastExecutedAt: new Date() });
}
export function deleteEntry(id: string)        { return vault.delete(id); }
export function killEntry(id: string)          { updateEntryStatus(id, "KILLED"); }
export function killAllDiscretionary(): number {
  let n = 0;
  for (const [id, e] of vault.entries()) {
    if (e.priority === "DISCRETIONARY" && e.status === "PENDING") {
      vault.set(id, { ...e, status: "KILLED" });
      n++;
    }
  }
  return n;
}

export function getVaultSummary() {
  const all = [...vault.values()];
  const pending = all.filter(e=>e.status==="PENDING");
  return {
    total:              all.length,
    pending:            pending.length,
    settled:            all.filter(e=>e.status==="SETTLED").length,
    killed:             all.filter(e=>e.status==="KILLED").length,
    failed:             all.filter(e=>e.status==="FAILED").length,
    x402Services:       all.filter(e=>e.method==="X402").length,
    realTxEntries:      all.filter(e=>e.method==="SAC_TRANSFER").length,
    totalScheduledUSDC: pending.reduce((s,e)=>s+parseFloat(e.amountUSDC),0).toFixed(7),
    byPriority: Object.fromEntries(["CRITICAL","HIGH","MEDIUM","LOW","DISCRETIONARY"].map(p=>[p,all.filter(e=>e.priority===p).length])),
  };
}