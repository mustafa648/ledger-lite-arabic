import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate } from "@/lib/format";
import { Plus } from "lucide-react";
import { useAuth, canWrite } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/journal/")({ component: JournalList });

function JournalList() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const q = useQuery({
    queryKey: ["journal-entries"],
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_entries")
        .select("id, entry_no, entry_date, description, status, currency_code")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  return (
    <>
      <PageHeader
        title={t("journal.title")}
        actions={
          canWrite(role) && (
            <Link to="/journal/new">
              <Button><Plus className="me-1 h-4 w-4" />{t("journal.newEntry")}</Button>
            </Link>
          )
        }
      />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-start">{t("journal.entryNo")}</th>
                <th className="p-3 text-start">{t("journal.entryDate")}</th>
                <th className="p-3 text-start">{t("common.description")}</th>
                <th className="p-3 text-start">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(q.data ?? []).map((e) => (
                <tr key={e.id} className="hover:bg-accent/50">
                  <td className="p-3 font-mono text-xs">
                    <Link to="/journal/$id" params={{ id: e.id }} className="text-primary hover:underline">
                      {e.entry_no ?? "—"}
                    </Link>
                  </td>
                  <td className="p-3">{formatDate(e.entry_date)}</td>
                  <td className="p-3 max-w-xs truncate">{e.description}</td>
                  <td className="p-3"><StatusBadge status={e.status} /></td>
                </tr>
              ))}
              {(q.data ?? []).length === 0 && !q.isLoading && (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">{t("common.noData")}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}