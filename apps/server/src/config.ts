import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Load the repo-root .env in development. Variables already set in the
// environment take precedence over the file.
const envPath = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

export const config = {
  port: Number(process.env.PORT ?? 8787),
  tutorModel: process.env.TUTOR_MODEL ?? "claude-sonnet-5",
  /**
   * How much thinking the tutor does before replying: low | medium | high.
   * "auto" picks per turn from `routing.ts`, which the eval measured as no
   * better than plain medium, so medium is what ships.
   */
  tutorEffort: process.env.TUTOR_EFFORT ?? "medium",
  watchModel: process.env.WATCH_MODEL ?? "claude-haiku-4-5",
  sessionBudgetUsd: Number(process.env.SESSION_BUDGET_USD ?? 1),
  /** Hard cap on total development/testing spend across all sessions (USD). */
  devBudgetUsd: Number(process.env.DEV_BUDGET_USD ?? 5),
  /** Replay scripted tutor responses instead of calling Claude. */
  tutorMock: process.env.TUTOR_MOCK === "1",
  // An `ant auth login` profile also works, so a missing key isn't necessarily an error.
  apiKeyInEnv: Boolean(process.env.ANTHROPIC_API_KEY),
  /** Needed only for API keys that aren't scoped to a workspace. */
  workspaceId: process.env.ANTHROPIC_WORKSPACE_ID || undefined,
};
