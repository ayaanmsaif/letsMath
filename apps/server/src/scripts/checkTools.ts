// Validates the board tool definitions against the API without spending anything:
// token counting is free, and it rejects a malformed tool schema the same way a
// real request would.
import Anthropic from "@anthropic-ai/sdk";
import { createClaude } from "../claude";
import { config } from "../config";
import { boardTools } from "../tutor/tools";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("✗ ANTHROPIC_API_KEY is empty. Paste your key into .env at the repo root.");
  process.exit(1);
}

const client = createClaude();

try {
  const { input_tokens } = await client.messages.countTokens({
    model: config.tutorModel,
    tools: boardTools,
    messages: [{ role: "user", content: "Check my work." }],
  });
  console.log(`✓ All ${boardTools.length} board tools are accepted by ${config.tutorModel}`);
  console.log(`  They cost ${input_tokens} input tokens per request (cached after the first turn).`);
  console.log("  Nothing was spent: token counting is free.");
} catch (error) {
  if (error instanceof Anthropic.APIError) {
    console.error(`✗ The API rejected the tools (${error.status}):`);
    console.error(`  ${error.message}`);
  } else {
    console.error("✗ Couldn't check the tools:", error);
  }
  process.exitCode = 1;
}
