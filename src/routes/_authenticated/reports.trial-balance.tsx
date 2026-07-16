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
import { formatMoney } from "@/lib/format";
import { exportCsv, printSection } from "@/lib/exports";
import { Download, Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports/trial-balance")({ component: TrialBalance });

function TrialBalance() {
  const { t, i18n } = useTranslation();
  const [from, setFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const q = useQuery({
    queryKey: ["trial-balance", from, to],
    queryFn: async () => {
      const [accs, lines] = await Promise.all([
        supabase.from("accounts").select("id, code, name, name_en, type, is_group").eq("is_active", true).order("code"),
        supabase.from("journal_lines").select("account_id, debit, credit, journal_entries!inner(entry_date, status)").eq("journal_entries.status", "posted").gte("journal_entries.entry_date", from).lte("journal_entries.entry_date", to),
      ]);
      const map = new Map<string, { debit: number; credit: number }>();
      (lines.data ?? []).forEach((l: any) => {
        const cur = map.get(l.account_id) ?? { debit: 0, credit: 0 };
        cur.debit += Number(l.debit || 0);
        cur.credit += Number(l.credit || 0);
        map.set(l.account_id, cur);
      });
      return (accs.data ?? [])
        .filter((a: any) => !a.is_group)
        .map((a: any) => {
          const m = map.get(a.id) ?? { debit: 0, credit: 0 };
          return { ...a, debit: m.debit, credit: m.credit, balance: m.debit - m.credit };
        })
        .filter((r: any) => r.debit || r.credit);
    },
  });

  const rows = q.data ?? [];
  const totalD = rows.reduce((s: number, r: any) => s + r.debit, 0);
  const totalC = rows.reduce((s: number, r: any) => s + r.credit, 0);

  return (
    <>
      <PageHeader
        title={t("reports.trialBalance")}
        actions={
          <>
            <Button variant="outline" onClick={() => exportCsv("trial-balance", [t("common.code"), t("common.name"), t("common.debit"), t("common.credit"), t("common.balance")], rows.map((r: any) => [r.code, i18n.language === "en" ? r.name_en || r.name : r.name, r.debit, r.credit, r.balance]))} disabled={!rows.length}><Download className="me-1 h-4 w-4" />{t("common.exportExcel")}</Button>
            <Button variant="outline" onClick={printSection}><Printer className="me-1 h-4 w-4" />{t("common.print")}</Button>
          </>
        }
      />
      <Card className="mb-4">
        <CardContent className="p-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>{t("common.from")}</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t("common.to")}</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-start">{t("common.code")}</th>
                <th className="p-3 text-start">{t("common.name")}</th>
                <th className="p-3 text-end">{t("common.debit")}</th>
                <th className="p-3 text-end">{t("common.credit")}</th>
                <th className="p-3 text-end">{t("common.balance")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r: any) => (
                <tr key={r.id}>
                  <td className="p-3 font-mono text-xs">{r.code}</td>
                  <td className="p-3">{i18n.language === "en" ? r.name_en || r.name : r.name}</td>
                  <td className="p-3 text-end">{r.debit ? formatMoney(r.debit, "YER", i18n.language) : ""}</td>
                  <td className="p-3 text-end">{r.credit ? formatMoney(r.credit, "YER", i18n.language) : ""}</td>
                  <td className="p-3 text-end font-medium">{formatMoney(r.balance, "YER", i18n.language)}</td>
                </tr>
              ))}
              {rows.length === 0 && !q.isLoading && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">{t("common.noData")}</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="font-semibold bg-muted/30">
                <td colSpan={2} className="p-3 text-end">{t("common.total")}</td>
                <td className="p-3 text-end">{formatMoney(totalD, "YER", i18n.language)}</td>
                <td className="p-3 text-end">{formatMoney(totalC, "YER", i18n.language)}</td>
                <td className="p-3 text-end">{formatMoney(totalD - totalC, "YER", i18n.language)}</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>
    </>
  );
}