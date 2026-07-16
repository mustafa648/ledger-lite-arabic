import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Wallet, TrendingUp, TrendingDown, Receipt } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; tone: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className={`grid h-10 w-10 place-items-center rounded-md ${tone}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs text-muted-foreground">{label}</div>
            <div className="mt-0.5 truncate text-lg font-bold">{value}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { t, i18n } = useTranslation();

  const kpis = useQuery({
    queryKey: ["dashboard-kpis"],
    queryFn: async () => {
      const start = new Date();
      start.setDate(1);
      const startStr = start.toISOString().slice(0, 10);
      const [sales, purchases, ar, ap] = await Promise.all([
        supabase.from("sales_invoices").select("total").eq("status", "posted").gte("invoice_date", startStr),
        supabase.from("purchase_invoices").select("total").eq("status", "posted").gte("invoice_date", startStr),
        supabase.from("sales_invoices").select("total,paid_amount").eq("status", "posted"),
        supabase.from("purchase_invoices").select("total,paid_amount").eq("status", "posted"),
      ]);
      return {
        sales: (sales.data ?? []).reduce((s, r) => s + Number(r.total || 0), 0),
        purchases: (purchases.data ?? []).reduce((s, r) => s + Number(r.total || 0), 0),
        receivables: (ar.data ?? []).reduce((s, r) => s + (Number(r.total || 0) - Number(r.paid_amount || 0)), 0),
        payables: (ap.data ?? []).reduce((s, r) => s + (Number(r.total || 0) - Number(r.paid_amount || 0)), 0),
      };
    },
  });

  const recent = useQuery({
    queryKey: ["recent-entries"],
    queryFn: async () => {
      const { data } = await supabase
        .from("journal_entries")
        .select("id, entry_no, entry_date, description, status")
        .order("created_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  const chart = useQuery({
    queryKey: ["monthly-chart"],
    queryFn: async () => {
      const months: { key: string; label: string; sales: number; purchases: number }[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
          key: d.toISOString().slice(0, 7),
          label: d.toLocaleDateString(i18n.language, { month: "short" }),
          sales: 0,
          purchases: 0,
        });
      }
      const from = months[0].key + "-01";
      const [s, p] = await Promise.all([
        supabase.from("sales_invoices").select("total,invoice_date").eq("status", "posted").gte("invoice_date", from),
        supabase.from("purchase_invoices").select("total,invoice_date").eq("status", "posted").gte("invoice_date", from),
      ]);
      (s.data ?? []).forEach((r) => {
        const k = String(r.invoice_date).slice(0, 7);
        const m = months.find((x) => x.key === k);
        if (m) m.sales += Number(r.total || 0);
      });
      (p.data ?? []).forEach((r) => {
        const k = String(r.invoice_date).slice(0, 7);
        const m = months.find((x) => x.key === k);
        if (m) m.purchases += Number(r.total || 0);
      });
      return months;
    },
  });

  const k = kpis.data;
  return (
    <>
      <PageHeader title={t("dashboard.title")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t("dashboard.salesThisMonth")} value={formatMoney(k?.sales ?? 0, "YER", i18n.language)} icon={TrendingUp} tone="bg-primary/10 text-primary" />
        <Kpi label={t("dashboard.purchasesThisMonth")} value={formatMoney(k?.purchases ?? 0, "YER", i18n.language)} icon={TrendingDown} tone="bg-warning/10 text-warning" />
        <Kpi label={t("dashboard.totalReceivables")} value={formatMoney(k?.receivables ?? 0, "YER", i18n.language)} icon={Receipt} tone="bg-success/10 text-success" />
        <Kpi label={t("dashboard.totalPayables")} value={formatMoney(k?.payables ?? 0, "YER", i18n.language)} icon={Wallet} tone="bg-destructive/10 text-destructive" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.monthlyOverview")}</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="sales" fill="hsl(var(--primary, 220 90% 55%))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="purchases" fill="hsl(var(--warning, 40 80% 55%))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("dashboard.recentEntries")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(recent.data ?? []).length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">{t("common.noData")}</div>
            )}
            {(recent.data ?? []).map((e) => (
              <Link
                key={e.id}
                to="/journal/$id"
                params={{ id: e.id }}
                className="flex items-center justify-between rounded-md border p-2 hover:bg-accent"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{e.entry_no ?? "—"}</div>
                  <div className="truncate text-xs text-muted-foreground">{formatDate(e.entry_date)}</div>
                </div>
                <StatusBadge status={e.status} />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}