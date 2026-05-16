import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/apiClient";
import { useNavigate } from "react-router-dom";
import { useAccessClinic } from "@/hooks/useAccess";

export default function NoAccess() {
  const navigate = useNavigate();
  const { profile } = useAccessClinic();
  const deactivated = profile?.is_active === false;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold text-foreground">
          {deactivated ? "Account deactivated" : "No clinic access"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {deactivated
            ? "Your account has been deactivated by an administrator. Please contact your clinic admin to restore access."
            : "Your account isn't linked to any clinic yet. Ask a clinic admin to invite you, or check your email for a pending invitation link."}
        </p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" onClick={async () => { await apiClient.auth.signOut(); navigate("/login", { replace: true }); }}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
