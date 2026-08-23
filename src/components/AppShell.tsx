import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LogOut, BookOpen, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { APP_NAME, APP_SUBTITLE } from "@/lib/constants/wording";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen grain bg-background text-foreground flex flex-col">
      {/* Skip to Main Content Link for WCAG 2.2 AA Keyboard Navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>

      <header role="banner" className="ink-panel sticky top-0 z-30 border-b border-white/10 shadow-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 sm:px-6">
          <Link
            to="/dashboard"
            aria-label={`${APP_NAME} Control Center Dashboard`}
            className="flex items-center gap-2 font-display text-base sm:text-lg tracking-tight text-white focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none rounded-md px-1 py-0.5 shrink-0"
          >
            <div className="size-7 rounded-md bg-accent/20 border border-accent/40 flex items-center justify-center text-accent shrink-0">
              <BookOpen className="size-3.5" />
            </div>
            <span>
              {APP_NAME}
              <span className="text-accent">.</span>
            </span>
            <span className="hidden sm:inline-block ml-1 text-[10px] font-sans uppercase tracking-widest text-white/60">
              {APP_SUBTITLE}
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {user?.email && (
              <div className="hidden md:flex items-center gap-1.5 text-xs text-white/80 max-w-[200px] truncate bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
                <User className="size-3 text-white/60 shrink-0" />
                <span className="truncate">{user.email}</span>
              </div>
            )}

            <Button
              size="sm"
              variant="ghost"
              aria-label="Sign out of Milestone Yearbook"
              className="min-h-[44px] min-w-[44px] text-white/80 hover:text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-accent rounded-lg p-2"
              onClick={() => void signOut()}
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline ml-1.5 text-xs font-medium">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-3 sm:px-6 py-6 sm:py-8 flex-1 w-full focus:outline-none">
        {children}
      </main>
    </div>
  );
}
