import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUser, logout } from "@/lib/auth.functions";

export interface AuthUser {
  id: string;
  email: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  roles?: string[];
}

export function useAuth() {
  const getCurrentUserFn = useServerFn(getCurrentUser);
  const logoutFn = useServerFn(logout);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUserFn()
      .then((res) => {
        if (res?.user) {
          setUser(res.user);
          setSession({ user: res.user });
        } else {
          setUser(null);
          setSession(null);
        }
      })
      .catch(() => {
        setUser(null);
        setSession(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const signOut = async () => {
    try {
      await logoutFn();
    } catch {}
    try {
      await supabase.auth.signOut();
    } catch {}
    try {
      localStorage.clear();
    } catch {}
    setUser(null);
    setSession(null);
    window.location.href = "/auth";
  };

  return { session, user, loading, signOut };
}
