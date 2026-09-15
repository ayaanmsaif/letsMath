// Checks the API key and model access without spending anything:
// model lookups and token counting are free.
import Anthropic from "@anthropic-ai/sdk";
import { createClaude } from "../claude";
import { config } from "../config";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("✗ ANTHROPIC_API_KEY is empty. Paste your key into .env at the repo root.");
  process.exit(1);
}

const client = createClaude();

try {
  for (const model of new Set([config.tutorModel, config.watchModel])) {
    const info = await client.models.retrieve(model);
    console.log(`✓ ${info.display_name} (${info.id}) is available`);
  }
  const { input_tokens } = await client.messages.countTokens({
    model: config.tutorModel,
    messages: [{ role: "user", content: "Is sin 30° equal to 1/2?" }],
  });
  console.log(`✓ Token counting works (${input_tokens} tokens for a test message)`);
  console.log(`Testing budget: $${config.devBudgetUsd.toFixed(2)} (DEV_BUDGET_USD). Nothing was spent.`);
} catch (error) {
  if (error instanceof Anthropic.AuthenticationError) {
    console.error("✗ The API key was rejected. Check ANTHROPIC_API_KEY in .env.");
  } else if (error instanceof Anthropic.BadRequestError && error.message.includes("anthropic-workspace-id")) {
    console.error(
      "✗ This key isn't scoped to a workspace. Either create a key inside a workspace in the Console,\n" +
        "  or add ANTHROPIC_WORKSPACE_ID=<workspace id> to .env.",
    );
  } else if (error instanceof Anthropic.PermissionDeniedError) {
    console.error("✗ This key isn't allowed to use that model:", error.message);
  } else if (error instanceof Anthropic.NotFoundError) {
    console.error("✗ Model not found:", error.message);
  } else if (error instanceof Anthropic.APIConnectionError) {
    console.error("✗ Couldn't reach the Claude API:", error.message);
  } else if (error instanceof Anthropic.APIError) {
    console.error(`✗ API error ${error.status}:`, error.message);
  } else {
    throw error;
  }
  process.exitCode = 1;
}
