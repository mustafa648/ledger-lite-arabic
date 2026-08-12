import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { fail, ok, requireAuth } from "./_shared";

export default defineTool({
  name: "list_accounts",
  title: "List chart of accounts",
  description: "List accounts from the chart of accounts, optionally filtered by type or a text search on code/name.",
  inputSchema: {
    search: z.string().optional().describe("Text to match against account code or name."),
    type: z.enum(["asset", "liability", "equity", "revenue", "expense"]).optional().describe("Account type filter."),
    limit: z.number().int().optional().describe("Max rows to return, default 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, type, limit }, ctx) => {
    requireAuth(ctx);
    let q = supabaseForUser(ctx)
      .from("accounts")
      .select("id, code, name, name_en, type, is_group, currency_code, is_active")
      .order("code")
      .limit(Math.min(Math.max(limit ?? 50, 1), 200));
    if (type) q = q.eq("type", type);
    if (search) q = q.or(`code.ilike.%${search}%,name.ilike.%${search}%,name_en.ilike.%${search}%`);
    const { data, error } = await q;
    return error ? fail(error.message) : ok(data);
  },
});
