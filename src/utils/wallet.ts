// ─────────────────────────────────────────────────
//  Stellar Pulse — Wallet Utility
//
//  Real Stellar testnet transactions:
//  1. XLM payments via Operation.payment (Horizon)
//  2. XLM → USDC swap via SDEX pathPayment (on-chain DEX)
//     Both are traceable on stellar.expert/explorer/testnet
//
//  Friendbot auto-funds on startup + on low balance.
// ─────────────────────────────────────────────────

import {
  Keypair, TransactionBuilder, Operation,
  Asset, Memo, Networks, Horizon, StrKey,
} from "@stellar/stellar-sdk";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type { WalletSnapshot } from "../types/index.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const HORIZON    = "https://horizon-testnet.stellar.org";
const FRIENDBOT  = "https://friendbot.stellar.org";
const EXPLORER   = "https://stellar.expert/explorer/testnet/tx";
const NET_PASS   = Networks.TESTNET;

// Testnet USDC issued by Circle's testnet issuer
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const USDC_ASSET  = new Asset("USDC", USDC_ISSUER);

export { EXPLORER };

function horizon() { return new Horizon.Server(HORIZON); }

// ── Auto-generate + fund wallet on first boot ─────
export async function ensureTestnetWallet(): Promise<Keypair> {
  if (config.secretKey && config.secretKey.startsWith("S") && config.secretKey.length === 56) {
    const kp = Keypair.fromSecret(config.secretKey);
    // Update publicKey in config if missing
    if (!config.publicKey) (config as any).publicKey = kp.publicKey();
    return kp;
  }

  const keypair = Keypair.random();
  logger.info(`New keypair: ${keypair.publicKey()}`);

  // Fund via Friendbot
  logger.info("Calling Friendbot for 10,000 XLM…");
  const res = await fetch(`${FRIENDBOT}?addr=${keypair.publicKey()}`);
  if (!res.ok) {
    const txt = await res.text();
    if (!txt.includes("already")) throw new Error(`Friendbot failed: ${txt.slice(0,100)}`);
  }
  logger.success(`Wallet funded: https://stellar.expert/explorer/testnet/account/${keypair.publicKey()}`);

  // Write to .env
  const envPath = path.resolve(__dirname, "../../.env");
  try {
    let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
    const lines = content.split("\n").filter(l => !l.startsWith("PULSE_SECRET_KEY") && !l.startsWith("PULSE_PUBLIC_KEY"));
    lines.push(`PULSE_SECRET_KEY=${keypair.secret()}`);
    lines.push(`PULSE_PUBLIC_KEY=${keypair.publicKey()}`);
    fs.writeFileSync(envPath, lines.join("\n") + "\n");
    logger.info(".env updated with new keypair");
  } catch { logger.warn("Could not write .env"); }

  (config as any).secretKey = keypair.secret();
  (config as any).publicKey = keypair.publicKey();

  await sleep(4000); // wait for account to be created
  return keypair;
}

export function getKeypair(): Keypair {
  if (!config.secretKey || !config.secretKey.startsWith("S")) {
    throw new Error("No keypair — agent not yet bootstrapped.");
  }
  return Keypair.fromSecret(config.secretKey);
}

// ── Wallet snapshot ───────────────────────────────
export async function getWalletSnapshot(): Promise<WalletSnapshot> {
  const publicKey = config.publicKey || (config.secretKey ? getKeypair().publicKey() : "");
  if (!publicKey || publicKey === "NOT_CONFIGURED") {
    return { publicKey: "NOT_CONFIGURED", xlmBalance: "0", usdcBalance: "0", usdcContractId: "", sequence: "0", lastUpdated: new Date() };
  }

  let xlmBalance = "0", usdcBalance = "0", sequence = "0";
  try {
    const acct = await horizon().loadAccount(publicKey);
    sequence = acct.sequenceNumber();
    for (const b of acct.balances) {
      if (b.asset_type === "native") xlmBalance = b.balance;
      if (b.asset_type === "credit_alphanum4" && b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER) {
        usdcBalance = b.balance;
      }
    }
  } catch (e: any) {
    if (e.message?.includes("404") || e.message?.includes("Not Found")) {
      logger.warn("Account not found — refilling via Friendbot");
      await refillViaFriendbot(publicKey);
    }
  }
  return { publicKey, xlmBalance, usdcBalance, usdcContractId: "", sequence, lastUpdated: new Date() };
}

// ── Friendbot refill ──────────────────────────────
export async function refillViaFriendbot(addr?: string): Promise<boolean> {
  const address = addr || config.publicKey || (config.secretKey ? getKeypair().publicKey() : "");
  if (!address) return false;
  try {
    logger.info(`Friendbot → ${address.slice(0, 12)}…`);
    const res = await fetch(`${FRIENDBOT}?addr=${address}`);
    const txt = await res.text();
    if (res.ok || txt.includes("already")) {
      logger.success("Friendbot: wallet funded / confirmed funded");
      return true;
    }
    logger.warn(`Friendbot ${res.status}: ${txt.slice(0, 80)}`);
    return false;
  } catch (e: any) {
    logger.error("Friendbot failed", e.message);
    return false;
  }
}

// ── Add USDC trustline ────────────────────────────
export async function ensureUSDCTrustline(): Promise<string | null> {
  const keypair = getKeypair();
  const h = horizon();
  try {
    const acct = await h.loadAccount(keypair.publicKey());
    // Check if trustline already exists
    for (const b of acct.balances) {
      if (b.asset_type === "credit_alphanum4" && b.asset_code === "USDC") {
        logger.info("USDC trustline already exists");
        return null;
      }
    }
    // Add trustline
    logger.info("Adding USDC trustline…");
    const tx = new TransactionBuilder(acct, { fee: "1000", networkPassphrase: NET_PASS })
      .addOperation(Operation.changeTrust({ asset: USDC_ASSET, limit: "100000" }))
      .setTimeout(30)
      .build();
    tx.sign(keypair);
    const result = await h.submitTransaction(tx);
    const hash = (result as any).hash;
    logger.success(`USDC trustline TX: ${EXPLORER}/${hash}`);
    return hash;
  } catch (e: any) {
    logger.error("Trustline failed", e.message);
    return null;
  }
}

// ── XLM → USDC swap via Stellar SDEX ─────────────
// Uses pathPaymentStrictReceive to swap XLM for USDC
// This is a real on-chain DEX transaction, traceable on stellar.expert
export async function swapXLMForUSDC(
  xlmToSpend: string,
  minUSDCOut: string
): Promise<{ hash: string; explorerUrl: string; usdcReceived: string }> {
  const keypair = getKeypair();
  const h = horizon();

  // Ensure trustline first
  await ensureUSDCTrustline();
  await sleep(2000);

  const acct = await h.loadAccount(keypair.publicKey());

  logger.info(`SDEX Swap: up to ${xlmToSpend} XLM → USDC (min ${minUSDCOut} USDC)`);

  const tx = new TransactionBuilder(acct, { fee: "10000", networkPassphrase: NET_PASS })
    .addOperation(
      Operation.pathPaymentStrictReceive({
        sendAsset:   Asset.native(),          // spending XLM
        sendMax:     xlmToSpend,              // max XLM to spend
        destination: keypair.publicKey(),     // receiving to same wallet
        destAsset:   USDC_ASSET,              // getting USDC
        destAmount:  minUSDCOut,              // minimum USDC to receive
        path: [],                             // Stellar finds best path
      })
    )
    .addMemo(Memo.text("PULSE:XLM-USDC-SWAP"))
    .setTimeout(30)
    .build();

  tx.sign(keypair);

  const result = await h.submitTransaction(tx);
  const hash = (result as any).hash;
  const url  = `${EXPLORER}/${hash}`;

  // Read new USDC balance
  await sleep(3000);
  const snap = await getWalletSnapshot();

  logger.success(`SDEX Swap confirmed: ${hash}`);
  logger.info(`Explorer: ${url}`);
  logger.info(`New USDC balance: ${snap.usdcBalance}`);

  return { hash, explorerUrl: url, usdcReceived: snap.usdcBalance };
}

// ── Submit real XLM payment ───────────────────────
export async function submitXLMPayment(
  toAddress: string,
  amountXLM: string,
  memoText?: string
): Promise<{ hash: string; explorerUrl: string }> {
  if (!StrKey.isValidEd25519PublicKey(toAddress)) {
    throw new Error(`Invalid destination: ${toAddress}`);
  }

  const keypair = getKeypair();
  const h = horizon();
  const acct = await h.loadAccount(keypair.publicKey());

  let builder = new TransactionBuilder(acct, { fee: "1000", networkPassphrase: NET_PASS })
    .addOperation(Operation.payment({ destination: toAddress, asset: Asset.native(), amount: amountXLM }));

  if (memoText) builder = builder.addMemo(Memo.text(memoText.slice(0, 28)));

  const tx = builder.setTimeout(30).build();
  tx.sign(keypair);

  const result = await h.submitTransaction(tx);
  const hash = (result as any).hash;
  const explorerUrl = `${EXPLORER}/${hash}`;

  logger.success(`Real TX: ${explorerUrl}`);
  return { hash, explorerUrl };
}

// Alias used by executor
export const executeTestnetPayment = submitXLMPayment;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }