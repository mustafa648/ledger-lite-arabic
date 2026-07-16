import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/settings/users")({ component: UsersPage });

function UsersPage() {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, created_at").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const rolesByUser = new Map<string, string[]>();
      (roles.data ?? []).forEach((r: any) => {
        const arr = rolesByUser.get(r.user_id) ?? [];
        arr.push(r.role);
        rolesByUser.set(r.user_id, arr);
      });
      return (profiles.data ?? []).map((p: any) => ({ ...p, roles: rolesByUser.get(p.id) ?? [] }));
    },
  });
  return (
    <>
      <PageHeader title={t("nav.users")} />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="p-3 text-start">{t("common.email")}</th><th className="p-3 text-start">{t("common.fullName")}</th><th className="p-3 text-start">Roles</th></tr>
            </thead>
            <tbody className="divide-y">
              {(q.data ?? []).map((u: any) => (
                <tr key={u.id}>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">{u.full_name}</td>
                  <td className="p-3">{u.roles.map((r: string) => (<Badge key={r} variant="outline" className="me-1">{t(`roles.${r}`)}</Badge>))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}