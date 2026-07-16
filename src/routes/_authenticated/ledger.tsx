import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatMoney, formatDate } from "@/lib/format";
import { exportCsv, printSection } from "@/lib/exports";
import { Download, Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ledger")({ component: LedgerPage });

function LedgerPage() {
  const { t, i18n } = useTranslation();
  const [accountId, setAccountId] = useState<string>("");
  const [from, setFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const accounts = useQuery({
    queryKey: ["accounts-active"],
    queryFn: async () => (await supabase.from("accounts").select("id, code, name, name_en").eq("is_active", true).eq("is_group", false).order("code")).data ?? [],
  });

  const rows = useQuery({
    queryKey: ["ledger", accountId, from, to],
    enabled: !!accountId,
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_lines")
        .select("id, debit, credit, description, journal_entries!inner(id, entry_no, entry_date, status)")
        .eq("account_id", accountId)
        .eq("journal_entries.status", "posted")
        .gte("journal_entries.entry_date", from)
        .lte("journal_entries.entry_date", to)
        .order("journal_entries(entry_date)", { ascending: true });
      return data ?? [];
    },
  });

  let running = 0;
  const enriched = (rows.data ?? []).map((r: any) => {
    running += Number(r.debit || 0) - Number(r.credit || 0);
    return { ...r, balance: running };
  });

  const doExport = () => {
    exportCsv(
      `ledger-${accountId}`,
      [t("common.date"), t("journal.entryNo"), t("common.description"), t("common.debit"), t("common.credit"), t("common.balance")],
      enriched.map((r: any) => [formatDate(r.journal_entries.entry_date), r.journal_entries.entry_no, r.description ?? "", r.debit, r.credit, r.balance.toFixed(2)]),
    );
  };

  return (
    <>
      <PageHeader
        title={t("nav.ledger")}
        actions={
          <>
            <Button variant="outline" onClick={doExport} disabled={enriched.length === 0}><Download className="me-1 h-4 w-4" />{t("common.exportExcel")}</Button>
            <Button variant="outline" onClick={printSection}><Printer className="me-1 h-4 w-4" />{t("common.print")}</Button>
          </>
        }
      />
      <Card className="mb-4">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("common.account")}</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {(accounts.data ?? []).map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.code} — {i18n.language === "en" ? a.name_en || a.name : a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>{t("common.from")}</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t("common.to")}</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-start">{t("common.date")}</th>
                <th className="p-3 text-start">{t("journal.entryNo")}</th>
                <th className="p-3 text-start">{t("common.description")}</th>
                <th className="p-3 text-end">{t("common.debit")}</th>
                <th className="p-3 text-end">{t("common.credit")}</th>
                <th className="p-3 text-end">{t("reports.runningBalance")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {enriched.map((r: any) => (
                <tr key={r.id}>
                  <td className="p-3">{formatDate(r.journal_entries.entry_date)}</td>
                  <td className="p-3 font-mono text-xs">{r.journal_entries.entry_no}</td>
                  <td className="p-3">{r.description}</td>
                  <td className="p-3 text-end">{Number(r.debit) > 0 ? formatMoney(r.debit, "YER", i18n.language) : ""}</td>
                  <td className="p-3 text-end">{Number(r.credit) > 0 ? formatMoney(r.credit, "YER", i18n.language) : ""}</td>
                  <td className="p-3 text-end font-medium">{formatMoney(r.balance, "YER", i18n.language)}</td>
                </tr>
              ))}
              {!accountId && (<tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{i18n.language === "ar" ? "اختر حسابًا" : "Select an account"}</td></tr>)}
              {accountId && enriched.length === 0 && !rows.isLoading && (<tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{t("common.noData")}</td></tr>)}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}