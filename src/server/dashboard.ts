import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../utils/config.js";
import { logger } from "../utils/logger.js";
import { getWalletSnapshot, refillViaFriendbot, swapXLMForUSDC } from "../utils/wallet.js";
import { getAllVaultEntries, getVaultSummary, killAllDiscretionary, updateEntryStatus, addVaultEntry, deleteEntry, killEntry } from "../agent/vault.js";
import { getAllEvents, getX402Summary, getTotalSpent, getSwapEvents, recordSwapEvent } from "../agent/ledger.js";
import { agentState, activateKillSwitch, deactivateKillSwitch } from "../agent/loop.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors()); app.use(express.json());
app.use(express.static(path.join(__dirname, "../../public")));

app.get("/api/snapshot", async (_req, res) => {
  try {
    const wallet  = await getWalletSnapshot();
    const summary = getVaultSummary();
    const x402    = getX402Summary();
    res.json({
      timestamp: new Date().toISOString(),
      agent: { iteration: agentState.iteration, isRunning: agentState.isRunning, killSwitchActive: agentState.killSwitchActive, pausedCategories: agentState.pausedCategories },
      wallet, vaultSummary: summary, x402Summary: x402,
      totalSpentXLM: getTotalSpent(),
      vault: getAllVaultEntries(),
      events: getAllEvents().slice(-100),
      swaps: getSwapEvents(),
      explorerBase: config.explorerBase,
      demoMode: config.demoMode,
      agentLoopIntervalSeconds: config.agentLoopIntervalSeconds,
    });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get("/api/wallet",  async (_req, res) => { try { res.json(await getWalletSnapshot()); } catch(e){res.status(500).json({error:String(e)});} });
app.get("/api/vault",   (_req, res) => res.json(getAllVaultEntries()));
app.get("/api/ledger",  (req, res)  => res.json(getAllEvents().slice(-parseInt((req.query.limit as string)||"100"))));
app.get("/api/swaps",   (_req, res) => res.json(getSwapEvents()));
app.get("/api/agent",   (_req, res) => res.json({ iteration: agentState.iteration, isRunning: agentState.isRunning, killSwitchActive: agentState.killSwitchActive }));
app.get("/api/config",  (_req, res) => res.json({ network: config.network, horizonUrl: config.horizonUrl, rpcUrl: config.rpcUrl, x402Network: config.x402Network, facilitatorUrl: config.facilitatorUrl, demoMode: config.demoMode, explorerBase: config.explorerBase, agentLoopIntervalSeconds: config.agentLoopIntervalSeconds }));

// Friendbot refill
app.post("/api/friendbot", async (_req, res) => {
  logger.info("Dashboard: Friendbot refill requested");
  try {
    const ok = await refillViaFriendbot();
    res.json({ success: ok, message: ok ? "Funded with 10,000 XLM" : "Friendbot request failed" });
  } catch(e) { res.status(500).json({ error: String(e) }); }
});

// Manual SDEX swap trigger from dashboard
app.post("/api/swap", async (req, res) => {
  const { xlmAmount = "15" } = req.body as { xlmAmount?: string };
  logger.info(`Dashboard: manual SDEX swap ${xlmAmount} XLM → USDC`);
  try {
    const swap = await swapXLMForUSDC(xlmAmount, "0.01");
    recordSwapEvent(swap.hash, swap.explorerUrl, xlmAmount, swap.usdcReceived);
    res.json({ success: true, ...swap });
  } catch(e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Vault CRUD
app.post("/api/vault", (req, res) => {
  try {
    const b = req.body as any;
    if (!b.label || !b.priority || !b.recipientAddress || !b.amountUSDC || !b.method) return res.status(400).json({ error: "Missing required fields" });
    res.json(addVaultEntry({ label:b.label, description:b.description||"", priority:b.priority, recipientAddress:b.recipientAddress, amountUSDC:b.amountUSDC, method:b.method, x402Endpoint:b.x402Endpoint, memo:b.memo, recurringCron:b.recurringCron, status:"PENDING", tags:[] }));
  } catch(e) { res.status(500).json({ error: String(e) }); }
});

app.delete("/api/vault/:id", (req, res) => res.json({ success: deleteEntry(req.params.id) }));
app.post("/api/vault/:id/kill",  (req, res) => { killEntry(req.params.id);               res.json({ success: true }); });
app.post("/api/vault/:id/reset", (req, res) => { updateEntryStatus(req.params.id,"PENDING"); res.json({ success: true }); });

app.post("/api/agent/kill-switch", (req, res) => {
  const { active } = req.body as { active: boolean };
  active ? activateKillSwitch() : deactivateKillSwitch();
  res.json({ killSwitchActive: agentState.killSwitchActive });
});
app.post("/api/agent/kill-discretionary", (_req, res) => res.json({ killed: killAllDiscretionary() }));

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "../../public/index.html")));

export function startDashboardServer(): void {
  app.listen(config.port, () => logger.success(`Dashboard: http://localhost:${config.port}`));
}
export default app;