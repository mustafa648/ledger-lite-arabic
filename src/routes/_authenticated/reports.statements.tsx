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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney, formatDate } from "@/lib/format";
import { printSection } from "@/lib/exports";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports/statements")({ component: Statement });

function Statement() {
  const { t, i18n } = useTranslation();
  const [partyId, setPartyId] = useState("");
  const [from, setFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const parties = useQuery({ queryKey: ["parties-all"], queryFn: async () => (await supabase.from("parties").select("id, name, type, opening_balance").eq("is_active", true).order("name")).data ?? [] });

  const rows = useQuery({
    queryKey: ["statement", partyId, from, to],
    enabled: !!partyId,
    queryFn: async () => {
      const party = parties.data?.find((p: any) => p.id === partyId);
      const isCustomer = party?.type === "customer" || party?.type === "both";
      const [inv, pay] = await Promise.all([
        isCustomer
          ? supabase.from("sales_invoices").select("id, invoice_no, invoice_date, total").eq("customer_id", partyId).eq("status", "posted").gte("invoice_date", from).lte("invoice_date", to)
          : supabase.from("purchase_invoices").select("id, invoice_no, invoice_date, total").eq("supplier_id", partyId).eq("status", "posted").gte("invoice_date", from).lte("invoice_date", to),
        supabase.from("payments").select("id, payment_no, payment_date, direction, amount").eq("party_id", partyId).eq("status", "posted").gte("payment_date", from).lte("payment_date", to),
      ]);
      const items: any[] = [];
      (inv.data ?? []).forEach((r: any) => items.push({ id: r.id, date: r.invoice_date, ref: r.invoice_no, kind: "invoice", debit: isCustomer ? Number(r.total) : 0, credit: isCustomer ? 0 : Number(r.total) }));
      (pay.data ?? []).forEach((r: any) => items.push({ id: r.id, date: r.payment_date, ref: r.payment_no, kind: r.direction, debit: r.direction === "payment" ? Number(r.amount) : 0, credit: r.direction === "receipt" ? Number(r.amount) : 0 }));
      items.sort((a, b) => a.date.localeCompare(b.date));
      return { items, opening: Number(party?.opening_balance || 0) };
    },
  });

  let running = rows.data?.opening ?? 0;
  const enriched = (rows.data?.items ?? []).map((r: any) => {
    running += r.debit - r.credit;
    return { ...r, balance: running };
  });

  return (
    <>
      <PageHeader
        title={t("reports.partyStatement")}
        actions={<Button variant="outline" onClick={printSection}><Printer className="me-1 h-4 w-4" />{t("common.print")}</Button>}
      />
      <Card className="mb-4">
        <CardContent className="p-4 grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2"><Label>{t("common.name")}</Label>
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{(parties.data ?? []).map((p: any) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent>
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
                <th className="p-3 text-start">#</th>
                <th className="p-3 text-start">{t("common.type")}</th>
                <th className="p-3 text-end">{t("common.debit")}</th>
                <th className="p-3 text-end">{t("common.credit")}</th>
                <th className="p-3 text-end">{t("reports.runningBalance")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {partyId && (
                <tr className="bg-muted/20 font-medium">
                  <td className="p-3" colSpan={5}>{t("reports.openingBalance")}</td>
                  <td className="p-3 text-end">{formatMoney(rows.data?.opening ?? 0, "YER", i18n.language)}</td>
                </tr>
              )}
              {enriched.map((r: any) => (
                <tr key={r.id}>
                  <td className="p-3">{formatDate(r.date)}</td>
                  <td className="p-3 font-mono text-xs">{r.ref}</td>
                  <td className="p-3">{r.kind}</td>
                  <td className="p-3 text-end">{r.debit ? formatMoney(r.debit, "YER", i18n.language) : ""}</td>
                  <td className="p-3 text-end">{r.credit ? formatMoney(r.credit, "YER", i18n.language) : ""}</td>
                  <td className="p-3 text-end font-medium">{formatMoney(r.balance, "YER", i18n.language)}</td>
                </tr>
              ))}
              {!partyId && (<tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{i18n.language === "ar" ? "اختر جهة" : "Select a party"}</td></tr>)}
              {partyId && enriched.length === 0 && !rows.isLoading && (<tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{t("common.noData")}</td></tr>)}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}