// ─────────────────────────────────────────────────
//  Stellar Pulse — Configuration
// ─────────────────────────────────────────────────
import dotenv from "dotenv";
dotenv.config();

function opt(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  secretKey:          opt("PULSE_SECRET_KEY", ""),
  publicKey:          opt("PULSE_PUBLIC_KEY", ""),

  network:            "testnet" as const,
  horizonUrl:         "https://horizon-testnet.stellar.org",
  rpcUrl:             "https://soroban-testnet.stellar.org",
  networkPassphrase:  "Test SDF Network ; September 2015",

  facilitatorUrl:     opt("X402_FACILITATOR_URL", "https://www.x402.org/facilitator"),
  x402Network:        "stellar:testnet",

  port:               parseInt(opt("PORT", "4021")),
  agentPort:          parseInt(opt("AGENT_PORT", "4022")),

  // DEMO_MODE only affects x402 payments (no real USDC needed)
  // XLM payments are ALWAYS real on testnet
  demoMode:           opt("DEMO_MODE", "true") === "true",

  // Slow loop: 60s between cycles so judges can see each payment
  agentLoopIntervalSeconds: parseInt(opt("AGENT_LOOP_INTERVAL_SECONDS", "60")),

  // XLM amount to send per SAC_TRANSFER entry (small amounts for demo)
  // Real payments! Keep small so wallet doesn't empty fast
  paymentAmountXLM:   opt("PAYMENT_AMOUNT_XLM", "1"),

  // Stellar Explorer base URL for testnet
  explorerBase:       "https://stellar.expert/explorer/testnet",
} as const;

export function getUSDCContractId(): string {
  return "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
}

export function getUSDCAsset() {
  return { code: "USDC", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" };
}