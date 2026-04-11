// ─────────────────────────────────────────────────
//  Stellar Pulse — Configuration
// ─────────────────────────────────────────────────

import dotenv from "dotenv";
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  // Wallet
  secretKey: optional("PULSE_SECRET_KEY", ""),
  publicKey: optional("PULSE_PUBLIC_KEY", ""),

  // Network
  network: optional("STELLAR_NETWORK", "testnet") as "testnet" | "mainnet",
  horizonUrl: optional(
    "STELLAR_HORIZON_URL",
    "https://horizon-testnet.stellar.org"
  ),
  rpcUrl: optional(
    "STELLAR_RPC_URL",
    "https://soroban-testnet.stellar.org"
  ),
  networkPassphrase: optional(
    "STELLAR_NETWORK_PASSPHRASE",
    "Test SDF Network ; September 2015"
  ),

  // x402
  facilitatorUrl: optional(
    "X402_FACILITATOR_URL",
    "https://www.x402.org/facilitator"
  ),
  x402Network: optional("X402_NETWORK", "stellar:testnet"),

  // Server
  port: parseInt(optional("PORT", "4021")),
  agentPort: parseInt(optional("AGENT_PORT", "4022")),

  // Demo mode
  demoMode: optional("DEMO_MODE", "false") === "true",

  // Priority vault spending limits (USDC)
  vaultLimits: {
    CRITICAL: optional("VAULT_CRITICAL_LIMIT_USDC", "500"),
    HIGH: optional("VAULT_HIGH_LIMIT_USDC", "200"),
    MEDIUM: optional("VAULT_MEDIUM_LIMIT_USDC", "100"),
    LOW: optional("VAULT_LOW_LIMIT_USDC", "50"),
    DISCRETIONARY: optional("VAULT_DISCRETIONARY_LIMIT_USDC", "20"),
  },

  // Agent loop
  agentLoopIntervalSeconds: parseInt(
    optional("AGENT_LOOP_INTERVAL_SECONDS", "30")
  ),

  // Soroban USDC SAC contract IDs
  // Source: https://developers.stellar.org/docs/tokens/stellar-asset-contract
  usdcContractId: {
    testnet: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    mainnet: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7EJJUD",
  },

  // Soroban USDC asset
  usdcAsset: {
    testnet: {
      code: "USDC",
      issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    },
    mainnet: {
      code: "USDC",
      issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    },
  },
} as const;

export function getUSDCContractId(): string {
  return config.network === "mainnet"
    ? config.usdcContractId.mainnet
    : config.usdcContractId.testnet;
}

export function getUSDCAsset() {
  return config.network === "mainnet"
    ? config.usdcAsset.mainnet
    : config.usdcAsset.testnet;
}