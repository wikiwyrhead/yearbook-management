import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  BookOpen,
  Sparkles,
  Shield,
  Layers,
  CheckCircle2,
  Printer,
  ArrowRight,
  Menu,
  ChevronRight,
  Palette,
  Users,
  Grid,
  FileCheck2,
  FolderSync,
} from "lucide-react";
import { APP_NAME, APP_SUBTITLE } from "@/lib/constants/wording";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${APP_NAME} — Production Publishing Platform` },
      {
        name: "description",
        content:
          "Collaborative yearbook publishing suite for school journalism advisors, editorial teams, and commercial print bureaus.",
      },
      { property: "og:title", content: `${APP_NAME} — Production Publishing Platform` },
      {
        property: "og:description",
        content:
          "Complete yearbook ladder management, real-time spread proofing, and pre-flight compliance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20">
      {/* Skip to Content for Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-md focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2 font-display text-xl font-bold tracking-tight focus-visible:ring-2 focus-visible:ring-primary rounded-md p-1"
          >
            <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <BookOpen className="size-4" />
            </div>
            <span>
              {APP_NAME}
              <span className="text-primary">.</span>
            </span>
            <Badge
              variant="outline"
              className="ml-1.5 hidden sm:inline-flex text-[10px] uppercase tracking-wider"
            >
              {APP_SUBTITLE}
            </Badge>
          </Link>

          {/* Desktop Navigation */}
          <nav aria-label="Desktop navigation" className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">
              Platform Features
            </a>
            <a href="#spreads" className="hover:text-foreground transition-colors">
              2-Page Spreads
            </a>
            <a href="#manufacturing" className="hover:text-foreground transition-colors">
              Press Standards
            </a>
          </nav>

          {/* Actions & Mobile Drawer */}
          <div className="flex items-center gap-2 sm:gap-3">
            {user ? (
              <Button asChild size="sm" className="min-h-[40px] text-xs font-semibold gap-1.5">
                <Link to="/dashboard">
                  Control Center <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm" className="min-h-[40px] text-xs font-semibold gap-1.5">
                <Link to="/auth">
                  Sign In <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            )}

            {/* Mobile Hamburger Sheet */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open mobile navigation menu"
                  className="min-h-[44px] min-w-[44px]"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px]">
                <SheetHeader>
                  <SheetTitle className="font-display text-left text-lg">
                    {APP_NAME}
                  </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-4 mt-6 text-sm font-medium">
                  <a
                    href="#features"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    Platform Features
                  </a>
                  <a
                    href="#spreads"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    2-Page Facing Spreads
                  </a>
                  <a
                    href="#manufacturing"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    Press Standards
                  </a>
                  <div className="pt-4 border-t border-border">
                    <Button asChild className="w-full min-h-[44px]" onClick={() => setMobileMenuOpen(false)}>
                      <Link to="/auth">Access Workspace</Link>
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {/* Hero Section */}
        <section className="relative py-16 sm:py-24 overflow-hidden border-b border-border">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl pointer-events-none -z-10" />

          <div className="mx-auto max-w-5xl px-4 sm:px-6 text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
              <Sparkles className="size-3.5" />
              <span>Next-Generation School Yearbook Publishing</span>
            </div>

            <h1 className="font-display text-4xl sm:text-6xl font-bold tracking-tight text-foreground max-w-4xl mx-auto leading-[1.15]">
              Publish Stunning Yearbooks with Uncompromising Speed &amp; Precision.
            </h1>

            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Designed specifically for high school journalism advisors, student editors, and commercial service bureaus. Manage your page ladder, organize photo assets, and review 300-DPI proofs seamlessly.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 pt-4">
              <Button asChild size="lg" className="min-h-[48px] px-6 text-sm font-semibold gap-2 shadow-md">
                <Link to="/auth">
                  Open Production Control Center <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* 6 Platform Pillars Section */}
        <section id="features" className="py-16 sm:py-24 bg-muted/30 border-b border-border">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-12">
            <div className="text-center space-y-3 max-w-2xl mx-auto">
              <Badge variant="outline" className="text-xs">Publishing Architecture</Badge>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground">
                Engineered for Editorial Workflows
              </h2>
              <p className="text-sm text-muted-foreground">
                Everything required to take your book from first portrait day to final press run.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-3">
                <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Grid className="size-5" />
                </div>
                <h3 className="font-display font-bold text-lg text-foreground">
                  48–144 Page Interactive Ladder
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Real-time color-coded sections, spread-level assignment tracking, and instant page reordering with automatic gutter calculation.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-3">
                <div className="size-10 rounded-xl bg-accent/20 text-accent flex items-center justify-center">
                  <FileCheck2 className="size-5" />
                </div>
                <h3 className="font-display font-bold text-lg text-foreground">
                  300-DPI Pre-Flight Proofing
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Drop precise correction pins directly on digital proofs. Track revisions, sign off on spreads, and lock pages for press.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-3">
                <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Shield className="size-5" />
                </div>
                <h3 className="font-display font-bold text-lg text-foreground">
                  Role-Scoped Security
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  PostgreSQL Row-Level Security ensures student contributors, staff members, and advisors operate safely within their appointed permissions.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-3">
                <div className="size-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <FolderSync className="size-5" />
                </div>
                <h3 className="font-display font-bold text-lg text-foreground">
                  Direct Cloud Storage Sync
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Connect Google Drive or Box storage to sync high-resolution candid photos and senior portrait archives directly into page slots.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-3">
                <div className="size-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Palette className="size-5" />
                </div>
                <h3 className="font-display font-bold text-lg text-foreground">
                  Design Studio Integration
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Launch authorized digital layout canvases with signed correlation states and automatic spread mapping.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-3">
                <div className="size-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Printer className="size-5" />
                </div>
                <h3 className="font-display font-bold text-lg text-foreground">
                  Commercial Press Packages
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Automated PDF assembly with 0.125-inch bleeds, safe-zone margins, and standardized press inspection reports.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 2-Page Facing Spread Interactive Preview Section */}
        <section id="spreads" className="py-16 sm:py-24 border-b border-border">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 space-y-8">
            <div className="text-center space-y-3 max-w-2xl mx-auto">
              <Badge variant="outline" className="text-xs">Offset Press Geometry</Badge>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground">
                2-Page Facing Spread Engine
              </h2>
              <p className="text-sm text-muted-foreground">
                Inspect double-page spreads with gutter compensation, bleed guidelines, and safety margins.
              </p>
            </div>

            {/* Spread Mockup Card (Responsive Stacking) */}
            <div className="p-4 sm:p-8 rounded-2xl bg-gradient-to-br from-card via-muted/30 to-card border border-border shadow-md">
              <div className="flex flex-col md:flex-row gap-4 items-stretch justify-center">
                {/* Left Page (Even) */}
                <div className="flex-1 p-6 rounded-xl bg-card border border-border/80 shadow-xs flex flex-col justify-between min-h-[260px] relative overflow-hidden">
                  <div className="absolute top-2 left-2 text-[10px] font-mono text-muted-foreground">
                    PAGE 14 &middot; LEFT SPREAD
                  </div>
                  <div className="my-auto text-center space-y-2 pt-4">
                    <Badge variant="secondary" className="text-[10px]">Athletics &amp; Spirit</Badge>
                    <h4 className="font-display text-lg sm:text-xl font-bold text-foreground">
                      Championship Season
                    </h4>
                    <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                      Varsity Basketball Tournament highlights &amp; court-side candid memories.
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t pt-2">
                    <span>Safe Zone: 0.50 in</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="size-3" /> Pre-Flight Approved
                    </span>
                  </div>
                </div>

                {/* Spine Center Fold */}
                <div className="hidden md:flex flex-col items-center justify-center px-1">
                  <div className="h-full w-px bg-border/80 border-dashed border-l" />
                </div>

                {/* Right Page (Odd) */}
                <div className="flex-1 p-6 rounded-xl bg-card border border-border/80 shadow-xs flex flex-col justify-between min-h-[260px] relative overflow-hidden">
                  <div className="absolute top-2 right-2 text-[10px] font-mono text-muted-foreground">
                    PAGE 15 &middot; RIGHT SPREAD
                  </div>
                  <div className="my-auto text-center space-y-2 pt-4">
                    <Badge variant="secondary" className="text-[10px]">Senior Roster</Badge>
                    <h4 className="font-display text-lg sm:text-xl font-bold text-foreground">
                      Player Spotlights
                    </h4>
                    <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                      Captains' quotes, regular season records, and coaching staff tributes.
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t pt-2">
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="size-3" /> Ready for Print
                    </span>
                    <span>Bleed: 0.125 in</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Manufacturing Standards Blueprint */}
        <section id="manufacturing" className="py-16 sm:py-24">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="p-6 sm:p-10 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-accent/10 border border-border shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <Printer className="size-4" /> Press Standards
                  </span>
                  <h3 className="font-display text-2xl sm:text-3xl font-bold text-foreground mt-1">
                    Commercial Manufacturing Specifications
                  </h3>
                </div>
                <Badge variant="outline" className="bg-background/80 text-xs font-mono shrink-0">
                  ISO 12647-2 Standard
                </Badge>
              </div>

              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Every page generated in {APP_NAME} complies with commercial offset lithography requirements, ensuring zero unexpected trim cutoffs, color shifts, or missing font glyphs on press.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-card border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Trim &amp; Safe Margins</span>
                  <span className="font-bold text-foreground mt-1 block">0.125 in (9 pt) Bleed</span>
                </div>
                <div className="p-3.5 rounded-xl bg-card border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Image Resolution</span>
                  <span className="font-bold text-foreground mt-1 block">&ge; 300 DPI Native</span>
                </div>
                <div className="p-3.5 rounded-xl bg-card border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Color Space</span>
                  <span className="font-bold text-foreground mt-1 block">CMYK Offset Profile</span>
                </div>
                <div className="p-3.5 rounded-xl bg-card border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Binding Standard</span>
                  <span className="font-bold text-foreground mt-1 block">Smythe-Sewn Casebound</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer role="contentinfo" className="mt-auto border-t border-border bg-card/50 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-foreground text-sm">{APP_NAME}</span>
            <span>&middot;</span>
            <span>{APP_SUBTITLE}</span>
          </div>

          <div className="flex items-center gap-6">
            <Link to="/auth" className="hover:text-foreground transition-colors">Sign In</Link>
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#spreads" className="hover:text-foreground transition-colors">2-Page Spreads</a>
            <a href="#manufacturing" className="hover:text-foreground transition-colors">Press Standards</a>
          </div>

          <div className="text-[11px]">
            Self-Hosted &middot; Portable Node.js SSR &middot; Docker Deployment
          </div>
        </div>
      </footer>
    </div>
  );
}
