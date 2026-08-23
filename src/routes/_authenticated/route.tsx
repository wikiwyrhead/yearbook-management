import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUser } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const res = await getCurrentUser();
      if (res?.user) {
        return { user: res.user };
      }
    } catch {
      // Ignore network errors
    }

    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});
