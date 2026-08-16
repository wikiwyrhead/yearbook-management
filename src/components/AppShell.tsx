import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen grain">
      <header className="ink-panel sticky top-0 z-30">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link to="/dashboard" className="font-display text-lg tracking-tight">
            Milestone<span className="text-accent">.</span>
            <span className="ml-2 text-xs font-sans uppercase tracking-[0.2em] opacity-60">
              Production
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs opacity-70 sm:inline">{user?.email}</span>
            <Button
              size="sm"
              variant="ghost"
              className="text-ink-foreground hover:bg-white/10"
              onClick={() => void signOut()}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
