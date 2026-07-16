import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMoney, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { Printer, ArrowLeft } from "lucide-react";
import { printSection } from "@/lib/exports";

export const Route = createFileRoute("/_authenticated/journal/$id")({ component: JournalDetail });

function JournalDetail() {
  const { t, i18n } = useTranslation();
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["journal", id],
    queryFn: async () => {
      const [je, lines] = await Promise.all([
        supabase.from("journal_entries").select("*").eq("id", id).single(),
        supabase.from("journal_lines").select("*, accounts(code, name, name_en)").eq("entry_id", id).order("line_no"),
      ]);
      if (je.error) throw je.error;
      return { je: je.data, lines: lines.data ?? [] };
    },
  });

  const post = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("post_journal_entry", { _entry_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("common.post"));
      qc.invalidateQueries({ queryKey: ["journal", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <div className="p-8 text-muted-foreground">{t("common.loading")}</div>;
  if (!q.data) return null;
  const { je, lines } = q.data;
  const totalD = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
  const totalC = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);

  return (
    <>
      <PageHeader
        title={`${t("journal.entryNo")}: ${je.entry_no ?? "—"}`}
        description={formatDate(je.entry_date)}
        actions={
          <>
            <Link to="/journal"><Button variant="outline"><ArrowLeft className="me-1 h-4 w-4" />{t("common.back")}</Button></Link>
            <Button variant="outline" onClick={printSection}><Printer className="me-1 h-4 w-4" />{t("common.print")}</Button>
            {je.status === "draft" && (
              <Button onClick={() => post.mutate()} disabled={post.isPending}>{t("common.post")}</Button>
            )}
          </>
        }
      />
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div><div className="text-xs text-muted-foreground">{t("common.status")}</div><StatusBadge status={je.status} /></div>
            <div><div className="text-xs text-muted-foreground">{t("common.description")}</div><div>{je.description || "—"}</div></div>
            <div><div className="text-xs text-muted-foreground">{t("common.currency")}</div><div>{je.currency_code}</div></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2 text-start">{t("common.account")}</th>
                  <th className="p-2 text-start">{t("common.description")}</th>
                  <th className="p-2 text-end">{t("common.debit")}</th>
                  <th className="p-2 text-end">{t("common.credit")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((l: any) => (
                  <tr key={l.id}>
                    <td className="p-2">
                      <span className="font-mono text-xs text-muted-foreground me-2">{l.accounts?.code}</span>
                      {i18n.language === "en" ? l.accounts?.name_en || l.accounts?.name : l.accounts?.name}
                    </td>
                    <td className="p-2">{l.description}</td>
                    <td className="p-2 text-end">{Number(l.debit) > 0 ? formatMoney(l.debit, je.currency_code, i18n.language) : ""}</td>
                    <td className="p-2 text-end">{Number(l.credit) > 0 ? formatMoney(l.credit, je.currency_code, i18n.language) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium bg-muted/30">
                  <td colSpan={2} className="p-2 text-end">{t("common.total")}</td>
                  <td className="p-2 text-end">{formatMoney(totalD, je.currency_code, i18n.language)}</td>
                  <td className="p-2 text-end">{formatMoney(totalC, je.currency_code, i18n.language)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}