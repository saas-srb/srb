"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePanels } from "@/components/platform/PanelsProvider";
import { ROLE_GROUPS } from "@/lib/products/commandos/role-catalog";
import { PERMISSION_GROUPS } from "@/lib/products/commandos/permission-catalog";
import { PERMISSION_MODULE_PANEL, type CustomRoleView } from "@/lib/products/commandos/custom-roles-shared";
import { createCustomRoleAction, updateCustomRoleAction } from "./actions";

type RuleState = "default" | "allow" | "deny";
const RULE_ITEMS = { default: "Role default", allow: "Always allow", deny: "Always deny" };

export default function RoleBuilderSheet({ open, onOpenChange, role, duplicate }: { open: boolean; onOpenChange: (o: boolean) => void; role: CustomRoleView | null; duplicate: boolean }) {
  const panels = usePanels();
  const editing = role !== null && !duplicate;
  const [name, setName] = useState(role ? (duplicate ? `${role.name} (copy)` : role.name) : "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [baseRoles, setBaseRoles] = useState<string[]>(role?.baseRoles ?? []);
  const [rules, setRules] = useState<Record<string, RuleState>>(() => {
    const init: Record<string, RuleState> = {};
    for (const [k, v] of Object.entries(role?.permissions ?? {})) init[k] = v ? "allow" : "deny";
    return init;
  });
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();

  const toggleRole = (v: string) => setBaseRoles((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));
  const openPanels = useMemo(() => new Set(ROLE_GROUPS.filter((g) => g.roles.some((r) => baseRoles.includes(r.value))).map((g) => g.panel)), [baseRoles]);
  const ruleCount = Object.values(rules).filter((v) => v !== "default").length;

  const q = search.trim().toLowerCase();
  const permissionGroups = PERMISSION_GROUPS.map((g) => ({ ...g, permissions: g.permissions.filter((p) => !q || p.label.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || g.module.toLowerCase().includes(q)) })).filter((g) => g.permissions.length > 0);
  const roleGroups = ROLE_GROUPS.map((g) => ({ ...g, roles: g.roles.filter((r) => !q || r.label.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || g.module.toLowerCase().includes(q)) })).filter((g) => g.roles.length > 0);

  function save() {
    const permissions: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(rules)) if (v === "allow") permissions[k] = true; else if (v === "deny") permissions[k] = false;
    startTransition(async () => {
      const input = { name, description, baseRoles, permissions };
      const res = editing && role ? await updateCustomRoleAction(role.id, input) : await createCustomRoleAction(input);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(editing ? "Role updated — everyone holding it has the new access." : "Role created.");
      onOpenChange(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border bg-muted/20 p-5">
          <SheetTitle>{editing ? `Edit “${role?.name}”` : duplicate ? "Duplicate role" : "New custom role"}</SheetTitle>
          <SheetDescription>
            {editing && role && role.userCount > 0 ? `${role.userCount} ${role.userCount === 1 ? "person holds" : "people hold"} this role — saving changes their access immediately.` : "Pick the products this role opens, then fine-tune individual permissions."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="space-y-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Role name, e.g. Sales lead" maxLength={40} />
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this role for? (optional)" rows={2} maxLength={300} />
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products, roles and permissions…" className="h-8 pl-8 text-xs" />
          </div>

          <Tabs defaultValue="panels">
            <TabsList className="w-full">
              <TabsTrigger value="panels" className="flex-1">Products &amp; roles <Badge variant="secondary" className="ml-1 text-[10px]">{baseRoles.length}</Badge></TabsTrigger>
              <TabsTrigger value="perms" className="flex-1">Permissions <Badge variant="secondary" className="ml-1 text-[10px]">{ruleCount}</Badge></TabsTrigger>
            </TabsList>

            <TabsContent value="panels" className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">Each role below is what the product itself offers: it opens the product and sets the default level of access. At least one is required.</p>
              {roleGroups.map((g) => (
                <div key={g.panel} className="space-y-2 rounded-xl border border-border/70 bg-card p-3">
                  <p className="border-b border-border/40 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{panels[g.panel]?.name ?? g.module}</p>
                  {g.roles.map((r) => (
                    <label key={r.value} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 ${baseRoles.includes(r.value) ? "border-primary/40 bg-primary/5" : "border-border/50 hover:bg-muted/30"}`}>
                      <Checkbox checked={baseRoles.includes(r.value)} onCheckedChange={() => toggleRole(r.value)} className="mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{r.label}</p>
                        <p className="text-[11px] leading-snug text-muted-foreground">{r.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              ))}
            </TabsContent>

            <TabsContent value="perms" className="mt-3 space-y-4">
              <p className="text-xs text-muted-foreground">Allow or deny single capabilities on top of the roles above. “Always deny” wins even when another role of the same person allows it. A permission only matters in products the role opens (highlighted).</p>
              {permissionGroups.map((g) => {
                const relevant = openPanels.has(PERMISSION_MODULE_PANEL[g.module] ?? "");
                return (
                  <div key={g.module}>
                    <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.module}{relevant && <Badge variant="outline" className="text-[9px] text-primary">in this role</Badge>}</p>
                    <div className="space-y-1.5">
                      {g.permissions.map((p) => (
                        <div key={p.key} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-2.5">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{p.label}</p>
                            <p className="text-xs text-muted-foreground">{p.description}</p>
                          </div>
                          <Select items={RULE_ITEMS} value={rules[p.key] ?? "default"} onValueChange={(v: string | null) => v && setRules((prev) => ({ ...prev, [p.key]: v as RuleState }))}>
                            <SelectTrigger size="sm" className="w-32 shrink-0"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">Role default</SelectItem>
                              <SelectItem value="allow">Always allow</SelectItem>
                              <SelectItem value="deny">Always deny</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </TabsContent>
          </Tabs>
        </div>

        <SheetFooter className="flex flex-row items-center justify-between border-t border-border bg-card p-4">
          <Button type="button" variant="outline" className="h-8 text-xs" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button type="button" className="h-8 text-xs" onClick={save} disabled={pending || name.trim().length < 2 || baseRoles.length === 0}>{pending ? "Saving…" : editing ? "Save changes" : "Create role"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
