import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";

/**
 * The server's Claude client. Keys that aren't scoped to a workspace must name
 * one on every request; the SDK doesn't add that header for API keys itself.
 */
export function createClaude(): Anthropic {
  return new Anthropic(
    config.workspaceId ? { defaultHeaders: { "anthropic-workspace-id": config.workspaceId } } : {},
  );
}
