// ─────────────────────────────────────────────────
//  Stellar Pulse — x402 Resource Server
//
//  This server exposes paid API endpoints protected
//  by x402 middleware. Every route requires a USDC
//  micropayment before data is returned.
//
//  Flow per request:
//    1. Agent GETs /api/market-data
//    2. Server → 402 Payment Required + payment instructions
//    3. Agent signs Soroban auth entry (USDC SAC)
//    4. Agent retries with X-PAYMENT header
//    5. Coinbase x402 facilitator settles on-chain
//    6. Server returns data
//
//  Soroban role: USDC transfer authorization via SAC
//  is the settlement mechanism under the hood.
// ─────────────────────────────────────────────────

import express from "express";
import cors from "cors";
import { paymentMiddlewareFromConfig } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { config } from "../utils/config.js";
import { logger } from "../utils/logger.js";

const app = express();
app.use(cors());
app.use(express.json());

// ── x402 Facilitator Client ───────────────────────
// Uses the Coinbase x402 facilitator which handles:
//   - Verifying the signed Soroban auth entry
//   - Settling the USDC SAC transfer on-chain
//   - Covering network fees (sponsored on testnet)
const facilitatorClient = new HTTPFacilitatorClient({
  url: config.facilitatorUrl,
});

// ── Payment recipient ─────────────────────────────
// This is the wallet that receives USDC for each API call
const PAY_TO = config.publicKey || "GABC123PLACEHOLDER";
const NETWORK = config.x402Network as "stellar:testnet" | "stellar:pubnet";

// ── x402 Middleware Config ────────────────────────
// Define which routes require payment and at what price
const paymentConfig: Parameters<typeof paymentMiddlewareFromConfig>[0] = {
  // Market data feed — $0.001 per request
  "GET /api/market-data": {
    accepts: {
      scheme: "exact",
      price: "$0.001",
      network: NETWORK,
      payTo: PAY_TO,
    },
    description: "Real-time Stellar market data and asset prices",
    mimeType: "application/json",
  },

  // Research agent endpoint — $0.005 per task
  "GET /api/research": {
    accepts: {
      scheme: "exact",
      price: "$0.005",
      network: NETWORK,
      payTo: PAY_TO,
    },
    description: "AI research task execution — agent-to-agent payment",
    mimeType: "application/json",
  },

  // Weather data feed — $0.001 per request
  "GET /api/weather": {
    accepts: {
      scheme: "exact",
      price: "$0.001",
      network: NETWORK,
      payTo: PAY_TO,
    },
    description: "Weather data for autonomous agent decision-making",
    mimeType: "application/json",
  },

  // Analytics platform — $25.00 per session
  "GET /api/analytics": {
    accepts: {
      scheme: "exact",
      price: "$25.00",
      network: NETWORK,
      payTo: PAY_TO,
    },
    description: "Business analytics dashboard session",
    mimeType: "application/json",
  },

  // Pulse status endpoint — $0.0001 per check (near-free)
  "GET /api/pulse-status": {
    accepts: {
      scheme: "exact",
      price: "$0.0001",
      network: NETWORK,
      payTo: PAY_TO,
    },
    description: "Agent health and status check",
    mimeType: "application/json",
  },
};

// ── Register x402 middleware ──────────────────────
app.use(
  paymentMiddlewareFromConfig(
    paymentConfig,
    facilitatorClient,
    [{ network: NETWORK, server: new ExactStellarScheme() }]
  )
);

// ── Protected Routes ──────────────────────────────

// Market Data — paid endpoint
app.get("/api/market-data", (_req, res) => {
  logger.x402(`Market data delivered — payment verified`);
  res.json({
    source: "Stellar Pulse x402 Data Feed",
    timestamp: new Date().toISOString(),
    assets: [
      { asset: "XLM",  price_usd: "0.0924", change_24h: "+2.1%", volume: "142M" },
      { asset: "USDC", price_usd: "1.0000", change_24h: "0.00%", volume: "890M" },
      { asset: "AQUA", price_usd: "0.0012", change_24h: "-0.8%", volume: "12M"  },
    ],
    network: "stellar:testnet",
    settlement: "x402-soroban-sac",
  });
});

// Research Agent — paid endpoint
app.get("/api/research", (req, res) => {
  const query = (req.query.q as string) || "Stellar ecosystem overview";
  logger.x402(`Research task delivered: "${query}"`);
  res.json({
    source: "Stellar Pulse Research Agent",
    query,
    timestamp: new Date().toISOString(),
    result: {
      summary: `Research completed for: "${query}"`,
      findings: [
        "Stellar network processed 20.6B+ total operations",
        "USDC on Stellar settles in ~5 seconds at $0.00001 per tx",
        "x402 enables per-request API payments without subscriptions",
        "Soroban SAC contracts power programmable stablecoin transfers",
      ],
      confidence: 0.94,
    },
    payment: "agent-to-agent via x402",
  });
});

// Weather Data — paid endpoint
app.get("/api/weather", (req, res) => {
  const location = (req.query.loc as string) || "Lagos, Nigeria";
  logger.x402(`Weather data delivered for: ${location}`);
  res.json({
    source: "Stellar Pulse Weather Feed",
    location,
    timestamp: new Date().toISOString(),
    current: {
      temp_c: 29,
      condition: "Partly cloudy",
      humidity: 78,
      wind_kph: 14,
    },
    agent_advisory: "Clear conditions — no weather-related payment delays expected",
    payment: "x402 micropayment",
  });
});

// Analytics — paid endpoint
app.get("/api/analytics", (_req, res) => {
  logger.x402(`Analytics session delivered`);
  res.json({
    source: "Stellar Pulse Analytics",
    timestamp: new Date().toISOString(),
    session: {
      total_transactions: 1284,
      total_volume_usdc: "47230.50",
      top_categories: ["payroll", "saas", "agent-payments"],
      payment_success_rate: "99.7%",
      avg_settlement_time_ms: 4800,
    },
    x402_summary: {
      total_api_calls: 84,
      total_spent_usdc: "0.420",
      services: ["market-data", "research", "weather"],
    },
  });
});

// Pulse Status — paid endpoint
app.get("/api/pulse-status", (_req, res) => {
  res.json({
    source: "Stellar Pulse",
    status: "operational",
    network: NETWORK,
    timestamp: new Date().toISOString(),
    agent: "running",
    vault: "active",
    x402: "live",
    soroban: "connected",
  });
});

// ── Free Routes ───────────────────────────────────

// Service discovery — free (shows available paid endpoints)
app.get("/", (_req, res) => {
  res.json({
    service: "Stellar Pulse x402 Resource Server",
    network: NETWORK,
    facilitator: config.facilitatorUrl,
    endpoints: Object.entries(paymentConfig).map(([route, cfg]) => ({
      route,
      price: (cfg as { accepts: { price: string } }).accepts.price,
      description: (cfg as { description: string }).description,
    })),
    docs: "https://developers.stellar.org/docs/build/agentic-payments/x402",
  });
});

// Health check — always free
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Start Server ──────────────────────────────────
export function startX402Server(): void {
  app.listen(config.agentPort, () => {
    logger.divider("x402 RESOURCE SERVER");
    logger.x402(`Server running at http://localhost:${config.agentPort}`);
    logger.x402(`Network:     ${NETWORK}`);
    logger.x402(`Facilitator: ${config.facilitatorUrl}`);
    logger.x402(`Pay-to:      ${PAY_TO.slice(0, 12)}…`);
    logger.x402(`Endpoints:`);
    for (const [route, cfg] of Object.entries(paymentConfig)) {
      const price = (cfg as { accepts: { price: string } }).accepts.price;
      logger.x402(`  ${route.padEnd(30)} → ${price} USDC`);
    }
    console.log();
  });
}

// Run standalone
if (process.argv[1]?.includes("server")) {
  startX402Server();
}

export default app;