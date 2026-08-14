import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { NumberInput } from "@/components/ui/number-input";
import { SearchSelect } from "@/components/ui/search-select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { enqueueInvoice } from "@/lib/offline-queue";

type Kind = "sales" | "purchases";
type PaymentMethod = "cash" | "credit" | "bank";
type Line = { description: string; qty: number; unit_price: number; tax_rate: number; account_id: string; item_id: string };

export function InvoiceForm({ kind }: { kind: Kind }) {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const table = kind === "sales" ? "sales_invoices" : "purchase_invoices";
  const linesTable = kind === "sales" ? "sales_invoice_lines" : "purchase_invoice_lines";
  const accountField = kind === "sales" ? "income_account_id" : "expense_account_id";
  const partyField = kind === "sales" ? "customer_id" : "supplier_id";
  const rpc = kind === "sales" ? "post_sales_invoice" : "post_purchase_invoice";

  const parties = useQuery({
    queryKey: ["parties-active", kind],
    queryFn: async () => {
      const types = kind === "sales" ? ["customer", "both"] : ["supplier", "both"];
      return (await supabase.from("parties").select("id, name, currency_code").in("type", types as any).eq("is_active", true)).data ?? [];
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
  const itemsQ = useQuery({
    queryKey: ["items-active"],
    queryFn: async () => (await supabase.from("items").select("id, sku, name, name_en, sale_price, average_cost, is_service").eq("is_active", true).order("sku")).data ?? [],
  });
  const cashAccounts = useQuery({
    queryKey: ["cash-bank-accounts"],
    queryFn: async () =>
      (await supabase.from("accounts").select("id, code").in("code", ["1101", "1102"])).data ?? [],
  });

  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [branchId, setBranchId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [currency, setCurrency] = useState("YER");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("credit");
  const [lines, setLines] = useState<Line[]>([{ description: "", qty: 1, unit_price: 0, tax_rate: 0, account_id: "", item_id: "" }]);

  const [partyDlg, setPartyDlg] = useState<{ open: boolean; query: string }>({ open: false, query: "" });
  const [itemDlg, setItemDlg] = useState<{ open: boolean; query: string; lineIndex: number }>({
    open: false,
    query: "",
    lineIndex: 0,
  });

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
      if (!paymentMethod) throw new Error(t("invoice.paymentMethod"));
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
        payment_method: paymentMethod,
        paid_amount: paymentMethod === "credit" ? 0 : totals.total,
      };
      const buildLines = (invoiceId: string | null) =>
        lines
          .filter((l) => l.description && l.qty > 0)
          .map((l, i) => ({
            ...(invoiceId ? { invoice_id: invoiceId } : {}),
            description: l.description,
            qty: l.qty,
            unit_price: l.unit_price,
            tax_rate: l.tax_rate,
            line_total: Number(l.qty) * Number(l.unit_price),
            [accountField]: l.account_id || null,
            item_id: l.item_id || null,
            line_no: i + 1,
          }));

      const cashAccountId =
        paymentMethod === "credit"
          ? null
          : ((cashAccounts.data ?? []).find((a: any) => a.code === (paymentMethod === "cash" ? "1101" : "1102"))?.id ??
            null);

      const paymentRow =
        paymentMethod === "credit" || !cashAccountId
          ? null
          : {
              branch_id: branchId,
              party_id: partyId,
              direction: kind === "sales" ? "receipt" : "payment",
              payment_date: invoiceDate,
              amount: totals.total,
              currency_code: currency,
              cash_account_id: cashAccountId,
              method: paymentMethod === "cash" ? "cash" : "bank",
              notes,
            };

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const offlineLines = buildLines(null);
        if (offlineLines.length === 0) throw new Error("No lines");
        enqueueInvoice({ kind, invoice: invRow, lines: offlineLines, post, payment: paymentRow });
        return "offline";
      }

      const { data: inv, error } = await (supabase.from(table as any) as any).insert(invRow).select().single();
      if (error) throw error;
      const lineRows = buildLines(inv.id);
      if (lineRows.length === 0) throw new Error("No lines");
      const ins = await (supabase.from(linesTable as any) as any).insert(lineRows);
      if (ins.error) throw ins.error;
      if (post) {
        const { error: pErr } = await supabase.rpc(rpc as any, { _invoice_id: inv.id });
        if (pErr) throw pErr;
      }
      if (paymentRow) {
        const { data: pay, error: payErr } = await supabase.from("payments").insert(paymentRow as any).select().single();
        if (payErr) throw payErr;
        if (post) {
          const { error: postPayErr } = await supabase.rpc("post_payment", { _payment_id: pay.id });
          if (postPayErr) throw postPayErr;
        }
      }
      return inv.id as string;
    },
    onSuccess: (res) => {
      toast.success(res === "offline" ? t("common.offlineQueued") : t("common.save"));
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
              <SearchSelect
                value={partyId}
                onChange={setPartyId}
                options={(parties.data ?? []).map((p: any) => ({ value: p.id, label: p.name }))}
                placeholder={t("common.search")}
                emptyText={t("common.noData")}
                onCreate={(q) => setPartyDlg({ open: true, query: q })}
                createLabel={t(`${kind}.${kind === "sales" ? "customer" : "supplier"}`)}
              />
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
            <div className="space-y-1.5">
              <Label>
                {t("invoice.paymentMethod")} <span className="text-destructive">*</span>
              </Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t("invoice.pmCash")}</SelectItem>
                  <SelectItem value="credit">{t("invoice.pmCredit")}</SelectItem>
                  <SelectItem value="bank">{t("invoice.pmBank")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 text-start w-44">{t("items.item")}</th>
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
                    <td className="p-2">
                      <SearchSelect
                        value={l.item_id}
                        onChange={(v) =>
                          setLines((ls) =>
                            ls.map((x, j) => {
                              if (j !== i) return x;
                              const it = (itemsQ.data ?? []).find((z: any) => z.id === v);
                              if (!it) return { ...x, item_id: v };
                              const price = kind === "sales" ? Number(it.sale_price) : Number(it.average_cost);
                              return {
                                ...x,
                                item_id: v,
                                description: x.description || (i18n.language === "en" ? it.name_en || it.name : it.name),
                                unit_price: x.unit_price || price,
                              };
                            }),
                          )
                        }
                        options={(itemsQ.data ?? []).map((it: any) => ({
                          value: it.id,
                          label: i18n.language === "en" ? it.name_en || it.name : it.name,
                          sub: it.sku,
                        }))}
                        placeholder={t("items.item")}
                        emptyText={t("common.noData")}
                        onCreate={(q) => setItemDlg({ open: true, query: q, lineIndex: i })}
                        createLabel={t("items.newItem")}
                      />
                    </td>
                    <td className="p-2"><Input value={l.description} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} /></td>
                    <td className="p-2">
                      <Select value={l.account_id} onValueChange={(v) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, account_id: v } : x))}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{(accounts.data ?? []).map((a: any) => (<SelectItem key={a.id} value={a.id}>{a.code} — {i18n.language === "en" ? a.name_en || a.name : a.name}</SelectItem>))}</SelectContent>
                      </Select>
                    </td>
                    <td className="p-2"><NumberInput className="text-end" value={l.qty} onChange={(n) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, qty: n } : x))} /></td>
                    <td className="p-2"><NumberInput className="text-end" value={l.unit_price} onChange={(n) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, unit_price: n } : x))} /></td>
                    <td className="p-2"><NumberInput className="text-end" value={l.tax_rate} onChange={(n) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, tax_rate: n } : x))} /></td>
                    <td className="p-2 text-end">{formatMoney((l.qty || 0) * (l.unit_price || 0), currency, i18n.language)}</td>
                    <td className="p-2"><Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length <= 1}><Trash2 className="h-4 w-4" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { description: "", qty: 1, unit_price: 0, tax_rate: 0, account_id: "", item_id: "" }])}>
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

      <QuickPartyDialog
        kind={kind}
        open={partyDlg.open}
        initialName={partyDlg.query}
        onOpenChange={(o) => setPartyDlg((s) => ({ ...s, open: o }))}
        onCreated={(id) => {
          setPartyId(id);
          qc.invalidateQueries({ queryKey: ["parties-active", kind] });
          setPartyDlg({ open: false, query: "" });
        }}
      />
      <QuickItemDialog
        open={itemDlg.open}
        initialName={itemDlg.query}
        onOpenChange={(o) => setItemDlg((s) => ({ ...s, open: o }))}
        onCreated={(id) => {
          const idx = itemDlg.lineIndex;
          setLines((ls) => ls.map((x, j) => (j === idx ? { ...x, item_id: id } : x)));
          qc.invalidateQueries({ queryKey: ["items-active"] });
          setItemDlg({ open: false, query: "", lineIndex: 0 });
        }}
      />
    </>
  );
}

function QuickPartyDialog({
  kind,
  open,
  initialName,
  onOpenChange,
  onCreated,
}: {
  kind: Kind;
  open: boolean;
  initialName: string;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  useEffect(() => {
    if (open) {
      setName(initialName);
      setPhone("");
    }
  }, [open, initialName]);
  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name required");
      const { data, error } = await supabase
        .from("parties")
        .insert({ name: name.trim(), phone: phone || null, type: kind === "sales" ? "customer" : "supplier" } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success(t("common.save"));
      onCreated(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`${kind}.${kind === "sales" ? "customer" : "supplier"}`)}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>{t("common.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>{t("common.phone")}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickItemDialog({
  open,
  initialName,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  initialName: string;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState(0);
  useEffect(() => {
    if (open) {
      setName(initialName);
      setSku("");
      setPrice(0);
    }
  }, [open, initialName]);
  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !sku.trim()) throw new Error("SKU + name required");
      const { data, error } = await supabase
        .from("items")
        .insert({ sku: sku.trim(), name: name.trim(), sale_price: price, unit: "قطعة" } as any)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success(t("common.save"));
      onCreated(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("items.newItem")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("items.sku")}</Label>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} autoFocus />
            </div>
            <div>
              <Label>{t("items.salePrice")}</Label>
              <NumberInput value={price} onChange={setPrice} />
            </div>
          </div>
          <div>
            <Label>{t("common.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim() || !sku.trim()}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}