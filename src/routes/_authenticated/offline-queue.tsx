import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { RefreshCw, Trash2, CloudUpload } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatDate } from "@/lib/format";
import { readQueue, removeQueued, retryQueued, syncQueue, type QueuedInvoice } from "@/lib/offline-queue";

export const Route = createFileRoute("/_authenticated/offline-queue")({
  head: () => ({
    meta: [
      { title: "العمليات المعلقة — نظام سَنَد المحاسبي" },
      { name: "description", content: "إدارة الفواتير والسندات المحفوظة دون اتصال، مع إعادة المحاولة أو الحذف." },
      { property: "og:title", content: "العمليات المعلقة — نظام سَنَد المحاسبي" },
      { property: "og:description", content: "إدارة الفواتير والسندات المحفوظة دون اتصال." },
    ],
  }),
  component: OfflineQueuePage,
});

function OfflineQueuePage() {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<QueuedInvoice[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => setRows(readQueue());

  useEffect(() => {
    refresh();
    window.addEventListener("sanad:queue-changed", refresh);
    return () => window.removeEventListener("sanad:queue-changed", refresh);
  }, []);

  const retry = async (id: string) => {
    setBusy(id);
    const r = await retryQueued(id);
    setBusy(null);
    refresh();
    if (r.ok) toast.success(t("offlineQueue.retrySuccess"));
    else toast.error(r.error ?? t("offlineQueue.retryFailed"));
  };

  const syncAll = async () => {
    setBusy("all");
    const n = await syncQueue();
    setBusy(null);
    refresh();
    toast.success(n > 0 ? t("common.offlineSynced") : t("offlineQueue.nothingSynced"));
  };

  const drop = (id: string) => {
    removeQueued(id);
    refresh();
    toast.success(t("offlineQueue.deleted"));
  };

  return (
    <>
      <PageHeader
        title={t("nav.offlineQueue")}
        actions={
          <Button onClick={syncAll} disabled={busy !== null || rows.length === 0}>
            <CloudUpload className="me-1 h-4 w-4" />
            {t("offlineQueue.syncAll")}
          </Button>
        }
      />
      <p className="mb-4 text-sm text-muted-foreground">{t("offlineQueue.hint")}</p>

      <div className="space-y-3">
        {rows.map((r) => (
          <Card key={r.id}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {r.kind === "sales" ? t("sales.newInvoice") : t("purchases.newInvoice")}
                  </span>
                  <Badge variant={r.status === "conflict" ? "destructive" : r.status === "failed" ? "secondary" : "outline"}>
                    {t(`offlineQueue.status.${r.status}`)}
                  </Badge>
                  {r.post && <Badge variant="outline">{t("common.post")}</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatDate(r.createdAt)} ·{" "}
                  {formatMoney(Number(r.invoice.total ?? 0), String(r.invoice.currency_code ?? "YER"), i18n.language)}
                  {" · "}
                  {t("offlineQueue.attempts", { count: r.attempts })}
                </div>
                {r.lastError && (
                  <div className="break-words text-xs text-destructive">{r.lastError}</div>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => retry(r.id)} disabled={busy !== null}>
                  <RefreshCw className={`me-1 h-4 w-4 ${busy === r.id ? "animate-spin" : ""}`} />
                  {t("offlineQueue.retry")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => drop(r.id)} disabled={busy !== null}>
                  <Trash2 className="me-1 h-4 w-4 text-destructive" />
                  {t("common.delete")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {rows.length === 0 && (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              {t("offlineQueue.empty")}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
