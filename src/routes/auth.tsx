import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loginWithPassword, signupWithPassword, getCurrentUser } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Milestone Yearbook Production" },
      {
        name: "description",
        content:
          "Sign in to Milestone Yearbook to manage schools, yearbook years, page ladders and production status.",
      },
      { property: "og:title", content: "Sign in — Milestone Yearbook Production" },
      {
        property: "og:description",
        content: "Access your yearbook production control center.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const getCurrentUserFn = useServerFn(getCurrentUser);
  const loginWithPasswordFn = useServerFn(loginWithPassword);
  const signupWithPasswordFn = useServerFn(signupWithPassword);

  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCurrentUserFn()
      .then((res) => {
        if (res?.user) {
          navigate({ to: "/dashboard" });
        }
      })
      .catch(() => {});
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    try {
      // 1. Primary: Local authentication server function
      const res = await loginWithPasswordFn({ data: { email, password } });

      if (res.success) {
        // Clear any old Supabase tokens in localStorage
        try {
          supabase.auth.signOut().catch(() => {});
        } catch {}
        setBusy(false);
        toast.success("Welcome back!");
        window.location.href = "/dashboard";
        return;
      }
    } catch (err: any) {
      setBusy(false);
      toast.error(err.message || "Invalid email or password.");
      return;
    }
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    try {
      // 1. Try local registration server function
      const res = await signupWithPasswordFn({ data: { email, password, fullName } });

      if (res.success) {
        setBusy(false);
        toast.success("Account created successfully!");
        window.location.href = "/dashboard";
        return;
      }
    } catch (err: any) {
      if (err.message && !err.message.includes("fallbackToSupabase")) {
        setBusy(false);
        toast.error(err.message || "Could not create account.");
        return;
      }
    }

    // 2. Supabase fallback
    const { getAppBaseUrl } = await import("@/lib/app-url");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${getAppBaseUrl()}/dashboard`,
        data: { full_name: fullName },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Account created. You can sign in now.");
  }

  async function google() {
    setBusy(true);
    const { getAppBaseUrl } = await import("@/lib/app-url");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${getAppBaseUrl()}/dashboard`,
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message || "Google sign-in failed.");
      return;
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="ink-panel hidden flex-col justify-between p-12 lg:flex">
        <Link to="/" className="font-display text-xl tracking-tight">
          Milestone<span className="text-accent">.</span>
        </Link>
        <div className="max-w-md">
          <h1 className="font-display text-5xl leading-tight">
            Every page, every deadline, one ladder.
          </h1>
          <p className="mt-4 text-sm opacity-75">
            Production control for school yearbooks — schools, years, teams, people and a live page
            ladder with statuses, assignments and requirement counters.
          </p>
        </div>
        <p className="text-xs opacity-50">Milestone LocalDev · Self-Contained Stack</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-3xl">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to your production control center.
          </p>

          <Tabs defaultValue="signin" className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={signIn} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  Sign in
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={signUp} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email2">Email</Label>
                  <Input
                    id="email2"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password2">Password</Label>
                  <Input
                    id="password2"
                    type="password"
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  Create account
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" className="w-full" onClick={google}>
            Continue with Google
          </Button>
        </div>
      </div>
    </div>
  );
}
