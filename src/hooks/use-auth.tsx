import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "accountant" | "manager" | "viewer";

interface AuthState {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  loading: boolean;
}

const Ctx = createContext<AuthState>({ session: null, user: null, role: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, user: null, role: null, loading: true });

  useEffect(() => {
    let mounted = true;
    const order: AppRole[] = ["admin", "accountant", "manager", "viewer"];

    const loadRole = async (userId: string): Promise<AppRole | null> => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (!data || data.length === 0) return null;
      const roles = data.map((r) => r.role as AppRole);
      for (const o of order) if (roles.includes(o)) return o;
      return roles[0];
    };

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      const role = session?.user ? await loadRole(session.user.id) : null;
      setState({ session, user: session?.user ?? null, role, loading: false });
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED", "INITIAL_SESSION"].includes(event)) {
        const role = session?.user ? await loadRole(session.user.id) : null;
        setState({ session, user: session?.user ?? null, role, loading: false });
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}

export function canWrite(role: AppRole | null) {
  return role === "admin" || role === "accountant";
}