import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { fail, ok, requireAuth } from "./_shared";

export default defineTool({
  name: "list_items",
  title: "List inventory items",
  description: "List inventory items with stock on hand, average cost and sale price.",
  inputSchema: {
    search: z.string().optional().describe("Text to match against item name or SKU."),
    only_in_stock: z.boolean().optional().describe("When true, return only items with quantity on hand greater than zero."),
    limit: z.number().int().optional().describe("Max rows to return, default 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, only_in_stock, limit }, ctx) => {
    requireAuth(ctx);
    let q = supabaseForUser(ctx)
      .from("items")
      .select("id, sku, name, name_en, unit, is_service, sale_price, average_cost, quantity_on_hand, is_active")
      .order("name")
      .limit(Math.min(Math.max(limit ?? 50, 1), 200));
    if (search) q = q.or(`name.ilike.%${search}%,name_en.ilike.%${search}%,sku.ilike.%${search}%`);
    if (only_in_stock) q = q.gt("quantity_on_hand", 0);
    const { data, error } = await q;
    return error ? fail(error.message) : ok(data);
  },
});
