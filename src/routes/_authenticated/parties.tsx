import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth, canWrite } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/parties")({ component: PartiesPage });

function PartiesPage() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    type: "customer" as "customer" | "supplier" | "both",
    phone: "",
    email: "",
    tax_id: "",
    address: "",
    currency_code: "YER",
    opening_balance: 0,
  });

  const q = useQuery({
    queryKey: ["parties", search],
    queryFn: async () => {
      let query = supabase.from("parties").select("*").order("created_at", { ascending: false });
      if (search) query = query.ilike("name", `%${search}%`);
      return (await query).data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("parties").insert(form);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("common.save"));
      setOpen(false);
      setForm({ code: "", name: "", type: "customer", phone: "", email: "", tax_id: "", address: "", currency_code: "YER", opening_balance: 0 });
      qc.invalidateQueries({ queryKey: ["parties"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title={t("parties.title")}
        actions={
          canWrite(role) && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="me-1 h-4 w-4" />{t("parties.newParty")}</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>{t("parties.newParty")}</DialogTitle></DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label>{t("common.code")}</Label><Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>{t("common.type")}</Label>
                    <Select value={form.type} onValueChange={(v: any) => setForm((f) => ({ ...f, type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="customer">{t("parties.customer")}</SelectItem>
                        <SelectItem value="supplier">{t("parties.supplier")}</SelectItem>
                        <SelectItem value="both">{t("parties.both")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2"><Label>{t("common.name")}</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>{t("parties.phone")}</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>{t("common.email")}</Label><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>{t("parties.taxId")}</Label><Input value={form.tax_id} onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>{t("common.currency")}</Label>
                    <Select value={form.currency_code} onValueChange={(v) => setForm((f) => ({ ...f, currency_code: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="YER">YER</SelectItem><SelectItem value="SAR">SAR</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
                  <Button onClick={() => create.mutate()} disabled={create.isPending || !form.name}>{t("common.save")}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        }
      />

      <Card className="mb-4">
        <CardContent className="p-3">
          <div className="relative max-w-sm">
            <Search className="absolute inset-y-0 my-auto start-3 h-4 w-4 text-muted-foreground" />
            <Input className="ps-9" placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-start">{t("common.code")}</th>
                <th className="p-3 text-start">{t("common.name")}</th>
                <th className="p-3 text-start">{t("common.type")}</th>
                <th className="p-3 text-start">{t("parties.phone")}</th>
                <th className="p-3 text-start">{t("common.currency")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(q.data ?? []).map((p: any) => (
                <tr key={p.id} className="hover:bg-accent/50">
                  <td className="p-3 font-mono text-xs">{p.code || "—"}</td>
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3"><Badge variant="outline">{t(`parties.${p.type}`)}</Badge></td>
                  <td className="p-3">{p.phone || "—"}</td>
                  <td className="p-3">{p.currency_code}</td>
                </tr>
              ))}
              {(q.data ?? []).length === 0 && !q.isLoading && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">{t("common.noData")}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}