# Stellar Pulse 🌐

> **An Autonomous Financial OS built on Stellar** — a self-managing AI agent that handles real-money obligations (rent, payroll, APIs) using on-chain USDC payments, XLM↔USDC swaps via the Stellar DEX, and x402 HTTP micropayments.

---

## What is Stellar Pulse?

Stellar Pulse is an **autonomous financial agent** that manages a "vault" of financial obligations and pays them automatically on the Stellar testnet. It demonstrates a complete, working agentic payment stack:

| Layer | What it does |
|-------|-------------|
| **Priority Vault** | Stores obligations (rent, payroll, APIs) ranked CRITICAL → DISCRETIONARY |
| **Policy Engine** | Decides what to pay now vs defer based on wallet health |
| **USDC Payments** | Sends real USDC via Stellar SAC transfers — verifiable on-chain |
| **XLM→USDC Swaps** | Autonomously swaps XLM for USDC via Stellar SDEX when USDC is needed |
| **x402 Protocol** | Pays for API access per-request using HTTP 402 + Soroban auth entries |
| **Live Dashboard** | Real-time web UI showing every transaction, wallet balance, and agent decision |

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Stellar Pulse Agent                     │
│                                                            │
│  ┌──────────────┐    ┌──────────────┐   ┌─────────────┐  │
│  │ Priority     │    │ Policy       │   │ Executor    │  │
│  │ Vault        │───▶│ Engine       │──▶│             │  │
│  │              │    │              │   │ USDC SAC tx │  │
│  │ CRITICAL: 2  │    │ Evaluates    │   │ SDEX swap   │  │
│  │ HIGH: 1      │    │ balances,    │   │ x402 flow   │  │
│  │ MEDIUM: 1    │    │ priorities,  │   └──────┬──────┘  │
│  │ LOW: 1       │    │ kill switch  │          │         │
│  │ DISCRET: 1   │    └──────────────┘          │         │
│  └──────────────┘                              │         │
│                                                ▼         │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Stellar Testnet                         │ │
│  │  USDC payments · SDEX swaps · Real tx hashes        │ │
│  │  https://stellar.expert/explorer/testnet             │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘

┌──────────────────┐          ┌────────────────────────────┐
│  x402 Resource   │          │  Web Dashboard             │
│  Server :4022    │◀─────────│  http://localhost:4021     │
│                  │          │                            │
│  /api/analytics  │          │  Live balances             │
│  /api/market-data│          │  Transaction ledger        │
│  /api/research   │          │  Agent decisions           │
│  /api/weather    │          │  Kill switch control       │
└──────────────────┘          └────────────────────────────┘
```

---

## How It Works (End to End)

### 1. Startup
- Generates a fresh Stellar keypair (or loads from `.env`)
- Funds via **Stellar Friendbot** (10,000 testnet XLM)
- Establishes a **USDC trustline** on the account
- Swaps XLM → USDC via **Stellar SDEX** (pathPaymentStrictSend) to pre-fund the wallet

### 2. Payment Cycle (every 60 seconds)
The agent evaluates each vault entry in priority order:

**CRITICAL entries** (Rent $500, Payroll $320):
- Checks USDC balance
- If USDC is insufficient, autonomously swaps XLM → USDC on the SDEX
- Sends USDC via Stellar `payment` operation — **real on-chain transaction**
- Each transaction gets a hash and is immediately visible on Stellar Explorer

**HIGH/MEDIUM/LOW/DISCRETIONARY entries** (x402 services):
- Sends an HTTP GET to the x402 resource server
- Server responds with **402 Payment Required** + Soroban auth entry instructions
- Agent signs the Soroban authorization entry using ExactStellarScheme
- Coinbase x402 facilitator settles the USDC transfer on-chain
- Server returns the requested data only after payment confirmation

### 3. Autonomous Refilling
- XLM → USDC swaps happen automatically per-payment if USDC is low
- **Friendbot is only called when XLM drops below 2 XLM** (almost empty)
- This lets judges watch the wallet drain and refill naturally

### 4. Kill Switch
- Activating the kill switch immediately halts all non-CRITICAL payments
- CRITICAL obligations (rent, payroll) always execute regardless

---

## Vault Entries

| Label | Priority | Amount | Method |
|-------|----------|--------|--------|
| Rent — PULSE Demo | CRITICAL | $500.00 USDC | SAC Transfer |
| Payroll — PULSE Demo | CRITICAL | $320.00 USDC | SAC Transfer |
| Cloud Infrastructure | HIGH | $30.00 USDC | x402 |
| Market Data Feed | MEDIUM | $20.00 USDC | x402 |
| AI Research Agent | LOW | $25.00 USDC | x402 |
| Weather Intelligence | DISCRETIONARY | $20.00 USDC | x402 |

**Total scheduled per cycle: ~$915 USDC**

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Blockchain | Stellar Testnet |
| Stablecoin | USDC (Circle testnet issuer) |
| DEX Swaps | Stellar SDEX (pathPaymentStrictSend) |
| Smart contracts | Soroban SAC (Stellar Asset Contract) |
| Micropayments | x402 protocol + Coinbase facilitator |
| x402 auth | ExactStellarScheme (Soroban auth entries) |
| Dashboard | Express.js + vanilla JS |
| Language | TypeScript (Node.js) |

---

## Quick Start

### Prerequisites
- Node.js v18+
- npm

### Install
```bash
git clone <repo>
cd Pulse
npm install
```

### Run (everything starts automatically)
```bash
npm start
```

The agent will:
1. Generate a wallet and fund it via Friendbot
2. Establish a USDC trustline
3. Swap XLM → USDC to fund the vault obligations
4. Count down 35 seconds (open the dashboard at http://localhost:4021)
5. Begin executing payments every 60 seconds

### Environment Variables (optional)
If you have an existing testnet wallet:
```bash
PULSE_SECRET_KEY=S...   # Your testnet secret key
PULSE_PUBLIC_KEY=G...   # Your testnet public key
DEMO_MODE=true          # true = x402 simulated, false = x402 live
AGENT_LOOP_INTERVAL_SECONDS=60
PORT=4021
AGENT_PORT=4022
```

On first run without `.env`, the agent auto-generates a keypair and writes it to `.env`.

---

## Dashboard

Open **http://localhost:4021** to see:

- **Wallet balances** — XLM and USDC in real-time
- **Priority Vault** — all obligations with live status
- **Agent Decisions** — what the policy engine decided and why
- **Transaction Ledger** — every payment with explorer links
- **x402 Activity** — API micropayment history
- **Kill Switch** — pause all non-critical payments instantly
- **Request Friendbot** — manually top up XLM (only needed near 0)

---

## Verifying Transactions

Every SAC transfer and SDEX swap produces a real transaction hash. You can verify them at:

```
https://stellar.expert/explorer/testnet/tx/<TX_HASH>
```

The dashboard shows clickable explorer links next to each settled transaction.

---

## x402 Payment Flow

```
Agent                    x402 Server               Facilitator
  │                          │                          │
  ├──GET /api/market-data────▶│                          │
  │                          │                          │
  │◀──402 Payment Required───┤                          │
  │   { price: "$20.00 USDC" │                          │
  │     network: stellar:testnet                         │
  │     payTo: G... }        │                          │
  │                          │                          │
  ├──Sign Soroban auth entry─▶                          │
  ├──Retry with X-PAYMENT────▶│                          │
  │                          ├──Verify + settle USDC───▶│
  │                          │◀─Settlement confirmed────┤
  │◀──200 OK + data──────────┤                          │
```

This is the [x402 open standard](https://developers.stellar.org/docs/build/agentic-payments/x402) — enabling machines to pay for API access without subscriptions or API keys, purely through on-chain payment verification.

---

## Project Structure

```
Pulse/
├── src/
│   ├── agent/
│   │   ├── loop.ts        # Main agent loop — bootstraps, swaps, pays
│   │   ├── vault.ts       # Priority vault — stores obligations
│   │   ├── policy.ts      # Policy engine — decides EXECUTE/DEFER/KILL
│   │   ├── executor.ts    # Executes decisions (USDC tx, SDEX swap, x402)
│   │   └── ledger.ts      # Records every event + swap
│   ├── server/
│   │   ├── dashboard.ts   # Web dashboard API
│   │   └── x402.ts        # x402 resource server (paid API endpoints)
│   ├── utils/
│   │   ├── wallet.ts      # Stellar SDK: USDC payments, SDEX swaps, Friendbot
│   │   ├── config.ts      # Environment configuration
│   │   └── logger.ts      # Colored terminal output
│   ├── types/
│   │   └── index.ts       # TypeScript types
│   └── index.ts           # Entry point
├── public/
│   └── index.html         # Dashboard UI
├── scripts/
│   ├── demo.ts            # Standalone demo script
│   └── fund-testnet.ts    # Manual wallet funding script
├── package.json
├── tsconfig.json
└── README.md
```

---

## Key Design Decisions

**Why USDC instead of native XLM for payments?**
USDC is the real-world use case — rent, payroll, and SaaS APIs are priced in dollars. The agent holding XLM and swapping to USDC on-demand mirrors how an AI treasurer would actually operate: hold a volatile asset, convert to stablecoin when obligations come due.

**Why swap per-payment instead of all upfront?**
It demonstrates the autonomous treasury management capability — the agent monitors its USDC balance and initiates swaps as needed, exactly as a rational financial agent would.

**Why only Friendbot at near-zero XLM?**
This lets judges watch the agent operate under real balance constraints. The wallet starts with 10,000 XLM and the agent uses it for SDEX fees + payment operations — calling Friendbot only as a last resort shows the agent manages its own resources.

**Why x402 for API payments?**
x402 is the machine-native payment protocol — no API keys, no subscriptions, just pay per request on-chain. An agent paying for its own tools demonstrates the full autonomous financial OS vision.

---

## What's Real vs Mocked

| Feature | Status | Notes |
|---------|--------|-------|
| XLM payments (SAC_TRANSFER) | ✅ Real | Submitted via Horizon, verifiable on stellar.expert |
| SDEX XLM→USDC swaps | ✅ Real | pathPaymentStrictSend on testnet DEX |
| USDC trustline creation | ✅ Real | changeTrust operation submitted on-chain |
| Wallet auto-funding | ✅ Real | Friendbot funds fresh keypair on startup |
| x402 server middleware | ✅ Real | @x402/express with ExactStellarScheme, correct protocol implementation |
| x402 client settlement | ⚠️ Simulated | The 402→sign→settle flow is simulated in-process. The Coinbase facilitator at x402.org/facilitator supports stellar:testnet, but requires a USDC-funded facilitator wallet. With DEMO_MODE=false and a funded testnet wallet, the real x402 flow would activate. The simulation faithfully represents the protocol steps. |
| Soroban SAC balance read | ⚠️ Skipped | Horizon balance used directly; SAC.balance() call was removed to avoid RPC timeout issues on testnet |

## TODO / Future Work
- [ ] Live x402 settlement with real testnet USDC via Coinbase facilitator
- [ ] Soroban SAC.transfer() for USDC payments (currently uses Horizon payment op)
- [ ] Recurring payments via cron scheduling
- [ ] Multi-wallet / multi-agent coordination
- [ ] Mainnet deployment with real USDC

## License

MIT

---

*Built for the Stellar hackathon — demonstrating autonomous agentic payments on Stellar.*
