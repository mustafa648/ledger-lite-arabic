import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { setLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Languages } from "lucide-react";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === "string" ? { next: s.next } : {},
  component: AuthPage,
});

// Only allow same-origin relative paths as a post-login redirect target.
function safeNext(next?: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
}

function AuthPage() {
  const { t, i18n } = useTranslation();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const nextPath = safeNext(next);

  const goNext = () => {
    if (nextPath) {
      window.location.href = nextPath;
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) goNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session, navigate, nextPath]);

  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      toast.error(
        i18n.language === "ar" ? "بيانات الدخول غير صحيحة" : "Invalid email or password",
      );
      return;
    }
    goNext();
  };

  const signUp = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}${nextPath ?? "/dashboard"}`,
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(i18n.language === "ar" ? "تم إنشاء الحساب بنجاح" : "Account created");
    // Auto sign-in if email confirmation is disabled
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (!signInErr) goNext();
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}${nextPath ?? ""}` });
    if (r.error) toast.error(String((r.error as Error)?.message ?? r.error));
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-sidebar-primary text-lg font-bold text-sidebar-primary-foreground">
            س
          </div>
          <div className="text-lg font-semibold">{t("app.name")}</div>
        </div>
        <div className="space-y-4">
          <h2 className="text-3xl font-bold leading-tight">{t("app.tagline")}</h2>
          <p className="max-w-md text-sm leading-relaxed text-sidebar-foreground/70">
            {i18n.language === "ar"
              ? "قيد مزدوج، متعدد الفروع والعملات، تقارير مالية جاهزة وصلاحيات مستخدمين متكاملة."
              : "Double-entry, multi-branch, multi-currency, ready financial reports and full role-based access."}
          </p>
        </div>
        <div className="text-xs text-sidebar-foreground/50">© {new Date().getFullYear()}</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-end">
            <Button variant="ghost" size="sm" onClick={() => setLocale(i18n.language === "ar" ? "en" : "ar")}>
              <Languages className="me-1 h-4 w-4" />
              {i18n.language === "ar" ? "English" : "العربية"}
            </Button>
          </div>
          <Card>
            <Tabs defaultValue="signin">
              <CardHeader>
                <CardTitle>{t("app.name")}</CardTitle>
                <CardDescription>{t("auth.firstUserAdmin")}</CardDescription>
                <TabsList className="mt-2 grid grid-cols-2">
                  <TabsTrigger value="signin">{t("common.signIn")}</TabsTrigger>
                  <TabsTrigger value="signup">{t("common.signUp")}</TabsTrigger>
                </TabsList>
              </CardHeader>
              <CardContent className="space-y-4">
                <TabsContent value="signin" className="mt-0 space-y-4">
                  <div className="space-y-2">
                    <Label>{t("common.email")}</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("common.password")}</Label>
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button className="w-full" onClick={signIn} disabled={busy}>
                    {t("common.signIn")}
                  </Button>
                </TabsContent>
                <TabsContent value="signup" className="mt-0 space-y-4">
                  <div className="space-y-2">
                    <Label>{t("common.fullName")}</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("common.email")}</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("common.password")}</Label>
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button className="w-full" onClick={signUp} disabled={busy}>
                    {t("common.signUp")}
                  </Button>
                </TabsContent>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">{t("auth.orContinueWith")}</span>
                  </div>
                </div>
                <Button variant="outline" className="w-full" onClick={google}>
                  {t("auth.google")}
                </Button>
              </CardContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
}