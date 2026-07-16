import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canWrite } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, ChevronRight, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/accounts")({ component: AccountsPage });

type Acc = {
  id: string;
  code: string;
  name: string;
  name_en: string | null;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  parent_id: string | null;
  is_group: boolean;
  currency_code: string;
  is_active: boolean;
};

function Tree({ nodes, byParent, level = 0 }: { nodes: Acc[]; byParent: Map<string | null, Acc[]>; level?: number }) {
  const { i18n } = useTranslation();
  const [expanded, setExpanded] = useState<Set<string>>(new Set(nodes.map((n) => n.id)));
  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  return (
    <div className="divide-y">
      {nodes.map((n) => {
        const kids = byParent.get(n.id) ?? [];
        const open = expanded.has(n.id);
        return (
          <div key={n.id}>
            <div
              className="flex items-center gap-2 py-2 hover:bg-accent/50"
              style={{ paddingInlineStart: `${level * 20 + 8}px` }}
            >
              {kids.length > 0 ? (
                <button onClick={() => toggle(n.id)} className="rounded p-0.5 hover:bg-muted">
                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ) : (
                <div className="w-5" />
              )}
              <div className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{n.code}</div>
              <div className="min-w-0 flex-1 truncate text-sm font-medium">
                {i18n.language === "en" && n.name_en ? n.name_en : n.name}
              </div>
              {n.is_group && <Badge variant="secondary" className="text-[10px]">GROUP</Badge>}
              <Badge variant="outline" className="text-[10px]">{n.type}</Badge>
            </div>
            {open && kids.length > 0 && <Tree nodes={kids} byParent={byParent} level={level + 1} />}
          </div>
        );
      })}
    </div>
  );
}

function AccountsPage() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").order("code");
      if (error) throw error;
      return (data ?? []) as Acc[];
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    name_en: "",
    type: "asset" as Acc["type"],
    parent_id: "" as string,
    is_group: false,
    currency_code: "YER",
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("accounts").insert({
        code: form.code,
        name: form.name,
        name_en: form.name_en || null,
        type: form.type,
        parent_id: form.parent_id || null,
        is_group: form.is_group,
        currency_code: form.currency_code,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("common.save"));
      setOpen(false);
      setForm({ code: "", name: "", name_en: "", type: "asset", parent_id: "", is_group: false, currency_code: "YER" });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nodes = q.data ?? [];
  const byParent = new Map<string | null, Acc[]>();
  nodes.forEach((n) => {
    const arr = byParent.get(n.parent_id) ?? [];
    arr.push(n);
    byParent.set(n.parent_id, arr);
  });
  const roots = byParent.get(null) ?? [];

  return (
    <>
      <PageHeader
        title={t("accounts.title")}
        actions={
          canWrite(role) && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="me-1 h-4 w-4" />
                  {t("accounts.newAccount")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("accounts.newAccount")}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t("common.code")}</Label>
                    <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("common.type")}</Label>
                    <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as Acc["type"] }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="asset">{t("accounts.types.asset")}</SelectItem>
                        <SelectItem value="liability">{t("accounts.types.liability")}</SelectItem>
                        <SelectItem value="equity">{t("accounts.types.equity")}</SelectItem>
                        <SelectItem value="income">{t("accounts.types.income")}</SelectItem>
                        <SelectItem value="expense">{t("accounts.types.expense")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>{t("common.name")} (AR)</Label>
                    <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>{t("common.name")} (EN)</Label>
                    <Input value={form.name_en} onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>{t("accounts.parent")}</Label>
                    <Select value={form.parent_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, parent_id: v === "none" ? "" : v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {nodes.filter((n) => n.is_group).map((n) => (
                          <SelectItem key={n.id} value={n.id}>
                            {n.code} — {n.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
                    <Label>{t("accounts.isGroup")}</Label>
                    <Switch checked={form.is_group} onCheckedChange={(v) => setForm((f) => ({ ...f, is_group: v }))} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
                  <Button onClick={() => create.mutate()} disabled={create.isPending}>{t("common.save")}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        }
      />
      <Card>
        <CardContent className="p-0">
          {q.isLoading ? (
            <div className="p-8 text-center text-muted-foreground">{t("common.loading")}</div>
          ) : roots.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">{t("common.noData")}</div>
          ) : (
            <Tree nodes={roots} byParent={byParent} />
          )}
        </CardContent>
      </Card>
    </>
  );
}