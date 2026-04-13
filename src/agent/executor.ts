// ─────────────────────────────────────────────────
//  Stellar Pulse — Payment Executor
//
//  EXECUTE  → Real XLM payment on Stellar testnet (traceable)
//  SIMULATE → x402 HTTP flow (demo simulation)
//  DEFER    → logged only
//  KILL     → entry halted
// ─────────────────────────────────────────────────

import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { createEd25519Signer } from "@x402/stellar";
import type { AgentDecision, PaymentEvent } from "../types/index.js";
import { config } from "../utils/config.js";
import { logger } from "../utils/logger.js";
import { executeTestnetPayment, getKeypair } from "../utils/wallet.js";
import { updateEntryStatus, getVaultEntry } from "./vault.js";
import { recordEvent } from "./ledger.js";
import { v4 as uuidv4 } from "uuid";

// ── Build x402 fetch client ───────────────────────
function buildX402Fetch() {
  try {
    if (!config.secretKey) return null;
    const keypair = getKeypair();
    const network = config.x402Network as "stellar:testnet";
    const signer  = createEd25519Signer(keypair.secret(), network);
    const client  = new x402Client().register(network, new ExactStellarScheme(signer));
    return wrapFetchWithPayment(fetch, client);
  } catch (err) {
    logger.warn("x402 client init failed", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Execute one agent decision ────────────────────
export async function executeDecision(decision: AgentDecision): Promise<PaymentEvent> {
  const { action, vaultEntry } = decision;

  const event: PaymentEvent = {
    id:               uuidv4(),
    vaultEntryId:     vaultEntry.id,
    label:            vaultEntry.label,
    priority:         vaultEntry.priority,
    method:           vaultEntry.method,
    amountUSDC:       vaultEntry.amountUSDC,
    recipientAddress: vaultEntry.recipientAddress,
    status:           "PROCESSING",
    memo:             vaultEntry.memo,
    timestamp:        new Date(),
  };

  try {
    switch (action) {
      case "EXECUTE":  await handleRealPayment(event, vaultEntry); break;
      case "SIMULATE": await handleX402Payment(event, vaultEntry); break;
      case "DEFER":
        event.status = "PENDING";
        logger.agent(`[DEFER] ${vaultEntry.label}: ${decision.reason}`);
        break;
      case "KILL":
        event.status = "KILLED";
        updateEntryStatus(vaultEntry.id, "KILLED");
        logger.warn(`[KILL] ${vaultEntry.label}`);
        break;
    }
  } catch (err) {
    event.status = "FAILED";
    event.error  = err instanceof Error ? err.message : String(err);
    updateEntryStatus(vaultEntry.id, "FAILED");
    logger.error(`[FAILED] ${vaultEntry.label}`, event.error);
  }

  recordEvent(event);
  return event;
}

// ── Real XLM payment on testnet ───────────────────
async function handleRealPayment(event: PaymentEvent, vaultEntry: any): Promise<void> {
  // Use the amountUSDC field as XLM amount — it's a real testnet payment
  // shown as USDC equivalent in the UI for demo purposes
  const xlmAmount = parseFloat(vaultEntry.amountUSDC).toFixed(7);

  logger.info(`[REAL TX] Submitting: ${xlmAmount} XLM → ${event.recipientAddress.slice(0,12)}…`);
  logger.info(`  Memo: ${event.memo || "PULSE:PAYMENT"}`);

  const { hash, explorerUrl } = await executeTestnetPayment(
    event.recipientAddress,
    xlmAmount,
    event.memo || `PULSE:${event.label.slice(0,20)}`
  );

  event.txHash      = hash;
  event.status      = "SETTLED";
  event.explorerUrl = explorerUrl;

  event.sacTransferDetails = {
    contractId:        "native-XLM",
    fromAddress:       config.publicKey,
    toAddress:         event.recipientAddress,
    amount:            xlmAmount,
    simulationSuccess: true,
    simulationResult:  `REAL TX: ${hash} — verifiable at ${explorerUrl}`,
  };

  updateEntryStatus(vaultEntry.id, "SETTLED");
  logger.success(`[SETTLED] ${event.label} → ${explorerUrl}`);
}

// ── x402 payment flow ─────────────────────────────
async function handleX402Payment(event: PaymentEvent, vaultEntry: any): Promise<void> {
  // Get the endpoint directly from the passed vaultEntry (not via lookup)
  const endpoint = vaultEntry.x402Endpoint;
  if (!endpoint) throw new Error(`No x402 endpoint for: ${event.label}`);

  logger.x402(`Initiating x402: ${event.amountUSDC} USDC → ${endpoint}`);

  if (config.demoMode || !config.secretKey) {
    const receipt = await simulateX402(endpoint, event.amountUSDC, event.label);
    event.x402Response = receipt;
    event.status = "SETTLED";
    updateEntryStatus(vaultEntry.id, "SETTLED");
    return;
  }

  // Real x402 live mode
  const paidFetch = buildX402Fetch();
  if (!paidFetch) throw new Error("x402 client unavailable");

  const response = await paidFetch(endpoint, { method: "GET" });
  if (response.ok) {
    const data = await response.json();
    event.x402Response = { endpoint, network: config.x402Network, amountPaid: event.amountUSDC, responseData: data };
    event.status = "SETTLED";
    updateEntryStatus(vaultEntry.id, "SETTLED");
    logger.success(`x402 settled: ${event.amountUSDC} USDC via Soroban auth entry`);
  } else {
    throw new Error(`x402 HTTP ${response.status}`);
  }
}

// ── x402 demo simulation ──────────────────────────
async function simulateX402(endpoint: string, amount: string, label: string): Promise<import("../types/index.js").X402PaymentReceipt> {
  const mockHash = `SIM${Math.random().toString(36).slice(2,10).toUpperCase()}`;
  logger.x402(`[x402] → GET ${endpoint}`);
  await sleep(200);
  logger.x402(`[x402] ← 402 Payment Required: ${amount} USDC on stellar:testnet`);
  await sleep(150);
  logger.soroban(`[x402] Signing Soroban auth entry (ExactStellarScheme)…`);
  await sleep(300);
  logger.x402(`[x402] Facilitator settled: ${mockHash}`);
  await sleep(100);
  logger.x402(`[x402] ← 200 OK — resource delivered`);
  return {
    endpoint, network: "stellar:testnet", amountPaid: amount,
    facilitatorSettlementTxHash: mockHash,
    responseData: { ok: true, label, demo: config.demoMode },
  };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }