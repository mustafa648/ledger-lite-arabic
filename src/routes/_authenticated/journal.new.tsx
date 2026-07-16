import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/journal/new")({ component: NewJournal });

type Line = { account_id: string; debit: number; credit: number; description: string };

function NewJournal() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const accounts = useQuery({
    queryKey: ["accounts-flat"],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id, code, name, name_en, is_group").eq("is_active", true).order("code");
      return (data ?? []).filter((a: any) => !a.is_group);
    },
  });
  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await supabase.from("branches").select("id, name, code").eq("is_active", true)).data ?? [],
  });

  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [branchId, setBranchId] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([
    { account_id: "", debit: 0, credit: 0, description: "" },
    { account_id: "", debit: 0, credit: 0, description: "" },
  ]);

  useMemo(() => {
    if (!branchId && branches.data?.[0]) setBranchId(branches.data[0].id);
  }, [branches.data, branchId]);

  const totalD = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalC = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = totalD === totalC && totalD > 0;

  const save = useMutation({
    mutationFn: async (post: boolean) => {
      if (!branchId) throw new Error("Branch required");
      const { data: je, error } = await supabase
        .from("journal_entries")
        .insert({ branch_id: branchId, entry_date: entryDate, description })
        .select()
        .single();
      if (error) throw error;
      const rows = lines
        .filter((l) => l.account_id && (l.debit || l.credit))
        .map((l, i) => ({
          entry_id: je.id,
          account_id: l.account_id,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
          description: l.description,
          line_no: i + 1,
        }));
      const ins = await supabase.from("journal_lines").insert(rows);
      if (ins.error) throw ins.error;
      if (post) {
        const { error: pErr } = await supabase.rpc("post_journal_entry", { _entry_id: je.id });
        if (pErr) throw pErr;
      }
      return je.id as string;
    },
    onSuccess: (id) => {
      toast.success(t("common.save"));
      nav({ to: "/journal/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title={t("journal.newEntry")}
        actions={
          <>
            <Button variant="outline" onClick={() => save.mutate(false)} disabled={save.isPending}>
              {t("common.saveDraft")}
            </Button>
            <Button onClick={() => save.mutate(true)} disabled={!balanced || save.isPending}>
              {t("common.post")}
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t("journal.entryDate")}</Label>
              <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.branch")}</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(branches.data ?? []).map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label>{t("common.description")}</Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 text-start">{t("common.account")}</th>
                  <th className="p-2 text-start">{t("common.description")}</th>
                  <th className="p-2 text-end w-32">{t("common.debit")}</th>
                  <th className="p-2 text-end w-32">{t("common.credit")}</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">
                      <Select value={l.account_id} onValueChange={(v) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, account_id: v } : x)))}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {(accounts.data ?? []).map((a: any) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.code} — {i18n.language === "en" ? a.name_en || a.name : a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Input value={l.description} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                    </td>
                    <td className="p-2">
                      <Input type="number" step="0.01" className="text-end" value={l.debit || ""} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, debit: parseFloat(e.target.value) || 0, credit: 0 } : x)))} />
                    </td>
                    <td className="p-2">
                      <Input type="number" step="0.01" className="text-end" value={l.credit || ""} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, credit: parseFloat(e.target.value) || 0, debit: 0 } : x)))} />
                    </td>
                    <td className="p-2">
                      <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length <= 2}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium bg-muted/30">
                  <td colSpan={2} className="p-2 text-end">{t("common.total")}</td>
                  <td className="p-2 text-end">{formatMoney(totalD, "YER", i18n.language)}</td>
                  <td className="p-2 text-end">{formatMoney(totalC, "YER", i18n.language)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { account_id: "", debit: 0, credit: 0, description: "" }])}>
              <Plus className="me-1 h-4 w-4" />{t("journal.addLine")}
            </Button>
            <div className={balanced ? "text-sm text-success" : "text-sm text-destructive"}>
              {balanced ? t("journal.balanced") : `${t("journal.unbalanced")} (Δ ${formatMoney(totalD - totalC, "YER", i18n.language)})`}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}