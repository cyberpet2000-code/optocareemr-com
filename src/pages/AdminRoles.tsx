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

interface UserWithRoles {
  id: string;
  email: string;
  full_name: string | null;
  roles: AppRole[];
}

const ROLES: AppRole[] = ["admin", "doctor", "receptionist"];

export default function AdminRoles() {
  const { isAdmin } = useRole();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState<AppRole>("doctor");

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    // Get all profiles
    const { data: profiles } = await supabase.from("profiles").select("id, full_name");
    const { data: roleData } = await supabase.from("user_role").select("user_id, role");

    const roleMap = new Map<string, AppRole[]>();
    (roleData || []).forEach((r: any) => {
      const arr = roleMap.get(r.user_id) || [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });

    setUsers((profiles || []).map((p: any) => ({
      id: p.id,
      email: "",
      full_name: p.full_name,
      roles: roleMap.get(p.id) || [],
    })));
    setLoading(false);
  };

  const addRole = async () => {
    if (!selectedUserId) { toast.error("Select a user"); return; }
    const user = users.find(u => u.id === selectedUserId);
    if (user?.roles.includes(selectedRole)) { toast.error("User already has this role"); return; }

    const { error } = await supabase.from("user_role").insert({
      user_id: selectedUserId,
      role: selectedRole,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Role assigned");
    loadUsers();
  };

  const removeRole = async (userId: string, role: AppRole) => {
    const { error } = await supabase.from("user_role").delete().eq("user_id", userId).eq("role", role);
    if (error) { toast.error(error.message); return; }
    toast.success("Role removed");
    loadUsers();
  };

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <ShieldCheck size={48} className="mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Only administrators can access this page.</p>
        </div>
      </AppLayout>
    );
  }

  const filteredUsers = users.filter(u =>
    (u.full_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <h1 className="page-header mb-6"><ShieldCheck size={22} className="inline mr-2" />Role Management</h1>

      {/* Assign Role */}
      <div className="form-section mb-6 max-w-lg">
        <h2 className="section-title text-base">Assign Role</h2>
        <div className="flex gap-3 items-end">
          <div className="flex-1 space-y-1.5">
            <Label>User</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
              <SelectContent>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name || u.id.slice(0, 8)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={selectedRole} onValueChange={v => setSelectedRole(v as AppRole)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={addRole} size="sm"><Plus size={14} className="mr-1" /> Assign</Button>
        </div>
      </div>

      {/* User List */}
      <div className="relative w-full sm:w-72 mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search users..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="medical-card">
        {loading ? (
          <p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>
        ) : filteredUsers.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">No users found.</p>
        ) : (
          <div className="divide-y divide-border">
            {filteredUsers.map(u => (
              <div key={u.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{u.full_name || "Unnamed"}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {u.roles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No roles assigned</span>
                      ) : (
                        u.roles.map(r => (
                          <span key={r} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded capitalize">
                            {r}
                            <button onClick={() => removeRole(u.id, r)} className="hover:text-destructive">
                              <Trash2 size={10} />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
