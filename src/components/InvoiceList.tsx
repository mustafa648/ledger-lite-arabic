import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMoney, formatDate } from "@/lib/format";
import { Plus } from "lucide-react";
import { useAuth, canWrite } from "@/hooks/use-auth";

export function InvoiceList({ kind }: { kind: "sales" | "purchases" }) {
  const { t, i18n } = useTranslation();
  const { role } = useAuth();
  const table = kind === "sales" ? "sales_invoices" : "purchase_invoices";
  const partyRel = kind === "sales" ? "customer:parties!sales_invoices_customer_id_fkey(name)" : "supplier:parties!purchase_invoices_supplier_id_fkey(name)";

  const q = useQuery({
    queryKey: [table],
    queryFn: async () => {
      const { data } = await supabase
        .from(table)
        .select(`id, invoice_no, invoice_date, total, currency_code, status, ${partyRel}`)
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  return (
    <>
      <PageHeader
        title={t(`${kind}.title`)}
        actions={
          canWrite(role) && (
            <Link to={kind === "sales" ? "/sales/new" : "/purchases/new"}>
              <Button><Plus className="me-1 h-4 w-4" />{t(`${kind}.newInvoice`)}</Button>
            </Link>
          )
        }
      />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-start">{t("invoice.invoiceNo")}</th>
                <th className="p-3 text-start">{t("common.date")}</th>
                <th className="p-3 text-start">{t(`${kind}.${kind === "sales" ? "customer" : "supplier"}`)}</th>
                <th className="p-3 text-end">{t("common.total")}</th>
                <th className="p-3 text-start">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(q.data ?? []).map((r: any) => (
                <tr key={r.id} className="hover:bg-accent/50">
                  <td className="p-3 font-mono text-xs">{r.invoice_no || "—"}</td>
                  <td className="p-3">{formatDate(r.invoice_date)}</td>
                  <td className="p-3">{r.customer?.name ?? r.supplier?.name ?? "—"}</td>
                  <td className="p-3 text-end">{formatMoney(r.total, r.currency_code, i18n.language)}</td>
                  <td className="p-3"><StatusBadge status={r.status} /></td>
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