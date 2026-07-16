import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    posted: "bg-primary/10 text-primary border-primary/20",
    cancelled: "bg-destructive/10 text-destructive border-destructive/20",
    paid: "bg-success/10 text-success border-success/20",
  };
  return (
    <Badge variant="outline" className={cn("font-normal", map[status] ?? "")}>
      {t(`common.${status}`, status)}
    </Badge>
  );
}