import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMoney, formatDate } from "@/lib/format";
import { Plus } from "lucide-react";
import { useAuth, canWrite } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/payments/")({ component: PaymentsList });

function PaymentsList() {
  const { t, i18n } = useTranslation();
  const { role } = useAuth();
  const q = useQuery({
    queryKey: ["payments"],
    queryFn: async () => (await supabase.from("payments").select("id, payment_no, payment_date, direction, amount, currency_code, status, parties(name)").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  return (
    <>
      <PageHeader
        title={t("payments.title")}
        actions={canWrite(role) && (
          <Link to="/payments/new"><Button><Plus className="me-1 h-4 w-4" />{t("payments.newPayment")}</Button></Link>
        )}
      />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-start">#</th>
                <th className="p-3 text-start">{t("common.date")}</th>
                <th className="p-3 text-start">{t("payments.direction")}</th>
                <th className="p-3 text-start">{t("common.name")}</th>
                <th className="p-3 text-end">{t("common.amount")}</th>
                <th className="p-3 text-start">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(q.data ?? []).map((p: any) => (
                <tr key={p.id} className="hover:bg-accent/50">
                  <td className="p-3 font-mono text-xs">{p.payment_no ?? "—"}</td>
                  <td className="p-3">{formatDate(p.payment_date)}</td>
                  <td className="p-3"><Badge variant="outline">{t(`payments.${p.direction}`)}</Badge></td>
                  <td className="p-3">{p.parties?.name ?? "—"}</td>
                  <td className="p-3 text-end">{formatMoney(p.amount, p.currency_code, i18n.language)}</td>
                  <td className="p-3"><StatusBadge status={p.status} /></td>
                </tr>
              ))}
              {(q.data ?? []).length === 0 && !q.isLoading && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{t("common.noData")}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}