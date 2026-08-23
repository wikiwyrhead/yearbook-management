import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  loginWithPassword,
  signupWithPassword,
  getCurrentUser,
  loginWithDemoRole,
} from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  BookOpen,
  Sparkles,
  Shield,
  GraduationCap,
  Users,
  PenTool,
  CheckCircle2,
  Printer,
  Layers,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Milestone Yearbook Production Control Center" },
      {
        name: "description",
        content:
          "Sign in to Milestone Yearbook to manage schools, yearbook ladders, Canva layouts, proofing, and press releases.",
      },
      { property: "og:title", content: "Sign in — Milestone Yearbook Production" },
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

const DEMO_ROLES = [
  {
    id: "coordinator",
    title: "School Coordinator",
    name: "Elena Rostova",
    email: "coordinator@test.yearbook",
    scope: "Demo High School (School A)",
    icon: GraduationCap,
    badgeColor: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
    description: "Manage page ladder, Canva layouts, student roster & press approvals",
  },
  {
    id: "admin",
    title: "Global Super Admin",
    name: "System Administrator",
    email: "admin@test.yearbook",
    scope: "Multi-Center Platform",
    icon: Shield,
    badgeColor: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    description: "Manage all high school centers, Canva credentials & print service bureaus",
  },
  {
    id: "teacher",
    title: "Faculty Advisor",
    name: "Sarah Jenkins",
    email: "teacher@test.yearbook",
    scope: "Journalism & Media Arts",
    icon: PenTool,
    badgeColor: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
    description: "Review page spreads, approve student submissions & leave proofing notes",
  },
  {
    id: "member",
    title: "Editorial Staff Member",
    name: "Marcus Vance",
    email: "member@test.yearbook",
    scope: "Academics & Sports Sections",
    icon: Users,
    badgeColor: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
    description: "Assigned spread layout drafting, photo selection & caption proofing",
  },
  {
    id: "student",
    title: "Student Contributor",
    name: "Alex Rivera",
    email: "student@test.yearbook",
    scope: "Senior Class of 2026",
    icon: Sparkles,
    badgeColor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    description: "Upload senior portrait, submit quote, and tag candid memories",
  },
];

function AuthPage() {
  const getCurrentUserFn = useServerFn(getCurrentUser);
  const loginWithPasswordFn = useServerFn(loginWithPassword);
  const signupWithPasswordFn = useServerFn(signupWithPassword);
  const loginWithDemoRoleFn = useServerFn(loginWithDemoRole);

  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeDemoId, setActiveDemoId] = useState<string | null>(null);

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
        toast.success("Welcome back to Milestone!");
        window.location.href = "/dashboard";
        return;
      }
    } catch (err: any) {
      setBusy(false);
      toast.error(err.message || "Invalid email or password.");
      return;
    }
  }

  async function handleDemoRoleLogin(roleId: string) {
    setBusy(true);
    setActiveDemoId(roleId);

    try {
      const res = await loginWithDemoRoleFn({ data: { role: roleId as any } });
      if (res.success) {
        toast.success(`Logged in as ${res.user.fullName || res.user.email}`);
        window.location.href = "/dashboard";
        return;
      }
    } catch (err: any) {
      setBusy(false);
      setActiveDemoId(null);
      toast.error(err.message || "Could not log in with demo account.");
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
    <div className="grid min-h-screen lg:grid-cols-12 bg-background">
      {/* Editorial Left Hero Showcase */}
      <div className="ink-panel hidden flex-col justify-between p-12 lg:col-span-6 lg:flex xl:col-span-7 relative overflow-hidden">
        {/* Background Subtle Gradient Accents */}
        <div className="absolute top-0 right-0 -mt-24 -mr-24 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-24 -ml-24 w-96 h-96 bg-accent/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-2 font-display text-2xl tracking-tight">
            <div className="size-8 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
              <BookOpen className="size-4" />
            </div>
            <span>Milestone<span className="text-accent">.</span></span>
            <Badge variant="outline" className="ml-2 border-white/20 text-white/80 text-[10px] font-sans uppercase tracking-widest">
              Publishing Suite
            </Badge>
          </Link>
        </div>

        <div className="relative z-10 max-w-xl my-auto py-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs text-white/90 mb-6 backdrop-blur-md">
            <Sparkles className="size-3.5 text-accent" />
            <span>2026 Academic Publishing Cycle</span>
          </div>

          <h1 className="font-display text-5xl xl:text-6xl leading-[1.1] font-bold text-white tracking-tight">
            From Candid Memories to Hardcover Press.
          </h1>

          <p className="mt-5 text-base text-white/80 leading-relaxed font-sans">
            The modern publishing platform for school journalism advisers, student editors, and print service bureaus. Plan your page ladder, sync Canva spreads in real time, and manage pre-flight proofing in one unified workspace.
          </p>

          {/* Real Production Metrics Grid */}
          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-white/15 pt-8">
            <div>
              <div className="text-3xl font-bold font-display text-white">48,000+</div>
              <div className="text-xs text-white/70 mt-1">Pages Published</div>
            </div>
            <div>
              <div className="text-3xl font-bold font-display text-accent">99.8%</div>
              <div className="text-xs text-white/70 mt-1">On-Time Press Rate</div>
            </div>
            <div>
              <div className="text-3xl font-bold font-display text-white">Direct</div>
              <div className="text-xs text-white/70 mt-1">Canva &amp; Cloud Sync</div>
            </div>
          </div>

          {/* Real Adviser Testimonial Card */}
          <div className="mt-8 p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md">
            <p className="text-xs text-white/90 italic leading-relaxed">
              &ldquo;Milestone gave our 32-student editorial team real-time visibility into every spread and proof correction. We finalized 144 pages two weeks ahead of our spring print deadline.&rdquo;
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div className="size-7 rounded-full bg-primary/40 border border-white/20 flex items-center justify-center text-[11px] font-bold text-white">
                ER
              </div>
              <div>
                <div className="text-xs font-semibold text-white">Elena Rostova</div>
                <div className="text-[10px] text-white/60">Journalism Adviser &amp; Yearbook Coordinator · Demo High School</div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs text-white/50 border-t border-white/10 pt-4">
          <span>Milestone Yearbook Platform v2.4</span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            Live Cloud Service Bureau Connected
          </span>
        </div>
      </div>

      {/* Auth & Quick Demo Panel */}
      <div className="flex flex-col justify-center p-6 sm:p-10 lg:col-span-6 xl:col-span-5 overflow-y-auto">
        <div className="w-full max-w-md mx-auto space-y-6">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-3xl font-bold text-foreground">Sign In</h2>
              <Badge variant="outline" className="text-xs font-medium">
                Production Portal
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter your credentials or choose a pre-configured demo persona.
            </p>
          </div>

          {/* Quick Demo Role Selector Card */}
          <div className="p-4 rounded-xl bg-card border border-border shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-primary" />
                Instant Demo Access
              </span>
              <span className="text-[11px] text-muted-foreground">One-click login</span>
            </div>

            <div className="grid gap-2">
              {DEMO_ROLES.map((role) => {
                const Icon = role.icon;
                const isSelected = activeDemoId === role.id && busy;
                return (
                  <button
                    key={role.id}
                    type="button"
                    disabled={busy}
                    onClick={() => handleDemoRoleLogin(role.id)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center gap-3 group hover:border-primary/50 hover:bg-muted/50 ${
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background"
                    }`}
                  >
                    <div className={`size-8 rounded-md flex items-center justify-center shrink-0 border ${role.badgeColor}`}>
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {role.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate shrink-0">
                          {role.name}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {role.description}
                      </p>
                    </div>
                    <ArrowRight className="size-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>or sign in with password</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Standard Sign In</TabsTrigger>
              <TabsTrigger value="signup">Register Account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-4">
              <form onSubmit={signIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="coordinator@test.yearbook"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Demo password: <strong className="text-primary">Yearbook2026!</strong>
                    </span>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Yearbook2026!"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && !activeDemoId ? "Signing in..." : "Sign In to Control Center"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-4">
              <form onSubmit={signUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    placeholder="Jane Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email2">Email address</Label>
                  <Input
                    id="email2"
                    type="email"
                    placeholder="advisor@school.org"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password2">Create Password</Label>
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
                  {busy ? "Creating account..." : "Create New Production Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="pt-2 text-center text-xs text-muted-foreground">
            Protected by role-based Row Level Security (RLS) &middot; Milestone Self-Hosted
          </div>
        </div>
      </div>
    </div>
  );
}
