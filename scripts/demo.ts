// ─────────────────────────────────────────────────
//  Stellar Pulse — Demo Script
//
//  Runs a single agent iteration with mock data.
//  Produces a clean DEMO SNAPSHOT for judges.
//  No wallet required. No real transactions.
// ─────────────────────────────────────────────────

import { logger } from "../src/utils/logger.js";

// Force demo mode
process.env.DEMO_MODE = "true";
process.env.STELLAR_NETWORK = "testnet";
process.env.AGENT_LOOP_INTERVAL_SECONDS = "9999";

// ── Mock wallet state ─────────────────────────────
const mockWallet = {
  publicKey: "GDEMO1234STELLARPULSEAGENTWALLETADDRESS56789ABCDEF",
  xlmBalance: "9450.123",
  usdcBalance: "847.50",
  usdcContractId: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  sequence: "4611686018427387905",
  lastUpdated: new Date(),
};

// ── Mock vault obligations ─────────────────────────
const mockVault = [
  {
    priority: "CRITICAL",
    label: "Monthly Rent",
    amountUSDC: "500.00",
    method: "SAC_TRANSFER",
    status: "PENDING",
    action: "EXECUTE",
    decision: "SAC USDC transfer via Soroban — simulated",
    balanceAfter: "347.50",
  },
  {
    priority: "CRITICAL",
    label: "Staff Payroll — Engineering",
    amountUSDC: "2000.00",
    method: "SAC_TRANSFER",
    status: "PENDING",
    action: "DEFER",
    decision: "⚠ Insufficient funds — need 2000 USDC, have 347.50",
    balanceAfter: "347.50",
  },
  {
    priority: "HIGH",
    label: "Business Analytics SaaS",
    amountUSDC: "25.00",
    method: "X402",
    status: "PENDING",
    action: "EXECUTE",
    decision: "x402 HTTP payment — Soroban auth entry signed",
    balanceAfter: "322.50",
  },
  {
    priority: "MEDIUM",
    label: "Stellar Horizon API",
    amountUSDC: "0.001",
    method: "X402",
    status: "PENDING",
    action: "EXECUTE",
    decision: "x402 micropayment — $0.001 USDC per request",
    balanceAfter: "322.499",
  },
  {
    priority: "LOW",
    label: "AI Research Agent",
    amountUSDC: "0.005",
    method: "X402",
    status: "PENDING",
    action: "EXECUTE",
    decision: "Agent-to-agent x402 payment — research task",
    balanceAfter: "322.494",
  },
  {
    priority: "DISCRETIONARY",
    label: "Weather Data Feed",
    amountUSDC: "0.001",
    method: "X402",
    status: "PENDING",
    action: "EXECUTE",
    decision: "x402 micropayment — discretionary data subscription",
    balanceAfter: "322.493",
  },
];

// ── x402 payment simulation ───────────────────────
async function simulateX402(label: string, amount: string, endpoint: string) {
  logger.x402(`→ GET ${endpoint}`);
  await sleep(120);
  logger.x402(`← 402 Payment Required: ${amount} USDC on stellar:testnet`);
  await sleep(80);
  logger.soroban(`  Signing Soroban authorization entry (USDC SAC)…`);
  await sleep(200);
  const hash = `DEMO${Math.random().toString(36).slice(2, 10).toUpperCase()}SETTLE`;
  logger.x402(`  Facilitator settled: ${hash}`);
  await sleep(60);
  logger.x402(`← 200 OK — Resource delivered`);
  logger.success(`  [SETTLED] ${label}  ${amount} USDC`);
}

// ── SAC transfer simulation ───────────────────────
async function simulateSAC(label: string, amount: string, recipient: string) {
  logger.soroban(`Building Soroban SAC invoke: transfer(${amount} USDC → ${recipient.slice(0, 8)}…)`);
  await sleep(150);
  logger.soroban(`Simulating transaction via Soroban RPC…`);
  await sleep(300);
  logger.soroban(`Simulation successful — contract: CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`);
  logger.success(`  [SIMULATED] ${label}  ${amount} USDC (demo — not submitted)`);
}

async function runDemo() {
  // ── DEMO SNAPSHOT HEADER ─────────────────────────
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║          STELLAR PULSE — DEMO SNAPSHOT                  ║");
  console.log("║      Autonomous On-Chain Financial Operating System      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log();

  // Wallet state
  console.log("  ┌─ WALLET STATE ─────────────────────────────────────────┐");
  console.log(`  │  Public Key   ${mockWallet.publicKey.slice(0, 20)}…`);
  console.log(`  │  XLM Balance  ${mockWallet.xlmBalance} XLM`);
  console.log(`  │  USDC Balance ${mockWallet.usdcBalance} USDC`);
  console.log(`  │  Network      stellar:testnet`);
  console.log(`  │  Soroban SAC  ${mockWallet.usdcContractId.slice(0, 20)}…`);
  console.log("  └────────────────────────────────────────────────────────┘");
  console.log();

  // Priority vault matrix
  console.log("  ┌─ PRIORITY VAULT — DECISION MATRIX ────────────────────┐");
  console.log("  │  Priority       Label                     Amount       Action");
  console.log("  │  ─────────────────────────────────────────────────────────");
  for (const e of mockVault) {
    const pri = e.priority.padEnd(14);
    const lbl = e.label.padEnd(34);
    const amt = e.amountUSDC.padStart(10);
    const act = e.action === "EXECUTE" ? "▶ EXECUTE" :
                e.action === "DEFER"   ? "⏸ DEFER  " : "◎ EXECUTE";
    console.log(`  │  ${pri}${lbl}${amt} USDC  ${act}`);
  }
  console.log("  └────────────────────────────────────────────────────────┘");
  console.log();

  await sleep(300);

  // Execute payments
  logger.divider("EXECUTING PAYMENTS");

  // SAC transfer: Rent
  await simulateSAC("Monthly Rent", "500.00", "GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ");
  await sleep(200);

  // Defer: Payroll (insufficient funds)
  logger.warn("[DEFER] Staff Payroll — insufficient funds (need 2000 USDC, have 347.50)");
  await sleep(150);

  // x402 payments
  await simulateX402("Business Analytics SaaS", "$25.00", "http://localhost:4022/api/analytics");
  await sleep(200);
  await simulateX402("Stellar Horizon API",     "$0.001", "http://localhost:4022/api/market-data");
  await sleep(150);
  await simulateX402("AI Research Agent",       "$0.005", "http://localhost:4022/api/research");
  await sleep(150);
  await simulateX402("Weather Data Feed",       "$0.001", "http://localhost:4022/api/weather");
  await sleep(200);

  // Final snapshot
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║              PULSE SNAPSHOT — ITERATION 1               ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  Wallet:       847.50 USDC / 9450.12 XLM                ║`);
  console.log(`║  Executed:     ✓ Rent (SAC/Soroban)  ✓ Analytics (x402) ║`);
  console.log(`║               ✓ Market data  ✓ Research  ✓ Weather      ║`);
  console.log(`║  Deferred:     ⏸ Payroll — insufficient USDC            ║`);
  console.log(`║  x402 paid:    $25.007 USDC across 4 services           ║`);
  console.log(`║  Soroban SAC:  1 transfer simulated (500.00 USDC)       ║`);
  console.log(`║  Facilitator:  https://www.x402.org/facilitator         ║`);
  console.log(`║  Network:      stellar:testnet                           ║`);
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log();

  logger.success("Demo complete. Run `npm run dev` for the full live system.");
  logger.info(`Dashboard: http://localhost:4021`);
  logger.info(`x402 API:  http://localhost:4022`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Log simulation helpers ────────────────────────
const sorobanLog = (msg: string) => console.log(`  \x1b[35m◈ [SOROBAN ]\x1b[0m ${msg}`);
const x402Log    = (msg: string) => console.log(`  \x1b[34m₄₀₂ [X402   ]\x1b[0m ${msg}`);

// Attach to logger namespace for demo
Object.assign(logger, {
  soroban: sorobanLog,
  x402: x402Log,
});

runDemo().catch((err) => {
  console.error("Demo error:", err);
  process.exit(1);
});