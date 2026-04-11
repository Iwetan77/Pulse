// ─────────────────────────────────────────────────
//  Stellar Pulse — Wallet & Soroban SAC Utility
//
//  Uses the Stellar Asset Contract (SAC) — the pre-deployed
//  Soroban contract for every Stellar token — to interact with
//  USDC without writing custom smart contracts.
//
//  Soroban integration:
//    - Calls SAC `balance()` to read USDC holdings via Soroban RPC
//    - Builds Soroban invokeContract ops for USDC transfers
//    - Simulates transfers before execution (safe-by-default)
// ─────────────────────────────────────────────────

import {
  Keypair,
  Contract,
  Address,
  TransactionBuilder,
  Memo,
  Networks,
  nativeToScVal,
  scValToNative,
  Horizon,
  rpc as SorobanRpc,
} from "@stellar/stellar-sdk";
import { config, getUSDCContractId, getUSDCAsset } from "./config.js";
import { logger } from "./logger.js";
import type { WalletSnapshot, SACTransferDetails } from "../types/index.js";

// ── Soroban RPC Client ────────────────────────────
function getSorobanRpc() {
  return new SorobanRpc.Server(config.rpcUrl, {
    allowHttp: config.rpcUrl.startsWith("http://"),
  });
}

// ── Horizon Server ────────────────────────────────
function getHorizon() {
  return new Horizon.Server(config.horizonUrl);
}

// ── Keypair from config ───────────────────────────
export function getKeypair(): Keypair {
  if (!config.secretKey) {
    throw new Error(
      "PULSE_SECRET_KEY not set. Run `npm run fund` to create a testnet wallet."
    );
  }
  return Keypair.fromSecret(config.secretKey);
}

// ── Read XLM + USDC balances ──────────────────────
export async function getWalletSnapshot(): Promise<WalletSnapshot> {
  const horizon = getHorizon();
  const publicKey = config.publicKey || (config.secretKey ? getKeypair().publicKey() : "GDEMO");

  let xlmBalance = "0";
  let usdcBalance = "0";
  let sequence = "0";

  try {
    const account = await horizon.loadAccount(publicKey);
    sequence = account.sequenceNumber();

    for (const balance of account.balances) {
      if (balance.asset_type === "native") {
        xlmBalance = balance.balance;
      } else if (
        balance.asset_type === "credit_alphanum4" &&
        balance.asset_code === "USDC" &&
        balance.asset_issuer === getUSDCAsset().issuer
      ) {
        usdcBalance = balance.balance;
      }
    }

    // Also attempt Soroban SAC balance read for USDC
    try {
      const sacBalance = await readSACBalance(publicKey);
      if (sacBalance !== null) {
        usdcBalance = sacBalance;
        logger.soroban(`SAC balance read: ${sacBalance} USDC`);
      }
    } catch {
      logger.warn("SAC balance read failed, using Horizon balance");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Not Found") || msg.includes("404")) {
      logger.warn(`Account not found on ${config.network}. Fund it first.`);
    } else if (!config.demoMode) {
      throw err;
    }
  }

  return {
    publicKey,
    xlmBalance,
    usdcBalance,
    usdcContractId: getUSDCContractId(),
    sequence,
    lastUpdated: new Date(),
  };
}

// ── Read USDC balance via Soroban SAC contract ────
// This is the Soroban-native way: call balance(address) on the SAC
export async function readSACBalance(address: string): Promise<string | null> {
  const rpcClient = getSorobanRpc();
  const contractId = getUSDCContractId();

  try {
    const contract = new Contract(contractId);
    const addressSCV = Address.fromString(address).toScVal();

    const keypair = config.secretKey ? getKeypair() : Keypair.random();
    const account = await rpcClient.getAccount(keypair.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: "1000",
      networkPassphrase: config.networkPassphrase,
    })
      .addOperation(contract.call("balance", addressSCV))
      .setTimeout(30)
      .build();

    const result = await rpcClient.simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationSuccess(result)) {
      const returnVal = result.result?.retval;
      if (returnVal) {
        // SAC balance is i128 in stroops (7 decimal places for USDC on Stellar)
        const raw = scValToNative(returnVal) as bigint;
        const usdc = (Number(raw) / 1e7).toFixed(7);
        return usdc;
      }
    }
  } catch (err) {
    logger.soroban(
      "SAC balance simulation error",
      err instanceof Error ? err.message : err
    );
  }

  return null;
}

// ── Simulate a USDC transfer via Soroban SAC ─────
// Builds and SIMULATES a transfer — never submits.
// This is the safe-by-default pattern for demo/hackathon use.
export async function simulateSACTransfer(
  fromAddress: string,
  toAddress: string,
  amountUSDC: string
): Promise<SACTransferDetails> {
  const rpcClient = getSorobanRpc();
  const contractId = getUSDCContractId();

  const details: SACTransferDetails = {
    contractId,
    fromAddress,
    toAddress,
    amount: amountUSDC,
    simulationSuccess: false,
  };

  try {
    const contract = new Contract(contractId);
    // USDC has 7 decimal places on Stellar
    const amountStroops = BigInt(Math.round(parseFloat(amountUSDC) * 1e7));

    const fromSCV = Address.fromString(fromAddress).toScVal();
    const toSCV   = Address.fromString(toAddress).toScVal();
    const amtSCV  = nativeToScVal(amountStroops, { type: "i128" });

    const keypair = config.secretKey ? getKeypair() : Keypair.random();
    const account = await rpcClient.getAccount(keypair.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: "1000",
      networkPassphrase: config.networkPassphrase,
    })
      .addOperation(contract.call("transfer", fromSCV, toSCV, amtSCV))
      .setTimeout(30)
      .build();

    const simResult = await rpcClient.simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationSuccess(simResult)) {
      details.simulationSuccess = true;
      details.simulationResult = "Transfer simulation successful — ready to execute";
      logger.soroban(
        `SAC transfer simulation: ${amountUSDC} USDC → ${toAddress.slice(0, 8)}…`,
        { success: true, minResourceFee: simResult.minResourceFee }
      );
    } else if (SorobanRpc.Api.isSimulationError(simResult)) {
      details.simulationResult = `Simulation error: ${simResult.error}`;
      logger.warn("SAC simulation failed", simResult.error);
    }
  } catch (err) {
    details.simulationResult = `Exception: ${err instanceof Error ? err.message : String(err)}`;
    logger.error("SAC simulation exception", details.simulationResult);
  }

  return details;
}

// ── Execute a real USDC transfer via Soroban SAC ─
// Only called when NOT in demo mode with real testnet funds
export async function executeSACTransfer(
  toAddress: string,
  amountUSDC: string,
  memo?: string
): Promise<string> {
  const rpcClient = getSorobanRpc();
  const keypair = getKeypair();
  const contractId = getUSDCContractId();
  const contract = new Contract(contractId);

  const amountStroops = BigInt(Math.round(parseFloat(amountUSDC) * 1e7));
  const fromSCV = Address.fromString(keypair.publicKey()).toScVal();
  const toSCV   = Address.fromString(toAddress).toScVal();
  const amtSCV  = nativeToScVal(amountStroops, { type: "i128" });

  const account = await rpcClient.getAccount(keypair.publicKey());

  let txBuilder = new TransactionBuilder(account, {
    fee: "1000",
    networkPassphrase: config.networkPassphrase,
  }).addOperation(contract.call("transfer", fromSCV, toSCV, amtSCV));

  if (memo) {
    txBuilder = txBuilder.addMemo(Memo.text(memo.slice(0, 28)));
  }

  const tx = txBuilder.setTimeout(30).build();
  const simResult = await rpcClient.simulateTransaction(tx);

  if (!SorobanRpc.Api.isSimulationSuccess(simResult)) {
    throw new Error("Simulation failed before execution");
  }

  const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build();
  preparedTx.sign(keypair);

  const sendResult = await rpcClient.sendTransaction(preparedTx);

  if (sendResult.status === "ERROR") {
    throw new Error(`Transaction send failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  // Poll for confirmation
  let confirmation;
  let attempts = 0;
  while (attempts < 20) {
    await new Promise((r) => setTimeout(r, 1500));
    confirmation = await rpcClient.getTransaction(sendResult.hash);
    if (confirmation.status !== SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
      break;
    }
    attempts++;
  }

  if (confirmation?.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
    logger.soroban(`SAC transfer confirmed`, { hash: sendResult.hash });
    return sendResult.hash;
  } else {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation)}`);
  }
}