import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { getPeople, savePerson, deletePerson, importPeople } from "@/lib/yearbook.functions";

type Kind = "students" | "faculty" | "classes";

const FIELDS: Record<Kind, { key: string; label: string; type?: string }[]> = {
  students: [
    { key: "first_name", label: "First name" },
    { key: "middle_name", label: "Middle name" },
    { key: "last_name", label: "Last name" },
    { key: "preferred_name", label: "Preferred name" },
    { key: "suffix", label: "Suffix" },
    { key: "grade", label: "Grade" },
    { key: "student_number", label: "Student ID" },
    { key: "email", label: "Email", type: "email" },
  ],
  faculty: [
    { key: "first_name", label: "First name" },
    { key: "middle_name", label: "Middle name" },
    { key: "last_name", label: "Last name" },
    { key: "preferred_name", label: "Preferred name" },
    { key: "suffix", label: "Suffix" },
    { key: "title", label: "Title" },
    { key: "department", label: "Department" },
    { key: "email", label: "Email", type: "email" },
  ],
  classes: [
    { key: "name", label: "Class / homeroom name" },
    { key: "grade", label: "Grade" },
    { key: "teacher_name", label: "Teacher" },
    { key: "room", label: "Room" },
  ],
};

export function PeopleTab({ yearbookId, canEdit }: { yearbookId: string; canEdit: boolean }) {
  const fetchPeople = useServerFn(getPeople);
  const qc = useQueryClient();
  const key = ["people", yearbookId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => fetchPeople({ data: { yearbookId } }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  return (
    <Tabs defaultValue="students">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="students">Students ({data?.students.length ?? 0})</TabsTrigger>
          <TabsTrigger value="faculty">Faculty ({data?.faculty.length ?? 0})</TabsTrigger>
          <TabsTrigger value="classes">Classes ({data?.classes.length ?? 0})</TabsTrigger>
        </TabsList>
        {canEdit && <ImportDialog yearbookId={yearbookId} onDone={refresh} />}
      </div>

      {(["students", "faculty", "classes"] as Kind[]).map((kind) => (
        <TabsContent key={kind} value={kind} className="mt-4">
          {canEdit && <PersonDialog kind={kind} yearbookId={yearbookId} onDone={refresh} />}
          <div className="plate mt-3 divide-y">
            {(data?.[kind] ?? []).map((row: Record<string, unknown>) => (
              <div key={String(row["id"])} className="flex items-center gap-3 p-3">
                <div className="flex-1">
                  <p className="font-medium">
                    {kind === "classes"
                      ? String(row["name"] ?? "")
                      : `${row["preferred_name"] || row["first_name"]} ${row["last_name"]}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      row["grade"] && `Grade ${row["grade"]}`,
                      row["title"],
                      row["department"],
                      row["teacher_name"],
                      row["email"],
                      row["student_number"],
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>
                {canEdit && (
                  <>
                    <PersonDialog
                      kind={kind}
                      yearbookId={yearbookId}
                      onDone={refresh}
                      existing={row}
                    />
                    <DeleteButton kind={kind} id={String(row["id"])} onDone={refresh} />
                  </>
                )}
              </div>
            ))}
            {(data?.[kind]?.length ?? 0) === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Nothing here yet. Add one or import a CSV.
              </p>
            )}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}

function DeleteButton({ kind, id, onDone }: { kind: Kind; id: string; onDone: () => void }) {
  const del = useServerFn(deletePerson);
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={() =>
        del({ data: { table: kind, id } })
          .then(onDone)
          .catch((e: Error) => toast.error(e.message))
      }
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

function PersonDialog({
  kind,
  yearbookId,
  onDone,
  existing,
}: {
  kind: Kind;
  yearbookId: string;
  onDone: () => void;
  existing?: Record<string, unknown>;
}) {
  const save = useServerFn(savePerson);
  const [open, setOpen] = useState(false);
  const label = kind === "classes" ? "class" : kind === "faculty" ? "faculty member" : "student";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {existing ? (
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Plus className="size-4" /> Add {label}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit" : "New"} {label}
          </DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const values: Record<string, unknown> = {};
            FIELDS[kind].forEach((f) => {
              values[f.key] = String(fd.get(f.key) || "") || null;
            });
            save({
              data: {
                table: kind,
                yearbookId,
                values: values as never,
                ...(existing ? { id: String(existing["id"]) } : {}),
              },
            })
              .then(() => {
                setOpen(false);
                onDone();
              })
              .catch((err: Error) => toast.error(err.message));
          }}
        >
          {FIELDS[kind].map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`${kind}-${f.key}`}>{f.label}</Label>
              <Input
                id={`${kind}-${f.key}`}
                name={f.key}
                type={f.type ?? "text"}
                defaultValue={String(existing?.[f.key] ?? "")}
                required={f.key === "first_name" || f.key === "last_name" || f.key === "name"}
              />
            </div>
          ))}
          <DialogFooter className="sm:col-span-2">
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ yearbookId, onDone }: { yearbookId: string; onDone: () => void }) {
  const imp = useServerFn(importPeople);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"students" | "faculty">("students");
  const [csv, setCsv] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4" /> Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import people from CSV</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Tabs value={kind} onValueChange={(v) => setKind(v as "students" | "faculty")}>
            <TabsList>
              <TabsTrigger value="students">Students</TabsTrigger>
              <TabsTrigger value="faculty">Faculty</TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="text-xs text-muted-foreground">
            First row must be a header. Recognised columns:{" "}
            {kind === "students"
              ? "student_number, first_name, middle_name, last_name, preferred_name, suffix, grade, email"
              : "first_name, middle_name, last_name, preferred_name, suffix, title, department, email"}
          </p>
          <Textarea
            rows={10}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={"first_name,last_name,grade\nAva,Nguyen,11"}
          />
        </div>
        <DialogFooter>
          <Button
            onClick={() =>
              imp({ data: { yearbookId, kind, csv } })
                .then((r) => {
                  toast.success(`Imported ${r.inserted}, skipped ${r.skipped}`);
                  setCsv("");
                  setOpen(false);
                  onDone();
                })
                .catch((e: Error) => toast.error(e.message))
            }
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
