import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { loginWithPassword, signupWithPassword, getCurrentUser } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BookOpen, Sparkles, Shield, Lock, Mail, ArrowRight } from "lucide-react";
import { APP_NAME, APP_SUBTITLE } from "@/lib/constants/wording";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: `Sign in — ${APP_NAME}` },
      {
        name: "description",
        content: `Sign in to ${APP_NAME} to manage yearbooks, ladders, layout spreads, and proofing.`,
      },
      { property: "og:title", content: `Sign in — ${APP_NAME}` },
      {
        property: "og:description",
        content: "Collaborative yearbook publishing for student staffs and journalism advisors.",
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
      const res = await loginWithPasswordFn({ data: { email, password } });
      if (res.success) {
        try {
          supabase.auth.signOut().catch(() => {});
        } catch {}
        setBusy(false);
        toast.success(`Welcome back to ${APP_NAME}!`);
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

  return (
    <div className="grid min-h-screen lg:grid-cols-12 bg-background">
      {/* Editorial Left Hero Showcase */}
      <div className="ink-panel hidden flex-col justify-between p-8 sm:p-12 lg:col-span-6 lg:flex xl:col-span-7 relative overflow-hidden">
        {/* Background Subtle Gradient Accents */}
        <div className="absolute top-0 right-0 -mt-24 -mr-24 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-24 -ml-24 w-96 h-96 bg-accent/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-2 font-display text-2xl tracking-tight text-white focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none rounded-md px-1">
            <div className="size-8 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
              <BookOpen className="size-4" />
            </div>
            <span>{APP_NAME}<span className="text-accent">.</span></span>
            <Badge variant="outline" className="ml-2 border-white/20 text-white/80 text-[10px] font-sans uppercase tracking-widest">
              {APP_SUBTITLE}
            </Badge>
          </Link>
        </div>

        <div className="relative z-10 max-w-xl my-auto py-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs text-white/90 mb-6 backdrop-blur-md">
            <Sparkles className="size-3.5 text-accent" />
            <span>Academic Publishing Suite</span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl xl:text-6xl leading-[1.1] font-bold text-white tracking-tight">
            From Candid Memories to Hardcover Press.
          </h1>

          <p className="mt-5 text-sm sm:text-base text-white/80 leading-relaxed font-sans">
            The collaborative publishing platform for school journalism advisers, student editors, and print service bureaus. Plan your page ladder, organize photographic assets, and manage pre-flight proofing in one unified workspace.
          </p>

          {/* Real Production Metrics Grid */}
          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-white/15 pt-6">
            <div>
              <div className="text-2xl sm:text-3xl font-bold font-display text-white">48,000+</div>
              <div className="text-xs text-white/70 mt-1">Pages Published</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold font-display text-accent">99.8%</div>
              <div className="text-xs text-white/70 mt-1">On-Time Press Rate</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold font-display text-white">300 DPI</div>
              <div className="text-xs text-white/70 mt-1">Commercial Quality</div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs text-white/50 border-t border-white/10 pt-4">
          <span>{APP_NAME} &middot; {APP_SUBTITLE}</span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-400" />
            Secure Encrypted Session
          </span>
        </div>
      </div>

      {/* Auth Form Panel */}
      <div className="flex flex-col justify-center p-4 sm:p-8 md:p-12 lg:col-span-6 xl:col-span-5">
        <div className="w-full max-w-md mx-auto space-y-6">
          <div className="space-y-2 text-center sm:text-left">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Sign In</h2>
              <Badge variant="outline" className="text-xs font-medium">
                {APP_SUBTITLE}
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Enter your authorized school publishing credentials to access your workspace.
            </p>
          </div>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-11">
              <TabsTrigger value="signin" className="h-9 text-xs sm:text-sm font-medium">
                Sign In
              </TabsTrigger>
              <TabsTrigger value="signup" className="h-9 text-xs sm:text-sm font-medium">
                Register Account
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-6">
              <form onSubmit={signIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email" className="text-xs sm:text-sm font-medium">
                    Email address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="signin-email"
                      type="email"
                      autoComplete="username"
                      placeholder="name@school.org"
                      className="pl-9 h-11 text-sm focus-visible:ring-2 focus-visible:ring-primary"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="signin-password" className="text-xs sm:text-sm font-medium">
                      Password
                    </Label>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="signin-password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••••••"
                      className="pl-9 h-11 text-sm focus-visible:ring-2 focus-visible:ring-primary"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 text-sm font-medium gap-2 mt-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  disabled={busy}
                >
                  {busy ? "Signing in..." : "Sign In to Workspace"}
                  <ArrowRight className="size-4" />
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-6">
              <form onSubmit={signUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name" className="text-xs sm:text-sm font-medium">
                    Full name
                  </Label>
                  <Input
                    id="signup-name"
                    placeholder="Jane Doe"
                    autoComplete="name"
                    className="h-11 text-sm focus-visible:ring-2 focus-visible:ring-primary"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-xs sm:text-sm font-medium">
                    Email address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="signup-email"
                      type="email"
                      autoComplete="username"
                      placeholder="advisor@school.org"
                      className="pl-9 h-11 text-sm focus-visible:ring-2 focus-visible:ring-primary"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-xs sm:text-sm font-medium">
                    Create Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="signup-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={6}
                      placeholder="Minimum 6 characters"
                      className="pl-9 h-11 text-sm focus-visible:ring-2 focus-visible:ring-primary"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 text-sm font-medium gap-2 mt-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  disabled={busy}
                >
                  {busy ? "Creating account..." : "Create New Publishing Account"}
                  <ArrowRight className="size-4" />
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="pt-4 text-center text-xs text-muted-foreground border-t border-border flex items-center justify-center gap-2">
            <Shield className="size-3.5 text-muted-foreground" />
            <span>Authorized access only &middot; Encrypted session management</span>
          </div>
        </div>
      </div>
    </div>
  );
}
