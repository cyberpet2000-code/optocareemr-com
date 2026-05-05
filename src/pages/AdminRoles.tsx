import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShieldCheck, Plus, Trash2, Search } from "lucide-react";
import { useRole, type AppRole } from "@/hooks/useRole";
import { useAuth } from "@/hooks/useAuth";
import { logSuperAdminAction } from "@/lib/superAdminAudit";

const ROLES: AppRole[] = ["admin", "doctor", "receptionist"];

export default function AdminRoles({ embedded = false }: { embedded?: boolean }) {
  const { isAdmin } = useRole();
  const { user } = useAuth();
  const [users, setUsers] = useState<{ id: string; full_name: string | null; roles: AppRole[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState<AppRole>("doctor");

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    const [{ data: profiles }, { data: roleData }] = await Promise.all([
      supabase.from("profiles").select("id, full_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const roleMap = new Map<string, AppRole[]>();
    (roleData || []).forEach((r: any) => {
      const arr = roleMap.get(r.user_id) || [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });
    setUsers((profiles || []).map((p: any) => ({ id: p.id, full_name: p.full_name, roles: roleMap.get(p.id) || [] })));
    setLoading(false);
  };

  const addRole = async () => {
    if (!selectedUserId) { toast.error("Select a user"); return; }
    const u = users.find(x => x.id === selectedUserId);
    if (u?.roles.includes(selectedRole)) { toast.error("Already assigned"); return; }
    const { error } = await supabase.from("user_roles").insert({ user_id: selectedUserId, role: selectedRole } as any);
    if (error) { toast.error(error.message); return; }
    await logSuperAdminAction(user?.id, {
      action: "super_admin_role_assigned",
      table_name: "user_roles",
      record_id: selectedUserId,
      new_data: { role: selectedRole },
    });
    toast.success("Role assigned"); loadUsers();
  };

  const removeRole = async (userId: string, role: AppRole) => {
    await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role as any);
    await logSuperAdminAction(user?.id, {
      action: "super_admin_role_removed",
      table_name: "user_roles",
      record_id: userId,
      old_data: { role },
    });
    toast.success("Removed"); loadUsers();
  };

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <ShieldCheck size={48} className="mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Admin access only.</p>
        </div>
      </AppLayout>
    );
  }

  const content = (
    <>
      <h1 className="page-header mb-5 flex items-center gap-2"><ShieldCheck size={20} /> Roles</h1>

      <div className="form-section mb-5 max-w-lg">
        <h2 className="section-title text-sm">Assign Role</h2>
        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">User</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name || u.id.slice(0, 8)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Role</Label>
            <Select value={selectedRole} onValueChange={v => setSelectedRole(v as AppRole)}>
              <SelectTrigger className="w-36 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={addRole} size="sm" className="rounded-xl gap-1"><Plus size={12} /> Assign</Button>
        </div>
      </div>

      <div className="relative w-full sm:w-60 mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search..." className="pl-9 rounded-xl bg-card" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {users.filter(u => (u.full_name || "").toLowerCase().includes(search.toLowerCase())).map(u => (
            <div key={u.id} className="medical-card p-3">
              <p className="text-sm font-semibold">{u.full_name || "Unnamed"}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {u.roles.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground">No roles</span>
                ) : u.roles.map(r => (
                  <span key={r} className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-md capitalize font-medium">
                    {r}
                    <button onClick={() => removeRole(u.id, r)} className="hover:text-destructive"><Trash2 size={8} /></button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  return embedded ? content : <AppLayout>{content}</AppLayout>;
}
