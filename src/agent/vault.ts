// ─────────────────────────────────────────────────
//  Stellar Pulse — Priority Vault
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

  const entries: Omit<VaultEntry,"id"|"createdAt">[] = [
    {
      label: "Rent — PULSE Demo",
      description: "Monthly rent payment on Stellar testnet",
      priority: "CRITICAL",
      recipientAddress: "GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR",
      amountUSDC: "20",
      method: "SAC_TRANSFER",
      memo: "PULSE:RENT",
      status: "PENDING",
      tags: ["housing","critical","real-tx"],
    },
    {
      label: "Payroll — PULSE Demo",
      description: "Employee salary payment on Stellar testnet",
      priority: "CRITICAL",
      recipientAddress: "GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR",
      amountUSDC: "30",
      method: "SAC_TRANSFER",
      memo: "PULSE:PAYROLL",
      status: "PENDING",
      tags: ["payroll","critical","real-tx"],
    },
    {
      label: "Cloud Infrastructure (x402)",
      description: "Pay-per-use cloud compute via x402",
      priority: "HIGH",
      recipientAddress: "GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR",
      amountUSDC: "25",
      method: "X402",
      x402Endpoint: "http://localhost:4022/api/analytics",
      memo: "x402:cloud",
      status: "PENDING",
      tags: ["saas","x402","infrastructure"],
    },
    {
      label: "Market Data Feed (x402)",
      description: "Real-time Stellar market data — agent pays per request",
      priority: "MEDIUM",
      recipientAddress: "GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR",
      amountUSDC: "20",
      method: "X402",
      x402Endpoint: "http://localhost:4022/api/market-data",
      memo: "x402:market-data",
      status: "PENDING",
      tags: ["data","x402"],
    },
    {
      label: "AI Research Agent (x402)",
      description: "Agent-to-agent task payment — autonomous research delegation",
      priority: "LOW",
      recipientAddress: "GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR",
      amountUSDC: "20",
      method: "X402",
      x402Endpoint: "http://localhost:4022/api/research",
      memo: "x402:research",
      status: "PENDING",
      tags: ["agent","x402"],
    },
    {
      label: "Weather Intelligence (x402)",
      description: "Discretionary weather data for agent decision-making",
      priority: "DISCRETIONARY",
      recipientAddress: "GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR",
      amountUSDC: "20",
      method: "X402",
      x402Endpoint: "http://localhost:4022/api/weather",
      memo: "x402:weather",
      status: "PENDING",
      tags: ["data","x402","discretionary"],
    },
  ];

  for (const e of entries) {
    // FIX: use the SAME id for both the map key and the entry object
    const id = uuidv4();
    vault.set(id, { ...e, id, createdAt: new Date() });
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
    totalScheduledUSDC: pending.reduce((s,e)=>s+parseFloat(e.amountUSDC),0).toFixed(2),
    byPriority: Object.fromEntries(["CRITICAL","HIGH","MEDIUM","LOW","DISCRETIONARY"].map(p=>[p,all.filter(e=>e.priority===p).length])),
  };
}