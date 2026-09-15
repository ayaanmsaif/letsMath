// Total API spend for development and testing, persisted across restarts, with
// a hard stop at DEV_BUDGET_USD (PLAN.md §12).
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config";
import { costUsd, type Usage } from "./cost";

const LEDGER_FILE =
  process.env.USAGE_LEDGER_PATH ?? fileURLToPath(new URL("../../../../.usage/ledger.jsonl", import.meta.url));

export type SpendKind = "tutor" | "watch" | "eval";

export interface LedgerEntry {
  at: string;
  kind: SpendKind;
  model: string;
  usage: Usage;
  costUsd: number;
  batch?: boolean;
}

export class BudgetExceededError extends Error {
  constructor(spent: number, needed: number) {
    super(
      `Testing budget reached: $${spent.toFixed(2)} of $${config.devBudgetUsd.toFixed(2)} spent` +
        ` (this request could cost up to $${needed.toFixed(2)}). Raise DEV_BUDGET_USD or use TUTOR_MOCK=1.`,
    );
    this.name = "BudgetExceededError";
  }
}

let spent: number | null = null;
/** Worst-case cost of requests in flight, so concurrent calls can't overshoot the budget together. */
let reserved = 0;

async function loadSpent(): Promise<number> {
  if (spent !== null) return spent;
  try {
    const text = await readFile(LEDGER_FILE, "utf8");
    spent = text
      .split("\n")
      .filter(Boolean)
      .reduce((sum, line) => sum + (JSON.parse(line) as LedgerEntry).costUsd, 0);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    spent = 0;
  }
  return spent;
}

export async function budgetStatus() {
  const total = await loadSpent();
  const budget = config.devBudgetUsd;
  return {
    spentUsd: total,
    budgetUsd: budget,
    remainingUsd: Math.max(0, budget - total),
    state: total >= budget ? "exhausted" : total >= budget * 0.8 ? "warning" : "ok",
  } as const;
}

/**
 * Reserve a request's worst-case cost before calling Claude. Throws if that
 * could exceed the budget. Call `settle` with the real usage afterwards, or
 * `release` if the request failed before any tokens were billed.
 */
export async function reserve(worstCaseUsd: number) {
  const total = await loadSpent();
  if (total + reserved + worstCaseUsd > config.devBudgetUsd) {
    throw new BudgetExceededError(total, worstCaseUsd);
  }
  reserved += worstCaseUsd;
  let done = false;

  const finish = () => {
    if (done) return false;
    done = true;
    reserved -= worstCaseUsd;
    return true;
  };

  return {
    release: () => void finish(),
    settle: async (kind: SpendKind, model: string, usage: Usage, options: { batch?: boolean } = {}) => {
      if (!finish()) return null;
      return record({ at: new Date().toISOString(), kind, model, usage, costUsd: costUsd(model, usage, options), ...options });
    },
  };
}

async function record(entry: LedgerEntry): Promise<LedgerEntry> {
  await mkdir(dirname(LEDGER_FILE), { recursive: true });
  await appendFile(LEDGER_FILE, `${JSON.stringify(entry)}\n`);
  spent = (await loadSpent()) + entry.costUsd;
  return entry;
}
