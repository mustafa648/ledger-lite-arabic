import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { fail, ok, requireAuth } from "./_shared";

export default defineTool({
  name: "list_parties",
  title: "List customers and suppliers",
  description: "List customers and suppliers (parties), optionally filtered by type or name/code search.",
  inputSchema: {
    search: z.string().optional().describe("Text to match against party name, code, phone or email."),
    type: z.enum(["customer", "supplier", "both"]).optional().describe("Party type filter."),
    limit: z.number().int().optional().describe("Max rows to return, default 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, type, limit }, ctx) => {
    requireAuth(ctx);
    let q = supabaseForUser(ctx)
      .from("parties")
      .select("id, code, name, type, phone, email, currency_code, opening_balance")
      .order("name")
      .limit(Math.min(Math.max(limit ?? 50, 1), 200));
    if (type) q = q.eq("type", type);
    if (search) q = q.or(`name.ilike.%${search}%,code.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    const { data, error } = await q;
    return error ? fail(error.message) : ok(data);
  },
});
