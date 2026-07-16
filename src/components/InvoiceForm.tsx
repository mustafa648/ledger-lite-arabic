import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";

type Kind = "sales" | "purchases";
type Line = { description: string; qty: number; unit_price: number; tax_rate: number; account_id: string };

export function InvoiceForm({ kind }: { kind: Kind }) {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const table = kind === "sales" ? "sales_invoices" : "purchase_invoices";
  const linesTable = kind === "sales" ? "sales_invoice_lines" : "purchase_invoice_lines";
  const accountField = kind === "sales" ? "income_account_id" : "expense_account_id";
  const partyField = kind === "sales" ? "customer_id" : "supplier_id";
  const rpc = kind === "sales" ? "post_sales_invoice" : "post_purchase_invoice";

  const parties = useQuery({
    queryKey: ["parties-active", kind],
    queryFn: async () => {
      const t = kind === "sales" ? ["customer", "both"] : ["supplier", "both"];
      return (await supabase.from("parties").select("id, name, currency_code").in("type", t).eq("is_active", true)).data ?? [];
    },
  });
  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await supabase.from("branches").select("id, name").eq("is_active", true)).data ?? [],
  });
  const accounts = useQuery({
    queryKey: ["accounts-flat", kind],
    queryFn: async () => {
      const type = kind === "sales" ? "income" : "expense";
      return (await supabase.from("accounts").select("id, code, name, name_en").eq("is_active", true).eq("is_group", false).eq("type", type).order("code")).data ?? [];
    },
  });

  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [branchId, setBranchId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [currency, setCurrency] = useState("YER");
  const [lines, setLines] = useState<Line[]>([{ description: "", qty: 1, unit_price: 0, tax_rate: 0, account_id: "" }]);

  useEffect(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branches.data, branchId]);

  const totals = useMemo(() => {
    let subtotal = 0, tax = 0;
    lines.forEach((l) => {
      const lt = Number(l.qty || 0) * Number(l.unit_price || 0);
      subtotal += lt;
      tax += lt * (Number(l.tax_rate || 0) / 100);
    });
    return { subtotal, tax, total: subtotal + tax };
  }, [lines]);

  const save = useMutation({
    mutationFn: async (post: boolean) => {
      if (!partyId || !branchId) throw new Error("Missing required fields");
      const invRow: Record<string, any> = {
        branch_id: branchId,
        [partyField]: partyId,
        invoice_date: invoiceDate,
        due_date: dueDate || null,
        currency_code: currency,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        notes,
      };
      const { data: inv, error } = await supabase.from(table).insert(invRow).select().single();
      if (error) throw error;
      const lineRows = lines.filter((l) => l.description && (l.qty > 0)).map((l, i) => ({
        invoice_id: inv.id,
        description: l.description,
        qty: l.qty,
        unit_price: l.unit_price,
        tax_rate: l.tax_rate,
        line_total: Number(l.qty) * Number(l.unit_price),
        [accountField]: l.account_id || null,
        line_no: i + 1,
      }));
      if (lineRows.length === 0) throw new Error("No lines");
      const ins = await supabase.from(linesTable).insert(lineRows);
      if (ins.error) throw ins.error;
      if (post) {
        const { error: pErr } = await supabase.rpc(rpc as any, { _invoice_id: inv.id });
        if (pErr) throw pErr;
      }
      return inv.id as string;
    },
    onSuccess: () => {
      toast.success(t("common.save"));
      nav({ to: kind === "sales" ? "/sales" : "/purchases" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title={t(`${kind}.newInvoice`)}
        actions={
          <>
            <Button variant="outline" onClick={() => save.mutate(false)} disabled={save.isPending}>{t("common.saveDraft")}</Button>
            <Button onClick={() => save.mutate(true)} disabled={save.isPending}>{t("common.post")}</Button>
          </>
        }
      />
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t(`${kind}.${kind === "sales" ? "customer" : "supplier"}`)}</Label>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {(parties.data ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{t("invoice.invoiceDate")}</Label><Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t("invoice.dueDate")}</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>{t("common.branch")}</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(branches.data ?? []).map((b: any) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.currency")}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="YER">YER</SelectItem><SelectItem value="SAR">SAR</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 text-start">{t("common.description")}</th>
                  <th className="p-2 text-start w-40">{t("common.account")}</th>
                  <th className="p-2 text-end w-20">{t("invoice.qty")}</th>
                  <th className="p-2 text-end w-28">{t("invoice.unitPrice")}</th>
                  <th className="p-2 text-end w-20">{t("invoice.taxRate")}</th>
                  <th className="p-2 text-end w-28">{t("invoice.lineTotal")}</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2"><Input value={l.description} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} /></td>
                    <td className="p-2">
                      <Select value={l.account_id} onValueChange={(v) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, account_id: v } : x))}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{(accounts.data ?? []).map((a: any) => (<SelectItem key={a.id} value={a.id}>{a.code} — {i18n.language === "en" ? a.name_en || a.name : a.name}</SelectItem>))}</SelectContent>
                      </Select>
                    </td>
                    <td className="p-2"><Input type="number" step="0.01" className="text-end" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, qty: parseFloat(e.target.value) || 0 } : x))} /></td>
                    <td className="p-2"><Input type="number" step="0.01" className="text-end" value={l.unit_price} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, unit_price: parseFloat(e.target.value) || 0 } : x))} /></td>
                    <td className="p-2"><Input type="number" step="0.01" className="text-end" value={l.tax_rate} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, tax_rate: parseFloat(e.target.value) || 0 } : x))} /></td>
                    <td className="p-2 text-end">{formatMoney((l.qty || 0) * (l.unit_price || 0), currency, i18n.language)}</td>
                    <td className="p-2"><Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length <= 1}><Trash2 className="h-4 w-4" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { description: "", qty: 1, unit_price: 0, tax_rate: 0, account_id: "" }])}>
            <Plus className="me-1 h-4 w-4" />{t("journal.addLine")}
          </Button>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>{t("invoice.notes")}</Label><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            <div className="rounded-md border p-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("common.subtotal")}</span><span>{formatMoney(totals.subtotal, currency, i18n.language)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("common.tax")}</span><span>{formatMoney(totals.tax, currency, i18n.language)}</span></div>
              <div className="flex justify-between font-semibold text-base border-t pt-2"><span>{t("common.total")}</span><span>{formatMoney(totals.total, currency, i18n.language)}</span></div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}