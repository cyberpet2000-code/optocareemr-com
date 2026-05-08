import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

export default function NoAccess() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold text-foreground">No clinic access</h1>
        <p className="text-sm text-muted-foreground">
          Your account isn't linked to any clinic yet. Ask a clinic admin to invite you,
          or check your email for a pending invitation link.
        </p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate("/login", { replace: true }); }}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
