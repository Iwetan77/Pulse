// ─────────────────────────────────────────────────
//  Stellar Pulse — Priority Vault
//
//  The vault is the core of Pulse. Every obligation
//  is ranked by priority. The agent respects this
//  order when wallet funds are limited.
//
//  Priority order: CRITICAL > HIGH > MEDIUM > LOW > DISCRETIONARY
// ─────────────────────────────────────────────────

import { v4 as uuidv4 } from "uuid";
import type { VaultEntry, PaymentPriority, PaymentStatus } from "../types/index.js";
import { logger } from "../utils/logger.js";

const PRIORITY_ORDER: PaymentPriority[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "DISCRETIONARY",
];

// ── In-memory vault store ─────────────────────────
const vault: Map<string, VaultEntry> = new Map();

// ── Seed with demo obligations ────────────────────
export function seedDemoVault(agentPublicKey: string): void {
  const demoEntries: Omit<VaultEntry, "id" | "createdAt">[] = [
    {
      label: "Monthly Rent",
      description: "Automated rent payment to landlord wallet",
      priority: "CRITICAL",
      recipientAddress: "GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ",
      amountUSDC: "500.00",
      method: "SAC_TRANSFER",
      recurringCron: "0 9 1 * *",  // 9am on 1st of month
      memo: "RENT-2026",
      status: "PENDING",
      tags: ["housing", "critical", "recurring"],
    },
    {
      label: "Staff Payroll — Engineering",
      description: "Monthly salary for engineering team",
      priority: "CRITICAL",
      recipientAddress: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGMREASRD1SUFKPKBZNL1Q",
      amountUSDC: "2000.00",
      method: "SAC_TRANSFER",
      recurringCron: "0 10 28 * *", // 10am on 28th of month
      memo: "PAYROLL-ENG-APR26",
      status: "PENDING",
      tags: ["payroll", "critical", "recurring"],
    },
    {
      label: "Stellar Horizon API",
      description: "Pay-per-query Horizon data feed via x402",
      priority: "MEDIUM",
      recipientAddress: "GAHK7EEG2WWHVKDNT4CEQFZGKF2LGDSW2IVM4S5DP42RBW3K6BTODB4",
      amountUSDC: "0.001",
      method: "X402",
      x402Endpoint: "http://localhost:4022/api/market-data",
      memo: "x402:horizon-data",
      status: "PENDING",
      tags: ["api", "data", "x402", "per-use"],
    },
    {
      label: "AI Research Agent",
      description: "Agent-to-agent payment for research task execution",
      priority: "LOW",
      recipientAddress: "GCFONE23AB7Y6C5XTEWARNJ3I3VWMS7IGHIVCAHOI3KKNCD44DTIWJXQ",
      amountUSDC: "0.005",
      method: "X402",
      x402Endpoint: "http://localhost:4022/api/research",
      memo: "x402:agent-research",
      status: "PENDING",
      tags: ["agent", "automation", "x402", "per-use"],
    },
    {
      label: "Weather Data Feed",
      description: "Per-request weather data for autonomous agent decisions",
      priority: "DISCRETIONARY",
      recipientAddress: "GAHK7EEG2WWHVKDNT4CEQFZGKF2LGDSW2IVM4S5DP42RBW3K6BTODB4",
      amountUSDC: "0.001",
      method: "X402",
      x402Endpoint: "http://localhost:4022/api/weather",
      memo: "x402:weather",
      status: "PENDING",
      tags: ["data", "x402", "per-use", "discretionary"],
    },
    {
      label: "Business Analytics SaaS",
      description: "Monthly analytics platform subscription (pay-per-session)",
      priority: "HIGH",
      recipientAddress: "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGMREASRD1SUFKPKBZNL1Q",
      amountUSDC: "25.00",
      method: "X402",
      x402Endpoint: "http://localhost:4022/api/analytics",
      recurringCron: "0 8 1 * *",
      memo: "x402:analytics-subs",
      status: "PENDING",
      tags: ["saas", "analytics", "x402"],
    },
  ];

  for (const entry of demoEntries) {
    const id = uuidv4();
    vault.set(id, { ...entry, id, createdAt: new Date() });
  }

  logger.info(`Priority Vault seeded with ${vault.size} entries`);
}

// ── CRUD ──────────────────────────────────────────

export function addVaultEntry(
  entry: Omit<VaultEntry, "id" | "createdAt">
): VaultEntry {
  const id = uuidv4();
  const full: VaultEntry = { ...entry, id, createdAt: new Date() };
  vault.set(id, full);
  logger.info(`Vault entry added: [${entry.priority}] ${entry.label}`);
  return full;
}

export function getVaultEntry(id: string): VaultEntry | undefined {
  return vault.get(id);
}

export function getAllVaultEntries(): VaultEntry[] {
  return [...vault.values()];
}

export function getEntriesByPriority(priority: PaymentPriority): VaultEntry[] {
  return [...vault.values()].filter((e) => e.priority === priority);
}

export function getSortedVaultEntries(): VaultEntry[] {
  return [...vault.values()].sort(
    (a, b) =>
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
  );
}

export function getX402Entries(): VaultEntry[] {
  return [...vault.values()].filter((e) => e.method === "X402");
}

export function updateEntryStatus(id: string, status: PaymentStatus): void {
  const entry = vault.get(id);
  if (entry) {
    vault.set(id, { ...entry, status, lastExecutedAt: new Date() });
    logger.info(`Vault [${id.slice(0, 8)}] status → ${status}`);
  }
}

export function killEntry(id: string): void {
  updateEntryStatus(id, "KILLED");
  logger.warn(`Kill switch activated for vault entry ${id.slice(0, 8)}`);
}

export function killAllDiscretionary(): number {
  let count = 0;
  for (const [id, entry] of vault.entries()) {
    if (entry.priority === "DISCRETIONARY" && entry.status === "PENDING") {
      vault.set(id, { ...entry, status: "KILLED" });
      count++;
    }
  }
  logger.warn(`Kill switch: halted ${count} DISCRETIONARY entries`);
  return count;
}

export function getVaultSummary() {
  const entries = [...vault.values()];
  const totalScheduled = entries
    .filter((e) => e.status === "PENDING")
    .reduce((sum, e) => sum + parseFloat(e.amountUSDC), 0);

  return {
    total: entries.length,
    pending: entries.filter((e) => e.status === "PENDING").length,
    settled: entries.filter((e) => e.status === "SETTLED").length,
    killed: entries.filter((e) => e.status === "KILLED").length,
    x402Services: entries.filter((e) => e.method === "X402").length,
    totalScheduledUSDC: totalScheduled.toFixed(7),
    byPriority: Object.fromEntries(
      PRIORITY_ORDER.map((p) => [
        p,
        entries.filter((e) => e.priority === p).length,
      ])
    ),
  };
}