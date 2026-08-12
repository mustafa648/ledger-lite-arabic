import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { fail, ok, requireAuth } from "./_shared";

export default defineTool({
  name: "list_invoices",
  title: "List sales or purchase invoices",
  description: "List sales or purchase invoices with totals, status and dates.",
  inputSchema: {
    kind: z.enum(["sales", "purchase"]).describe("Which invoice ledger to read."),
    status: z.enum(["draft", "posted", "cancelled"]).optional().describe("Filter by invoice status."),
    from_date: z.string().optional().describe("Earliest invoice date, ISO format YYYY-MM-DD."),
    to_date: z.string().optional().describe("Latest invoice date, ISO format YYYY-MM-DD."),
    limit: z.number().int().optional().describe("Max rows to return, default 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ kind, status, from_date, to_date, limit }, ctx) => {
    requireAuth(ctx);
    const table = kind === "sales" ? "sales_invoices" : "purchase_invoices";
    const partyCol = kind === "sales" ? "customer_id" : "supplier_id";
    let q = supabaseForUser(ctx)
      .from(table)
      .select(
        `id, invoice_no, invoice_date, due_date, currency_code, subtotal, tax, total, paid_amount, status, ${partyCol}, party:${partyCol}(name)`,
      )
      .order("invoice_date", { ascending: false })
      .limit(Math.min(Math.max(limit ?? 50, 1), 200));
    if (status) q = q.eq("status", status);
    if (from_date) q = q.gte("invoice_date", from_date);
    if (to_date) q = q.lte("invoice_date", to_date);
    const { data, error } = await q;
    return error ? fail(error.message) : ok(data);
  },
});
