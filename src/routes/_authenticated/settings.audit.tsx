import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings/audit")({ component: AuditPage });

function AuditPage() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["audit"], queryFn: async () => (await supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(200)).data ?? [] });
  return (
    <>
      <PageHeader title={t("nav.audit")} />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="p-3 text-start">Time</th><th className="p-3 text-start">Action</th><th className="p-3 text-start">Table</th></tr>
            </thead>
            <tbody className="divide-y">
              {(q.data ?? []).map((r: any) => (<tr key={r.id}><td className="p-3">{formatDate(r.at)}</td><td className="p-3">{r.action}</td><td className="p-3 font-mono text-xs">{r.table_name}</td></tr>))}
              {(q.data ?? []).length === 0 && (<tr><td colSpan={3} className="p-8 text-center text-muted-foreground">{t("common.noData")}</td></tr>)}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}