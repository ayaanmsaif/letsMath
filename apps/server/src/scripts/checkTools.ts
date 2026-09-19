// Validates the board tool definitions against the API without spending anything:
// token counting is free, and it rejects a malformed tool schema the same way a
// real request would.
//
// Every model we might run is checked, not just the current one. The limits
// differ: Haiku compiles a smaller grammar than the larger models and refuses a
// tool set they accept.
import Anthropic from "@anthropic-ai/sdk";
import { createClaude } from "../claude";
import { config } from "../config";
import { boardToolsFor } from "../tutor/tools";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("✗ ANTHROPIC_API_KEY is empty. Paste your key into .env at the repo root.");
  process.exit(1);
}

const client = createClaude();
const models = [...new Set([config.tutorModel, config.watchModel])];

for (const model of models) {
  const tools = boardToolsFor(model);
  try {
    const { input_tokens } = await client.messages.countTokens({
      model,
      tools,
      messages: [{ role: "user", content: "Check my work." }],
    });
    const strict = tools.filter((tool) => tool.strict).length;
    console.log(`✓ All ${tools.length} tools are accepted by ${model} (${strict} strict)`);
    console.log(`  They cost ${input_tokens} input tokens per request (cached after the first turn).`);
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error(`✗ ${model} rejected the tools (${error.status}):`);
      console.error(`  ${error.message}`);
    } else {
      console.error(`✗ Couldn't check the tools for ${model}:`, error);
    }
    process.exitCode = 1;
  }
}

console.log("Nothing was spent: token counting is free.");
