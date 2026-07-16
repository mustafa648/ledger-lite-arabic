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

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        <div className="animate-pulse text-sm">…</div>
      </div>
    );
  }
  if (!session) return null;
  return <AppLayout />;
}

// keep Outlet import referenced (AppLayout uses it internally)
void Outlet;