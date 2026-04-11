// ─────────────────────────────────────────────────
//  Stellar Pulse — Payment Executor
//
//  Executes agent decisions:
//    EXECUTE  → SAC transfer (Soroban) — simulated in demo mode
//    SIMULATE → x402 pay-per-use HTTP call — real x402 flow
//    DEFER    → logged only
//    KILL     → entry marked, logged
// ─────────────────────────────────────────────────

import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { createEd25519Signer } from "@x402/stellar";
import type { AgentDecision, PaymentEvent } from "../types/index.js";
import { config } from "../utils/config.js";
import { logger } from "../utils/logger.js";
import { simulateSACTransfer, executeSACTransfer, getKeypair } from "../utils/wallet.js";
import { updateEntryStatus, getVaultEntry } from "./vault.js";
import { recordEvent } from "./ledger.js";
import { v4 as uuidv4 } from "uuid";

// ── Build a paid fetch client (x402) ─────────────
// wrapFetchWithPayment intercepts 402 responses,
// builds a ClientStellarSigner via createEd25519Signer,
// signs a Soroban authorization entry for the USDC SAC,
// and retries with X-PAYMENT header.
// The Coinbase facilitator then verifies and settles on-chain.
function buildX402Fetch() {
  try {
    if (config.demoMode || !config.secretKey) {
      logger.x402("Demo mode: x402 fetch will simulate payment flow");
      return null;
    }

    const keypair = getKeypair();
    const network = config.x402Network as "stellar:testnet" | "stellar:pubnet";

    // createEd25519Signer produces a ClientStellarSigner implementing
    // signAuthEntry (SEP-43) — the Soroban auth entry signing used by x402
    const signer = createEd25519Signer(keypair.secret(), network);

    // Register ExactStellarScheme for the testnet network
    const client = new x402Client().register(
      network,
      new ExactStellarScheme(signer)
    );

    return wrapFetchWithPayment(fetch, client);
  } catch (err) {
    logger.warn("Could not build x402 fetch client", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Execute a single agent decision ──────────────
export async function executeDecision(
  decision: AgentDecision
): Promise<PaymentEvent> {
  const { action, vaultEntry } = decision;

  const event: PaymentEvent = {
    id: uuidv4(),
    vaultEntryId: vaultEntry.id,
    label: vaultEntry.label,
    priority: vaultEntry.priority,
    method: vaultEntry.method,
    amountUSDC: vaultEntry.amountUSDC,
    recipientAddress: vaultEntry.recipientAddress,
    status: "PROCESSING",
    memo: vaultEntry.memo,
    timestamp: new Date(),
  };

  try {
    switch (action) {
      case "EXECUTE":
        await handleSACTransfer(event, vaultEntry.memo);
        break;
      case "SIMULATE":
        await handleX402Payment(event);
        break;
      case "DEFER":
        event.status = "PENDING";
        logger.agent(`[DEFER] ${vaultEntry.priority} — ${vaultEntry.label}: ${decision.reason}`);
        break;
      case "KILL":
        event.status = "KILLED";
        updateEntryStatus(vaultEntry.id, "KILLED");
        logger.warn(`[KILL] ${vaultEntry.label} halted by agent`);
        break;
    }
  } catch (err) {
    event.status = "FAILED";
    event.error = err instanceof Error ? err.message : String(err);
    updateEntryStatus(vaultEntry.id, "FAILED");
    logger.error(`[FAILED] ${vaultEntry.label}`, event.error);
  }

  recordEvent(event);
  return event;
}

// ── SAC Transfer (Soroban) ────────────────────────
async function handleSACTransfer(
  event: PaymentEvent,
  memo?: string
): Promise<void> {
  if (config.demoMode) {
    // In demo mode: simulate the Soroban call, don't submit
    const sim = await simulateSACTransfer(
      config.publicKey || "GDEMO...",
      event.recipientAddress,
      event.amountUSDC
    );
    event.sacTransferDetails = sim;
    event.status = sim.simulationSuccess ? "SETTLED" : "FAILED";

    if (sim.simulationSuccess) {
      logger.soroban(
        `[DEMO SIMULATE] SAC transfer: ${event.amountUSDC} USDC → ${event.recipientAddress.slice(0, 8)}…`
      );
      updateEntryStatus(event.vaultEntryId!, "SETTLED");
    }
    return;
  }

  // Real execution via Soroban SAC
  logger.soroban(
    `Executing SAC transfer: ${event.amountUSDC} USDC → ${event.recipientAddress.slice(0, 8)}…`
  );
  const txHash = await executeSACTransfer(
    event.recipientAddress,
    event.amountUSDC,
    memo
  );

  event.txHash = txHash;
  event.status = "SETTLED";
  event.sacTransferDetails = {
    contractId: config.network === "mainnet"
      ? "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7EJJUD"
      : "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    fromAddress: config.publicKey,
    toAddress: event.recipientAddress,
    amount: event.amountUSDC,
    simulationSuccess: true,
    simulationResult: txHash,
  };

  updateEntryStatus(event.vaultEntryId!, "SETTLED");
  logger.success(`SAC transfer settled: ${txHash}`);
}

// ── x402 Payment ──────────────────────────────────
async function handleX402Payment(event: PaymentEvent): Promise<void> {
  const entry = event.vaultEntryId ? getVaultEntry(event.vaultEntryId) : undefined;
  const endpoint = entry?.x402Endpoint;

  if (!endpoint) {
    throw new Error(`No x402 endpoint configured for: ${event.label}`);
  }

  logger.x402(`Initiating x402 payment: ${event.amountUSDC} USDC → ${endpoint}`);

  if (config.demoMode || !config.secretKey) {
    // Demo mode: simulate the full x402 round-trip
    const mockReceipt = await simulateX402Payment(endpoint, event.amountUSDC);
    event.x402Response = mockReceipt;
    event.status = "SETTLED";
    updateEntryStatus(event.vaultEntryId!, "SETTLED");
    return;
  }

  // Real x402 flow
  const paidFetch = buildX402Fetch();
  if (!paidFetch) {
    throw new Error("x402 client unavailable");
  }

  const response = await paidFetch(endpoint, { method: "GET" });

  if (response.ok) {
    const data = await response.json();
    event.x402Response = {
      endpoint,
      network: config.x402Network,
      amountPaid: event.amountUSDC,
      responseData: data,
    };
    event.status = "SETTLED";
    updateEntryStatus(event.vaultEntryId!, "SETTLED");
    logger.x402(`Payment accepted. Resource delivered from ${endpoint}`);
    logger.success(`x402 settled: ${event.amountUSDC} USDC`);
  } else {
    throw new Error(`x402 request failed: HTTP ${response.status}`);
  }
}

// ── x402 Demo Simulation ──────────────────────────
// Mimics the full 402 → sign Soroban auth entry → settle flow
async function simulateX402Payment(
  endpoint: string,
  amount: string
): Promise<import("../types/index.js").X402PaymentReceipt> {
  logger.x402(`[DEMO] → GET ${endpoint}`);
  await sleep(200);
  logger.x402(`[DEMO] ← 402 Payment Required: ${amount} USDC on stellar:testnet`);
  await sleep(150);
  logger.soroban(`[DEMO] Signing Soroban authorization entry (USDC SAC transfer)…`);
  await sleep(300);
  const mockTxHash = `DEMO${Math.random().toString(36).slice(2, 10).toUpperCase()}SETTLE`;
  logger.x402(`[DEMO] Facilitator settled on-chain: ${mockTxHash}`);
  await sleep(100);
  logger.x402(`[DEMO] ← 200 OK — Resource delivered`);

  return {
    endpoint,
    network: "stellar:testnet",
    amountPaid: amount,
    facilitatorSettlementTxHash: mockTxHash,
    responseData: { demo: true, message: "Resource delivered via x402 (demo mode)" },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}