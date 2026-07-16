import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/settings/currencies")({ component: CurrenciesPage });

function CurrenciesPage() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["currencies"], queryFn: async () => (await supabase.from("currencies").select("*")).data ?? [] });
  return (
    <>
      <PageHeader title={t("nav.currencies")} />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="p-3 text-start">{t("common.code")}</th><th className="p-3 text-start">{t("common.name")}</th><th className="p-3 text-start">Symbol</th><th className="p-3"></th></tr>
            </thead>
            <tbody className="divide-y">
              {(q.data ?? []).map((c: any) => (<tr key={c.code}><td className="p-3 font-mono">{c.code}</td><td className="p-3">{c.name}</td><td className="p-3">{c.symbol}</td><td className="p-3">{c.is_base && <Badge>Base</Badge>}</td></tr>))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}