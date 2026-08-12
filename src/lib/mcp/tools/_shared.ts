import type { ToolContext } from "@lovable.dev/mcp-js";

export function requireAuth(ctx: ToolContext) {
  if (!ctx.isAuthenticated()) throw new Error("Not authenticated");
}

export function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: { data } as Record<string, unknown>,
  };
}

export function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}
