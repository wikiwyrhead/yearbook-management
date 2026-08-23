import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  Layers,
  ShieldCheck,
  Users,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Printer,
  FileCheck2,
  GraduationCap,
  PenTool,
  Shield,
  Eye,
  Camera,
  Quote,
  Clock,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Milestone Yearbook — Collaborative High School Publishing Platform" },
      {
        name: "description",
        content:
          "Collaborative yearbook production for school journalism advisers, student editors, and print service bureaus. Live page ladders, Canva Connect spreads, and pre-flight proofing.",
      },
      { property: "og:title", content: "Milestone Yearbook — Production Publishing Platform" },
      {
        property: "og:description",
        content: "Every page, every deadline, one unified yearbook production floor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const DEMO_PERSONAS = [
  {
    role: "School Coordinator",
    name: "Elena Rostova",
    email: "coordinator@test.yearbook",
    scope: "Demo High School (School A)",
    icon: GraduationCap,
    color: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
    desc: "Oversee 48-page ladder, assign spreads, manage Canva sync & approve print releases",
  },
  {
    role: "Global Super Admin",
    name: "System Administrator",
    email: "admin@test.yearbook",
    scope: "Multi-Center Operations",
    icon: Shield,
    color: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    desc: "Provision school centers, manage Canva credentials & configure service bureaus",
  },
  {
    role: "Faculty Advisor",
    name: "Sarah Jenkins",
    email: "teacher@test.yearbook",
    scope: "Journalism & Media Arts",
    icon: PenTool,
    color: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
    desc: "Review page spreads, leave proofing notes & verify photo quotas before press",
  },
  {
    role: "Editorial Staff Member",
    name: "Marcus Vance",
    email: "member@test.yearbook",
    scope: "Sports & Academics Sections",
    icon: Users,
    color: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
    desc: "Draft assigned Canva layouts, organize candids & write student captions",
  },
  {
    role: "Student Contributor",
    name: "Alex Rivera",
    email: "student@test.yearbook",
    scope: "Senior Class of 2026",
    icon: Sparkles,
    color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    desc: "Upload senior portrait, submit quote & preview printed yearbook page layout",
  },
];

function Landing() {
  const { user, loading } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
            <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <BookOpen className="size-4" />
            </div>
            <span>Milestone<span className="text-primary">.</span></span>
            <Badge variant="outline" className="ml-1.5 hidden sm:inline-flex text-[10px] uppercase tracking-wider">
              Publishing Platform
            </Badge>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#spreads" className="hover:text-foreground transition-colors">2-Page Spreads</a>
            <a href="#demo" className="hover:text-foreground transition-colors">Demo Personas</a>
            <a href="#manufacturing" className="hover:text-foreground transition-colors">Print Specs</a>
          </nav>

          <div className="flex items-center gap-3">
            <Button asChild size="sm" variant="outline" className="text-xs">
              <Link to="/auth">
                {loading ? "..." : user ? "Open Control Center" : "Sign In"}
              </Link>
            </Button>
            <Button asChild size="sm" className="text-xs gap-1">
              <Link to="/auth">
                Live Demo <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28">
        {/* Ambient Gradient Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-1/3 right-10 w-[400px] h-[250px] bg-accent/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="mx-auto max-w-5xl px-6 text-center relative z-10 space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" />
            <span>Academic Yearbook Publishing Reimagined &middot; 2026 Cycle</span>
          </div>

          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-foreground leading-[1.08]">
            From Candid Moments to <span className="text-primary">Hardcover Press.</span>
          </h1>

          <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            The modern collaborative publishing platform for high school journalism advisers, student editors, and commercial print bureaus. Plan your page ladder, sync Canva spreads in real time, and deliver press-ready books on schedule.
          </p>

          <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg" className="text-sm px-6 h-12 gap-2 shadow-sm">
              <Link to="/auth">
                Launch Production Control Center <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="text-sm px-6 h-12">
              <a href="#demo">
                Explore Demo Personas
              </a>
            </Button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="pt-10 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-border/80 text-left max-w-4xl mx-auto">
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="text-2xl font-bold font-display text-foreground">48,000+</div>
              <div className="text-xs text-muted-foreground mt-0.5">Pages Published</div>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="text-2xl font-bold font-display text-emerald-600 dark:text-emerald-400">99.8%</div>
              <div className="text-xs text-muted-foreground mt-0.5">On-Time Press Rate</div>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="text-2xl font-bold font-display text-foreground">Direct</div>
              <div className="text-xs text-muted-foreground mt-0.5">Canva Connect API</div>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="text-2xl font-bold font-display text-primary">Zero</div>
              <div className="text-xs text-muted-foreground mt-0.5">Vendor Lock-In</div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive 2-Page Spread Preview Section */}
      <section id="spreads" className="py-16 bg-muted/30 border-y border-border">
        <div className="mx-auto max-w-6xl px-6 space-y-8">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <Badge variant="outline" className="text-xs">Live Spread Engine</Badge>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground">
              Facing 2-Page Spreads in Real Time
            </h2>
            <p className="text-sm text-muted-foreground">
              Design facing pages side-by-side with gutter safe zones, photo quota trackers, and pre-flight approval badges.
            </p>
          </div>

          {/* Realistic Book Spread Mockup */}
          <div className="rounded-2xl border border-border bg-card shadow-lg overflow-hidden max-w-4xl mx-auto">
            {/* Spread Top Header Ribbon */}
            <div className="px-5 py-3 bg-indigo-500/10 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className="bg-indigo-600 text-white text-[10px]">Section: Athletics &amp; Games</Badge>
                <span className="font-bold text-sm text-indigo-950 dark:text-indigo-200">
                  Spread #7 &middot; Varsity Basketball Championship
                </span>
              </div>
              <Badge variant="outline" className="bg-background text-xs font-mono">
                Pages 14–15
              </Badge>
            </div>

            {/* Simulated 2-Page Open Book */}
            <div className="p-6 md:p-8 bg-muted/20 grid grid-cols-1 md:grid-cols-2 gap-4 relative">
              {/* Central Spine Fold Line */}
              <div className="hidden md:block absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 bg-border/80 shadow-xs pointer-events-none" />

              {/* Left Page (Page 14) */}
              <div className="p-5 rounded-xl bg-card border border-border shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <span className="size-7 rounded-md bg-muted font-display font-bold text-xs flex items-center justify-center">
                    14
                  </span>
                  <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="size-3 mr-1" /> Layout Approved
                  </Badge>
                </div>
                <div className="aspect-[4/3] rounded-lg bg-muted/60 border border-dashed border-border flex flex-col items-center justify-center p-4 text-center">
                  <Camera className="size-8 text-primary/40 mb-1" />
                  <span className="text-xs font-semibold text-foreground">Action Photo Slot: Championship Buzzer Beater</span>
                  <span className="text-[10px] text-muted-foreground">High-Res RAW &middot; 300 DPI Effective</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="font-bold text-foreground">Varsity Lions Clinch State Finals in Overtime</div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    With 4.2 seconds on the clock, senior captain Marcus Vance scored the game-winning three-pointer before a roaring home crowd...
                  </p>
                </div>
              </div>

              {/* Right Page (Page 15) */}
              <div className="p-5 rounded-xl bg-card border border-border shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <span className="size-7 rounded-md bg-muted font-display font-bold text-xs flex items-center justify-center">
                    15
                  </span>
                  <Badge variant="secondary" className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-300">
                    <Sparkles className="size-3 mr-1" /> Canva Connect Synced
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="aspect-square rounded-md bg-muted/60 border border-dashed border-border flex flex-col items-center justify-center p-2 text-center">
                    <Camera className="size-5 text-primary/40 mb-0.5" />
                    <span className="text-[10px] font-medium">Player Profiles</span>
                  </div>
                  <div className="aspect-square rounded-md bg-muted/60 border border-dashed border-border flex flex-col items-center justify-center p-2 text-center">
                    <Camera className="size-5 text-primary/40 mb-0.5" />
                    <span className="text-[10px] font-medium">Coach Interview</span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/40 border text-xs space-y-1">
                  <span className="font-semibold text-foreground block">Season Stats Box Score</span>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Overall Record: 24-2</span>
                    <span>League Title: 1st Place</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Spread Footer Bar */}
            <div className="px-5 py-3 bg-card border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Users className="size-3.5 text-primary" /> Assigned Editor: <strong>Marcus Vance</strong> (Editorial Staff)
              </span>
              <Button asChild size="sm" variant="ghost" className="text-xs h-7 text-primary hover:text-primary">
                <Link to="/auth">Open in Ladder Workspace &rarr;</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Core Platform Pillars */}
      <section id="features" className="py-20">
        <div className="mx-auto max-w-6xl px-6 space-y-12">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <Badge variant="outline" className="text-xs">End-to-End Publishing</Badge>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground">
              Everything Your Yearbook Staff Needs
            </h2>
            <p className="text-sm text-muted-foreground">
              Built from the ground up for high school publishing standards, collaborative design, and automated press compliance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-3">
              <div className="size-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Layers className="size-5" />
              </div>
              <h3 className="font-display font-bold text-lg text-foreground">Interactive Page Ladder</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Full 48–512 page volume planning. Organize sections, assign pages by range, track photo requirements, and manage editorial deadlines.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-3">
              <div className="size-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <PenTool className="size-5" />
              </div>
              <h3 className="font-display font-bold text-lg text-foreground">Canva Connect Studio</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Direct integration with Canva Connect API. Launch full-spread design workspaces with automatic return navigation and live thumbnail caching.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-3">
              <div className="size-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                <FileCheck2 className="size-5" />
              </div>
              <h3 className="font-display font-bold text-lg text-foreground">Pre-Flight Proofing Center</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Digital galley proofing with annotation pins, multi-stage adviser review, and resolution integrity checks before release.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-3">
              <div className="size-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <GraduationCap className="size-5" />
              </div>
              <h3 className="font-display font-bold text-lg text-foreground">Student Submission Portal</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Empower seniors to upload portraits, submit quotes, and view real-time live previews of their printed yearbook layout.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-3">
              <div className="size-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <Printer className="size-5" />
              </div>
              <h3 className="font-display font-bold text-lg text-foreground">Service Bureau Manufacturing</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Export ISO 12647-2 certified binary packages with SHA-256 integrity checksums for Milestone Press &amp; Precision Bindery.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-3">
              <div className="size-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400">
                <ShieldCheck className="size-5" />
              </div>
              <h3 className="font-display font-bold text-lg text-foreground">Database Row Level Security</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                PostgreSQL RLS ensures complete isolation between high schools, student roles, and faculty permissions at the data layer.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Instant Demo Personas & Credentials Section */}
      <section id="demo" className="py-16 bg-muted/40 border-t border-border">
        <div className="mx-auto max-w-6xl px-6 space-y-8">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <Badge variant="outline" className="text-xs">UAT &amp; Live Testing Matrix</Badge>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground">
              Instant Demo Access Personas
            </h2>
            <p className="text-sm text-muted-foreground">
              Test any yearbook production role instantly. Pre-configured accounts with standard password: <code className="px-2 py-0.5 rounded bg-background border font-mono font-bold text-primary">Yearbook2026!</code>
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {DEMO_PERSONAS.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.email} className="p-5 rounded-xl bg-card border border-border shadow-xs flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className={`size-9 rounded-lg flex items-center justify-center border ${p.color}`}>
                        <Icon className="size-4" />
                      </div>
                      <Badge variant="outline" className="text-[10px]">{p.scope}</Badge>
                    </div>
                    <div>
                      <h4 className="font-display font-bold text-base text-foreground">{p.role}</h4>
                      <div className="text-xs font-medium text-foreground">{p.name}</div>
                      <div className="text-[11px] font-mono text-muted-foreground mt-0.5">{p.email}</div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {p.desc}
                    </p>
                  </div>

                  <div className="pt-3 border-t flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Pass: <strong className="text-foreground">Yearbook2026!</strong>
                    </span>
                    <Button asChild size="sm" className="text-xs h-7 gap-1">
                      <Link to="/auth">
                        Sign In <ArrowRight className="size-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Manufacturing & Print Specs Blueprint */}
      <section id="manufacturing" className="py-16">
        <div className="mx-auto max-w-5xl px-6 space-y-8">
          <div className="p-8 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10 border border-border shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Printer className="size-4" /> Press Standards
                </span>
                <h3 className="font-display text-2xl md:text-3xl font-bold text-foreground mt-1">
                  Built for Commercial Print Bureaus
                </h3>
              </div>
              <Badge variant="outline" className="bg-background/80 text-xs font-mono shrink-0">
                ISO 12647-2 Certified
              </Badge>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              Every page generated in Milestone complies with commercial offset lithography requirements, ensuring zero unexpected trim cuts, color shifts, or missing font glyphs when your books hit the press floor.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-card border border-border">
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Trim &amp; Safe Margins</span>
                <span className="font-bold text-foreground mt-0.5 block">0.125 in (9 pt) Bleed</span>
              </div>
              <div className="p-3 rounded-lg bg-card border border-border">
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Image Resolution</span>
                <span className="font-bold text-foreground mt-0.5 block">&ge; 300 DPI Native</span>
              </div>
              <div className="p-3 rounded-lg bg-card border border-border">
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Color Space</span>
                <span className="font-bold text-foreground mt-0.5 block">CMYK Offset Profile</span>
              </div>
              <div className="p-3 rounded-lg bg-card border border-border">
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Binding Standard</span>
                <span className="font-bold text-foreground mt-0.5 block">Smythe-Sewn Casebound</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-border bg-card/50 py-10">
        <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-foreground text-sm">Milestone Yearbook</span>
            <span>&middot;</span>
            <span>Production Platform v2.4</span>
          </div>

          <div className="flex items-center gap-6">
            <Link to="/auth" className="hover:text-foreground transition-colors">Control Center</Link>
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#spreads" className="hover:text-foreground transition-colors">2-Page Spreads</a>
            <a href="#demo" className="hover:text-foreground transition-colors">Demo Credentials</a>
          </div>

          <div>
            Self-Hosted Stack &middot; Portable Node.js SSR &middot; Docker Ready
          </div>
        </div>
      </footer>
    </div>
  );
}
