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
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/settings/branches")({ component: BranchesPage });

function BranchesPage() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", name_en: "" });

  const q = useQuery({ queryKey: ["branches-all"], queryFn: async () => (await supabase.from("branches").select("*").order("code")).data ?? [] });

  const create = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("branches").insert(form); if (error) throw error; },
    onSuccess: () => { toast.success(t("common.save")); setOpen(false); setForm({ code: "", name: "", name_en: "" }); qc.invalidateQueries({ queryKey: ["branches-all"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title={t("nav.branches")}
        actions={role === "admin" && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="me-1 h-4 w-4" />{t("common.new")}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("common.new")}</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1.5"><Label>{t("common.code")}</Label><Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>{t("common.name")} (AR)</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>{t("common.name")} (EN)</Label><Input value={form.name_en} onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))} /></div>
              </div>
              <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button><Button onClick={() => create.mutate()}>{t("common.save")}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="p-3 text-start">{t("common.code")}</th><th className="p-3 text-start">{t("common.name")}</th><th className="p-3 text-start">EN</th></tr>
            </thead>
            <tbody className="divide-y">
              {(q.data ?? []).map((b: any) => (<tr key={b.id}><td className="p-3 font-mono text-xs">{b.code}</td><td className="p-3">{b.name}</td><td className="p-3">{b.name_en}</td></tr>))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}