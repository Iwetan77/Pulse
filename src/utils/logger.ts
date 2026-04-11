// ─────────────────────────────────────────────────
//  Stellar Pulse — Logger
// ─────────────────────────────────────────────────

import chalk from "chalk";

type LogLevel = "info" | "success" | "warn" | "error" | "agent" | "x402" | "soroban";

const icons: Record<LogLevel, string> = {
  info:    "◦",
  success: "✓",
  warn:    "⚠",
  error:   "✗",
  agent:   "⟳",
  x402:    "₄₀₂",
  soroban: "◈",
};

const colors: Record<LogLevel, (s: string) => string> = {
  info:    chalk.cyan,
  success: chalk.green,
  warn:    chalk.yellow,
  error:   chalk.red,
  agent:   chalk.magenta,
  x402:    chalk.blue,
  soroban: chalk.hex("#7B61FF"),
};

function timestamp(): string {
  return chalk.gray(new Date().toISOString().replace("T", " ").slice(0, 19));
}

function log(level: LogLevel, message: string, data?: unknown): void {
  const icon = colors[level](icons[level]);
  const prefix = colors[level](`[${level.toUpperCase().padEnd(7)}]`);
  const line = `${timestamp()} ${icon} ${prefix} ${message}`;
  console.log(line);
  if (data !== undefined) {
    console.log(chalk.gray("  └─"), JSON.stringify(data, null, 2).split("\n").join("\n     "));
  }
}

export const logger = {
  info:    (msg: string, data?: unknown) => log("info", msg, data),
  success: (msg: string, data?: unknown) => log("success", msg, data),
  warn:    (msg: string, data?: unknown) => log("warn", msg, data),
  error:   (msg: string, data?: unknown) => log("error", msg, data),
  agent:   (msg: string, data?: unknown) => log("agent", msg, data),
  x402:    (msg: string, data?: unknown) => log("x402", msg, data),
  soroban: (msg: string, data?: unknown) => log("soroban", msg, data),

  divider: (label?: string) => {
    const line = "─".repeat(60);
    if (label) {
      const pad = Math.max(0, 28 - Math.floor(label.length / 2));
      console.log(chalk.gray(`\n${line}\n${" ".repeat(pad)}${chalk.white(label)}\n${line}\n`));
    } else {
      console.log(chalk.gray(`\n${line}\n`));
    }
  },

  snapshot: (label: string, data: Record<string, unknown>) => {
    logger.divider(label);
    for (const [k, v] of Object.entries(data)) {
      const key = chalk.gray(k.padEnd(28));
      const val = chalk.white(String(v));
      console.log(`  ${key} ${val}`);
    }
    console.log();
  },
};