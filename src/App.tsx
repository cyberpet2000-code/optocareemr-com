import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useClinic } from "@/hooks/useClinic";
import { useRole } from "@/hooks/useRole";
import { useAccess, AccessProvider } from "@/hooks/useAccess";
import AppLayout from "@/components/AppLayout";
import { ACCESS_TIMEOUT_MS, resolveDefaultRoute, resolveProtectedRoute } from "@/lib/route-access";
import Dashboard from "./pages/Dashboard";
import PatientRegister from "./pages/PatientRegister";
import PatientList from "./pages/PatientList";
import PatientRecord from "./pages/PatientRecord";
import Appointments from "./pages/Appointments";
import Inventory from "./pages/Inventory";
import Pharmacy from "./pages/Pharmacy";
import Billing from "./pages/Billing";
import SalesHistory from "./pages/SalesHistory";
import AdminRoles from "./pages/AdminRoles";
import Queue from "./pages/Queue";
import HmoManagement from "./pages/HmoManagement";
import Onboarding from "./pages/Onboarding";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import SuperAdminClinics from "./pages/SuperAdminClinics";
import SuperAdminCreateClinic from "./pages/SuperAdminCreateClinic";
import SuperAdminControlCenter from "./pages/SuperAdminControlCenter";
import SuperAdminSafety from "./pages/SuperAdminSafety";
import SuperAdminSwitchAudit from "./pages/SuperAdminSwitchAudit";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import SelectClinic from "./pages/SelectClinic";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function FullScreenLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function FullScreenMessage({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-base font-medium text-foreground">{label}</div>
    </div>
  );
}

function SuperAdminOnly({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin, loading } = useRole();
  if (loading) return <FullScreenLoader label="Loading OptoCare…" />;
  if (!isSuperAdmin) return <FullScreenMessage label="Super Admin access required" />;
  return <AppLayout>{children}</AppLayout>;
}

function ProtectedRouteGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { clinic, profile, effectiveClinicId } = useClinic();
  const { role } = useRole();
  const { isAuthReady, roleMissing, memberships } = useAccess();
  const location = useLocation();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (isAuthReady || !user) {
      setTimedOut(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setTimedOut(true);
    }, ACCESS_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [isAuthReady, user]);

  const decision = resolveProtectedRoute({
    path: location.pathname,
    isAuthenticated: !!user,
    isAuthReady,
    didTimeout: timedOut,
    role,
    clinicId: effectiveClinicId,
    setupCompleted: clinic?.setup_completed,
    roleMissing,
    membershipsCount: (memberships || []).length,
  });

  if (decision.type === "loading") {
    return <FullScreenLoader label={decision.label} />;
  }

  if (decision.type === "error") {
    return <FullScreenMessage label={decision.label} />;
  }

  if (decision.type === "redirect") {
    return <Navigate to={decision.to} replace />;
  }

  return <>{children}</>;
}

export function AppRoutes() {
  const location = useLocation();

  const isPublicRoute = location.pathname === "/login" || location.pathname === "/reset-password";

  return (
    <>
      {isPublicRoute ? (
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      ) : (
        <ProtectedRouteGate>
          <Routes>
            <Route path="/onboarding" element={<Onboarding />} />

            <Route path="/super-admin" element={<SuperAdminOnly><SuperAdminDashboard /></SuperAdminOnly>} />
            <Route path="/super-admin-dashboard" element={<Navigate to="/super-admin" replace />} />
            <Route path="/super-admin/create-clinic" element={<SuperAdminOnly><SuperAdminCreateClinic /></SuperAdminOnly>} />
            <Route path="/super-admin/clinics" element={<SuperAdminOnly><SuperAdminClinics /></SuperAdminOnly>} />
            <Route path="/super-admin/users" element={<SuperAdminOnly><AdminRoles embedded /></SuperAdminOnly>} />
            <Route path="/super-admin/performance" element={<SuperAdminOnly><SuperAdminDashboard /></SuperAdminOnly>} />
            <Route path="/super-admin/control" element={<SuperAdminOnly><SuperAdminControlCenter /></SuperAdminOnly>} />
            <Route path="/super-admin/safety" element={<SuperAdminOnly><SuperAdminSafety /></SuperAdminOnly>} />
            <Route path="/super-admin/audit" element={<SuperAdminOnly><SuperAdminSwitchAudit /></SuperAdminOnly>} />

            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/register" element={<PatientRegister />} />
            <Route path="/patients" element={<PatientList />} />
            <Route path="/patient/:id" element={<PatientRecord />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/hmos" element={<HmoManagement />} />
            <Route path="/appointments" element={<Appointments />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/pharmacy" element={<Pharmacy />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/sales-history" element={<SalesHistory />} />
            <Route path="/admin/roles" element={<AdminRoles />} />
            <Route path="/" element={<LandingRedirect />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ProtectedRouteGate>
      )}
    </>
  );
}

function LandingRedirect() {
  const { clinic, profile, effectiveClinicId } = useClinic();
  const { role } = useRole();

  return <Navigate to={resolveDefaultRoute({ role, clinicId: effectiveClinicId ?? profile?.clinic_id, setupCompleted: clinic?.setup_completed })} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AccessProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AccessProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
