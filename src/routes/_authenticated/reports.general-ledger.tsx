import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatMoney, formatDate } from "@/lib/format";
import { printSection } from "@/lib/exports";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports/general-ledger")({ component: GLReport });

function GLReport() {
  const { t, i18n } = useTranslation();
  const [from, setFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const q = useQuery({
    queryKey: ["gl-report", from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_lines")
        .select("id, debit, credit, description, accounts(code, name, name_en), journal_entries!inner(entry_no, entry_date, status)")
        .eq("journal_entries.status", "posted")
        .gte("journal_entries.entry_date", from)
        .lte("journal_entries.entry_date", to)
        .order("account_id");
      // Group by account
      const groups = new Map<string, any[]>();
      (data ?? []).forEach((r: any) => {
        const k = r.accounts?.code ?? "?";
        const arr = groups.get(k) ?? [];
        arr.push(r);
        groups.set(k, arr);
      });
      return Array.from(groups.entries()).sort();
    },
  });

  return (
    <>
      <PageHeader
        title={t("reports.generalLedger")}
        actions={<Button variant="outline" onClick={printSection}><Printer className="me-1 h-4 w-4" />{t("common.print")}</Button>}
      />
      <Card className="mb-4">
        <CardContent className="p-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>{t("common.from")}</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t("common.to")}</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </CardContent>
      </Card>
      <div className="space-y-4">
        {(q.data ?? []).map(([code, rows]: any) => {
          let running = 0;
          return (
            <Card key={code}>
              <CardContent className="p-0">
                <div className="border-b bg-muted/40 p-3 text-sm font-semibold">
                  {code} — {i18n.language === "en" ? rows[0].accounts?.name_en || rows[0].accounts?.name : rows[0].accounts?.name}
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-muted/20 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="p-2 text-start">{t("common.date")}</th>
                      <th className="p-2 text-start">{t("journal.entryNo")}</th>
                      <th className="p-2 text-start">{t("common.description")}</th>
                      <th className="p-2 text-end">{t("common.debit")}</th>
                      <th className="p-2 text-end">{t("common.credit")}</th>
                      <th className="p-2 text-end">{t("reports.runningBalance")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r: any) => {
                      running += Number(r.debit || 0) - Number(r.credit || 0);
                      return (
                        <tr key={r.id}>
                          <td className="p-2">{formatDate(r.journal_entries.entry_date)}</td>
                          <td className="p-2 font-mono text-xs">{r.journal_entries.entry_no}</td>
                          <td className="p-2">{r.description}</td>
                          <td className="p-2 text-end">{Number(r.debit) > 0 ? formatMoney(r.debit, "YER", i18n.language) : ""}</td>
                          <td className="p-2 text-end">{Number(r.credit) > 0 ? formatMoney(r.credit, "YER", i18n.language) : ""}</td>
                          <td className="p-2 text-end font-medium">{formatMoney(running, "YER", i18n.language)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          );
        })}
        {(q.data ?? []).length === 0 && !q.isLoading && (
          <div className="p-8 text-center text-muted-foreground">{t("common.noData")}</div>
        )}
      </div>
    </>
  );
}