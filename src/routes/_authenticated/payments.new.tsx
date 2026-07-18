import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/payments/new")({ component: NewPayment });

function NewPayment() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [direction, setDirection] = useState<"receipt" | "payment">("receipt");
  const [partyId, setPartyId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState("YER");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const parties = useQuery({ queryKey: ["parties-all"], queryFn: async () => (await supabase.from("parties").select("id, name, type").eq("is_active", true)).data ?? [] });
  const branches = useQuery({ queryKey: ["branches"], queryFn: async () => (await supabase.from("branches").select("id, name").eq("is_active", true)).data ?? [] });
  const cashAccounts = useQuery({ queryKey: ["cash-accounts"], queryFn: async () => (await supabase.from("accounts").select("id, code, name").eq("is_group", false).eq("is_active", true).eq("type", "asset").order("code")).data ?? [] });

  useEffect(() => { if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id); }, [branches.data, branchId]);
  useEffect(() => { if (!cashAccountId && cashAccounts.data?.[0]) setCashAccountId(cashAccounts.data[0].id); }, [cashAccounts.data, cashAccountId]);

  const save = useMutation({
    mutationFn: async (post: boolean) => {
      if (!partyId || !branchId || !cashAccountId || amount <= 0) throw new Error("Missing required fields");
      const { data: p, error } = await supabase.from("payments").insert({
        branch_id: branchId,
        party_id: partyId,
        direction,
        payment_date: date,
        amount,
        currency_code: currency,
        cash_account_id: cashAccountId,
        method,
        reference,
        notes,
      }).select().single();
      if (error) throw error;
      if (post) {
        const { error: pErr } = await supabase.rpc("post_payment", { _payment_id: p.id });
        if (pErr) throw pErr;
      }
    },
    onSuccess: () => { toast.success(t("common.save")); nav({ to: "/payments" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title={t("payments.newPayment")}
        actions={
          <>
            <Button variant="outline" onClick={() => save.mutate(false)} disabled={save.isPending}>{t("common.saveDraft")}</Button>
            <Button onClick={() => save.mutate(true)} disabled={save.isPending}>{t("common.post")}</Button>
          </>
        }
      />
      <Card>
        <CardContent className="p-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>{t("payments.direction")}</Label>
            <Select value={direction} onValueChange={(v: any) => setDirection(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="receipt">{t("payments.receipt")}</SelectItem>
                <SelectItem value="payment">{t("payments.payment")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>{t("common.date")}</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t("common.name")}</Label>
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{(parties.data ?? []).map((p: any) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>{t("payments.cashAccount")}</Label>
            <Select value={cashAccountId} onValueChange={setCashAccountId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(cashAccounts.data ?? []).map((a: any) => (<SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>{t("common.amount")}</Label><NumberInput value={amount} onChange={setAmount} /></div>
          <div className="space-y-1.5"><Label>{t("common.currency")}</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="YER">YER</SelectItem><SelectItem value="SAR">SAR</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>{t("payments.method")}</Label><Input value={method} onChange={(e) => setMethod(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t("payments.reference")}</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t("common.branch")}</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(branches.data ?? []).map((b: any) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label>{t("invoice.notes")}</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </CardContent>
      </Card>
    </>
  );
}