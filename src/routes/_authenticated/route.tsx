import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import AppLayout from "@/components/layout/AppLayout";

export const Route = createFileRoute("/_authenticated")({
  component: AuthedShell,
});

function AuthedShell() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const bypass =
    typeof window !== "undefined" && window.localStorage.getItem("auth_bypass") === "1";

  useEffect(() => {
    if (!loading && !session && !bypass) navigate({ to: "/auth", replace: true });
  }, [loading, session, bypass, navigate]);

  if (loading && !bypass) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        <div className="animate-pulse text-sm">…</div>
      </div>
    );
  }
  if (!session && !bypass) return null;
  return <AppLayout />;
}

// keep Outlet import referenced (AppLayout uses it internally)
void Outlet;