import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Layers, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Milestone Yearbook — Production Software for School Yearbooks" },
      {
        name: "description",
        content:
          "Plan schools, yearbook years, people and the full page ladder in one place, with role-based access for coordinators, staff and proofreaders.",
      },
      { property: "og:title", content: "Milestone Yearbook — Yearbook Production Software" },
      {
        property: "og:description",
        content: "Schools, years, people and the page ladder — one production workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();

  return (
    <main className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-2xl">Milestone</span>
        <Button asChild variant="outline">
          <Link to={user ? "/dashboard" : "/auth"}>
            {loading ? "…" : user ? "Control center" : "Sign in"}
          </Link>
        </Button>
      </header>

      <section className="mx-auto max-w-4xl px-6 pb-16 pt-16 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-accent">Yearbook production</p>
        <h1 className="mt-4 font-display text-6xl leading-[1.05]">
          Every page, every person, on schedule.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          Milestone is the production floor for school yearbooks: schools and years, the people in
          them, and a page ladder your whole team can actually see.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild size="lg">
            <Link to={user ? "/dashboard" : "/auth"}>
              {user ? "Open control center" : "Get started"}
            </Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-24 sm:grid-cols-2">
        {[
          {
            icon: BookOpen,
            title: "Schools & years",
            body: "Each school holds many yearbook years, each with its own theme, deadline and team.",
          },
          {
            icon: Users,
            title: "People, imported fast",
            body: "Students, faculty and classes — add them one by one or paste a CSV roster.",
          },
          {
            icon: Layers,
            title: "The page ladder",
            body: "Sections, page types, statuses, asset counts and designer/proofreader assignments by range.",
          },
          {
            icon: ShieldCheck,
            title: "Roles enforced in the database",
            body: "Coordinator, staff, proofreader, corrector and student access is applied at the data layer.",
          },
        ].map((f) => (
          <div key={f.title} className="plate p-6">
            <f.icon className="size-5 text-accent" />
            <h2 className="mt-3 font-display text-2xl">{f.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
