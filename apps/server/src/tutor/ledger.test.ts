import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Each test gets a fresh ledger file and a fresh module (the running total is cached in memory).
async function loadLedger(budget: number) {
  const path = join(mkdtempSync(join(tmpdir(), "letsmath-ledger-")), "ledger.jsonl");
  process.env.USAGE_LEDGER_PATH = path;
  process.env.DEV_BUDGET_USD = String(budget);
  vi.resetModules();
  return { path, ledger: await import("./ledger") };
}

describe("spend ledger", () => {
  beforeEach(() => {
    delete process.env.USAGE_LEDGER_PATH;
  });

  it("records real usage and keeps a running total", async () => {
    const { path, ledger } = await loadLedger(5);
    const slot = await ledger.reserve(0.1);
    await slot.settle("tutor", "claude-sonnet-5", { input_tokens: 10_000, output_tokens: 1_000 });

    const status = await ledger.budgetStatus();
    expect(status.spentUsd).toBeCloseTo(0.03);
    expect(status.state).toBe("ok");
    expect(readFileSync(path, "utf8").trim().split("\n")).toHaveLength(1);
  });

  it("refuses a request whose worst case would exceed the budget", async () => {
    const { ledger } = await loadLedger(0.05);
    await expect(ledger.reserve(0.06)).rejects.toBeInstanceOf(ledger.BudgetExceededError);
  });

  it("counts in-flight reservations so concurrent requests can't overshoot", async () => {
    const { ledger } = await loadLedger(0.1);
    const first = await ledger.reserve(0.08);
    await expect(ledger.reserve(0.08)).rejects.toBeInstanceOf(ledger.BudgetExceededError);
    first.release();
    await expect(ledger.reserve(0.08)).resolves.toBeDefined();
  });

  it("warns at 80% and reports exhaustion", async () => {
    const { ledger } = await loadLedger(0.01);
    const slot = await ledger.reserve(0.009);
    await slot.settle("tutor", "claude-haiku-4-5", { input_tokens: 0, output_tokens: 1_700 });
    expect((await ledger.budgetStatus()).state).toBe("warning");
  });
});
