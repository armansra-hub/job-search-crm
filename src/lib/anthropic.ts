import Anthropic from "@anthropic-ai/sdk";

// Server-only. The key never reaches the browser — these helpers run inside
// /api route handlers.
export function anthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set.");
  return new Anthropic({ apiKey: key });
}

// Model IDs are configurable via env (spec requirement). Defaults below.
export const MODEL_REASONING =
  process.env.ANTHROPIC_MODEL_REASONING || "claude-sonnet-4-6";
export const MODEL_FAST =
  process.env.ANTHROPIC_MODEL_FAST || "claude-haiku-4-5";

// Pull plain text out of a messages response.
export function textOf(message: Anthropic.Messages.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// Pull the first tool_use input out of a messages response (structured output).
export function toolInputOf<T = unknown>(
  message: Anthropic.Messages.Message,
  toolName: string,
): T | null {
  for (const block of message.content) {
    if (block.type === "tool_use" && block.name === toolName) {
      return block.input as T;
    }
  }
  return null;
}
