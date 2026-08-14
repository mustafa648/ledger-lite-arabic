import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  BookText,
  BookOpen,
  Users,
  ShoppingCart,
  ShoppingBag,
  Wallet,
  FileText,
  Settings,
  LogOut,
  Sun,
  Moon,
  Languages,
  Menu,
  Building2,
  Package,
  PackageSearch,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useOnline } from "@/hooks/use-online";
import { setLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("theme") === "dark" ? "dark" : "light";
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("theme", theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

function NavItem({
  to,
  icon: Icon,
  label,
  onClick,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = pathname === to || pathname.startsWith(to + "/");
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold">
          س
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{t("app.name")}</div>
          <div className="truncate text-xs text-sidebar-foreground/60">
            {i18n.language === "ar" ? "الإصدار 1.0" : "v1.0"}
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        <NavItem to="/dashboard" icon={LayoutDashboard} label={t("nav.dashboard")} onClick={onNavigate} />
        <NavItem to="/accounts" icon={BookText} label={t("nav.accounts")} onClick={onNavigate} />
        <NavItem to="/journal" icon={BookOpen} label={t("nav.journal")} onClick={onNavigate} />
        <NavItem to="/ledger" icon={BookOpen} label={t("nav.ledger")} onClick={onNavigate} />
        <NavItem to="/parties" icon={Users} label={t("nav.parties")} onClick={onNavigate} />
        <NavItem to="/sales" icon={ShoppingCart} label={t("nav.sales")} onClick={onNavigate} />
        <NavItem to="/purchases" icon={ShoppingBag} label={t("nav.purchases")} onClick={onNavigate} />
        <NavItem to="/payments" icon={Wallet} label={t("nav.payments")} onClick={onNavigate} />
        <div className="px-3 pb-1 pt-4 text-xs uppercase tracking-wider text-sidebar-foreground/50">
          {t("nav.inventory")}
        </div>
        <NavItem to="/items" icon={Package} label={t("nav.items")} onClick={onNavigate} />
        <NavItem to="/stock-movements" icon={PackageSearch} label={t("nav.stockMovements")} onClick={onNavigate} />
        <div className="px-3 pb-1 pt-4 text-xs uppercase tracking-wider text-sidebar-foreground/50">
          {t("nav.reports")}
        </div>
        <NavItem to="/reports/trial-balance" icon={FileText} label={t("nav.trialBalance")} onClick={onNavigate} />
        <NavItem to="/reports/general-ledger" icon={FileText} label={t("nav.generalLedger")} onClick={onNavigate} />
        <NavItem to="/reports/statements" icon={FileText} label={t("nav.statements")} onClick={onNavigate} />
        <div className="px-3 pb-1 pt-4 text-xs uppercase tracking-wider text-sidebar-foreground/50">
          {t("nav.settings")}
        </div>
        <NavItem to="/settings/branches" icon={Building2} label={t("nav.branches")} onClick={onNavigate} />
        <NavItem to="/settings/currencies" icon={Settings} label={t("nav.currencies")} onClick={onNavigate} />
        <NavItem to="/settings/users" icon={Users} label={t("nav.users")} onClick={onNavigate} />
        <NavItem to="/settings/audit" icon={FileText} label={t("nav.audit")} onClick={onNavigate} />
      </nav>
    </div>
  );
}

export default function AppLayout() {
  const { t, i18n } = useTranslation();
  const { theme, toggle } = useTheme();
  const { user, role } = useAuth();
  const { online, pending } = useOnline();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isRtl = i18n.language === "ar";

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside
          className={cn(
            "hidden w-64 shrink-0 border-sidebar-border lg:block",
            isRtl ? "border-l" : "border-r",
          )}
        >
          <div className="sticky top-0 h-screen">
            <SidebarNav />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur print:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side={isRtl ? "right" : "left"} className="w-72 p-0">
                <SidebarNav onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>

            <div className="flex-1" />

            {!online && (
              <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
                <WifiOff className="h-3.5 w-3.5" />
                {t("common.offline")}
              </span>
            )}
            {online && pending > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                {pending}
              </span>
            )}

            <Button variant="ghost" size="icon" onClick={toggle} title={t("common.theme")}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1">
                  <Languages className="h-4 w-4" />
                  <span className="text-xs">{i18n.language.toUpperCase()}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setLocale("ar")}>العربية</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocale("en")}>English</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <div className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                    {user?.email?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <span className="hidden max-w-[140px] truncate text-sm md:inline">{user?.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="truncate text-sm">{user?.email}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {role ? t(`roles.${role}`) : "—"}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="me-2 h-4 w-4" />
                  {t("common.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <main className="min-w-0 flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}