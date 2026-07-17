import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/stock-movements")({ component: StockMovementsPage });

function StockMovementsPage() {
  const { t, i18n } = useTranslation();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [itemId, setItemId] = useState<string>("all");

  const items = useQuery({
    queryKey: ["items-list"],
    queryFn: async () => (await supabase.from("items").select("id, sku, name").order("sku")).data ?? [],
  });

  const movements = useQuery({
    queryKey: ["stock-movements", from, to, itemId],
    queryFn: async () => {
      let q = supabase
        .from("stock_movements")
        .select("*, items(sku, name, name_en), journal_entries(entry_no)")
        .order("movement_date", { ascending: false })
        .limit(500);
      if (from) q = q.gte("movement_date", from);
      if (to) q = q.lte("movement_date", to);
      if (itemId !== "all") q = q.eq("item_id", itemId);
      return (await q).data ?? [];
    },
  });

  return (
    <>
      <PageHeader title={t("items.stockMovements")} />
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t("common.from")}</div>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t("common.to")}</div>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="min-w-48">
            <div className="text-xs text-muted-foreground mb-1">{t("items.item")}</div>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                {(items.data ?? []).map((i: any) => (<SelectItem key={i.id} value={i.id}>{i.sku} — {i.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 text-start">{t("common.date")}</th>
                <th className="p-2 text-start">{t("items.item")}</th>
                <th className="p-2 text-start">{t("items.direction")}</th>
                <th className="p-2 text-end">{t("invoice.qty")}</th>
                <th className="p-2 text-end">{t("items.averageCost")}</th>
                <th className="p-2 text-end">{t("common.total")}</th>
                <th className="p-2 text-start">{t("journal.entryNo")}</th>
              </tr>
            </thead>
            <tbody>
              {(movements.data ?? []).map((m: any) => (
                <tr key={m.id} className="border-b">
                  <td className="p-2">{m.movement_date}</td>
                  <td className="p-2">{m.items?.sku} — {i18n.language === "en" ? m.items?.name_en || m.items?.name : m.items?.name}</td>
                  <td className="p-2">{t(`items.${m.direction}`)}</td>
                  <td className="p-2 text-end">{Number(m.qty).toLocaleString()}</td>
                  <td className="p-2 text-end">{formatMoney(m.unit_cost, "YER", i18n.language)}</td>
                  <td className="p-2 text-end">{formatMoney(m.total_cost, "YER", i18n.language)}</td>
                  <td className="p-2 font-mono text-xs">{m.journal_entries?.entry_no ?? "—"}</td>
                </tr>
              ))}
              {(movements.data ?? []).length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">{t("common.noData")}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}