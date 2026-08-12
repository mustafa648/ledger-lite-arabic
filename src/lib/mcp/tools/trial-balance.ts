import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { fail, ok, requireAuth } from "./_shared";

type Line = {
  debit: number | null;
  credit: number | null;
  account: { code: string; name: string; type: string } | null;
  entry: { entry_date: string; status: string } | null;
};

export default defineTool({
  name: "trial_balance",
  title: "Trial balance",
  description: "Aggregate posted journal lines into a trial balance per account for an optional date range.",
  inputSchema: {
    from_date: z.string().optional().describe("Start date, ISO format YYYY-MM-DD."),
    to_date: z.string().optional().describe("End date, ISO format YYYY-MM-DD."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_date, to_date }, ctx) => {
    requireAuth(ctx);
    let q = supabaseForUser(ctx)
      .from("journal_lines")
      .select("debit, credit, account:account_id(code, name, type), entry:entry_id!inner(entry_date, status)")
      .eq("entry.status", "posted")
      .limit(5000);
    if (from_date) q = q.gte("entry.entry_date", from_date);
    if (to_date) q = q.lte("entry.entry_date", to_date);
    const { data, error } = await q;
    if (error) return fail(error.message);

    const totals = new Map<string, { code: string; name: string; type: string; debit: number; credit: number }>();
    for (const line of (data ?? []) as unknown as Line[]) {
      const acc = line.account;
      if (!acc) continue;
      const row = totals.get(acc.code) ?? { code: acc.code, name: acc.name, type: acc.type, debit: 0, credit: 0 };
      row.debit += Number(line.debit ?? 0);
      row.credit += Number(line.credit ?? 0);
      totals.set(acc.code, row);
    }
    const rows = [...totals.values()]
      .map((r) => ({ ...r, balance: r.debit - r.credit }))
      .sort((a, b) => a.code.localeCompare(b.code));
    return ok({
      from_date: from_date ?? null,
      to_date: to_date ?? null,
      total_debit: rows.reduce((s, r) => s + r.debit, 0),
      total_credit: rows.reduce((s, r) => s + r.credit, 0),
      rows,
    });
  },
});
