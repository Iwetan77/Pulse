// ─────────────────────────────────────────────────
//  Stellar Pulse — Core Types
// ─────────────────────────────────────────────────

export type Network = "testnet" | "mainnet";

export type PaymentPriority =
  | "CRITICAL"   // Rent, utilities, salaries — always pays first
  | "HIGH"       // Loan repayments, scheduled obligations
  | "MEDIUM"     // Business tools, recurring APIs
  | "LOW"        // Optional services, data subscriptions
  | "DISCRETIONARY"; // Agent-driven, per-use spending

export type PaymentStatus =
  | "PENDING"
  | "PROCESSING"
  | "SETTLED"
  | "FAILED"
  | "KILLED";

export type PaymentMethod = "DIRECT" | "X402" | "SAC_TRANSFER";

export interface VaultEntry {
  id: string;
  label: string;
  description: string;
  priority: PaymentPriority;
  recipientAddress: string;
  amountUSDC: string;           // Decimal string e.g. "500.00"
  method: PaymentMethod;
  recurringCron?: string;       // cron expression for scheduled payments
  x402Endpoint?: string;        // URL if this is an x402 service
  memo?: string;
  status: PaymentStatus;
  lastExecutedAt?: Date;
  createdAt: Date;
  tags: string[];
}

export interface WalletSnapshot {
  publicKey: string;
  xlmBalance: string;
  usdcBalance: string;
  usdcContractId: string;       // Soroban SAC contract ID for USDC
  sequence: string;
  lastUpdated: Date;
}

export interface PaymentEvent {
  id: string;
  vaultEntryId?: string;
  label: string;
  priority: PaymentPriority;
  method: PaymentMethod;
  amountUSDC: string;
  recipientAddress: string;
  txHash?: string;
  status: PaymentStatus;
  memo?: string;
  x402Response?: X402PaymentReceipt;
  sacTransferDetails?: SACTransferDetails;
  error?: string;
  explorerUrl?: string;
  timestamp: Date;
}

export interface X402PaymentReceipt {
  endpoint: string;
  network: string;
  amountPaid: string;
  facilitatorSettlementTxHash?: string;
  responseData: unknown;
}

export interface SACTransferDetails {
  contractId: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  simulationSuccess: boolean;
  simulationResult?: string;
}

export interface AgentDecision {
  action: "EXECUTE" | "SIMULATE" | "DEFER" | "KILL";
  vaultEntry: VaultEntry;
  reason: string;
  walletSnapshot: WalletSnapshot;
  projectedBalanceAfter: string;
}

export interface PulseSnapshot {
  timestamp: Date;
  wallet: WalletSnapshot;
  vaultEntries: VaultEntry[];
  recentEvents: PaymentEvent[];
  agentDecisions: AgentDecision[];
  totalScheduledUSDC: string;
  totalSpentUSDC: string;
  x402ServicesActive: number;
}

export interface AgentLoopState {
  iteration: number;
  isRunning: boolean;
  lastSnapshot: PulseSnapshot | null;
  killSwitchActive: boolean;
  pausedCategories: PaymentPriority[];
}

// Added: explorerUrl on PaymentEvent for testnet tx links
declare module "./index.js" {}