import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useClinic } from "@/hooks/useClinic";
import { useRole } from "@/hooks/useRole";
import AppLayout from "@/components/AppLayout";
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
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
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

function SuperAdminOnly({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin, loading } = useRole();
  if (loading) return <FullScreenLoader label="Verifying access…" />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function ClinicRoute({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}

function ProtectedRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { clinic, profile, loading: clinicLoading } = useClinic();
  const { isSuperAdmin, loading: roleLoading } = useRole();
  const location = useLocation();

  // 1. Wait for auth
  if (authLoading) return <FullScreenLoader label="Loading session…" />;
  if (!user) return <Navigate to="/login" replace />;

  // 2. Wait for profile + roles before any routing decision
  if (clinicLoading || roleLoading) return <FullScreenLoader label="Loading user session…" />;

  // 3. Super admin: always under /super-admin/*, never onboarding, never clinic dashboard
  if (isSuperAdmin) {
    if (!location.pathname.startsWith("/super-admin")) {
      return <Navigate to="/super-admin" replace />;
    }
  } else {
    // 4. Regular clinic users: enforce onboarding if clinic exists and setup not done
    const onOnboarding = location.pathname.startsWith("/onboarding");
    if (clinic && clinic.setup_completed === false && !onOnboarding) {
      return <Navigate to="/onboarding" replace />;
    }
    // Block /super-admin/* for non-super-admins
    if (location.pathname.startsWith("/super-admin")) {
      return <Navigate to="/" replace />;
    }
  }

  return (
    <Routes>
      {/* Onboarding (non-super-admin only, no AppLayout) */}
      <Route path="/onboarding" element={<Onboarding />} />

      {/* Super Admin */}
      <Route path="/super-admin" element={<SuperAdminOnly><SuperAdminDashboard /></SuperAdminOnly>} />
      <Route path="/super-admin/create-clinic" element={<SuperAdminOnly><SuperAdminCreateClinic /></SuperAdminOnly>} />
      <Route path="/super-admin/clinics" element={<SuperAdminOnly><SuperAdminClinics /></SuperAdminOnly>} />
      <Route path="/super-admin/users" element={<SuperAdminOnly><AdminRoles /></SuperAdminOnly>} />
      <Route path="/super-admin/performance" element={<SuperAdminOnly><SuperAdminDashboard /></SuperAdminOnly>} />
      <Route path="/super-admin/control" element={<SuperAdminOnly><SuperAdminDashboard /></SuperAdminOnly>} />
      <Route path="/super-admin/safety" element={<SuperAdminOnly><SuperAdminDashboard /></SuperAdminOnly>} />

      {/* Clinic app */}
      <Route path="/" element={<ClinicRoute><Dashboard /></ClinicRoute>} />
      <Route path="/register" element={<ClinicRoute><PatientRegister /></ClinicRoute>} />
      <Route path="/patients" element={<ClinicRoute><PatientList /></ClinicRoute>} />
      <Route path="/patient/:id" element={<ClinicRoute><PatientRecord /></ClinicRoute>} />
      <Route path="/queue" element={<ClinicRoute><Queue /></ClinicRoute>} />
      <Route path="/hmos" element={<ClinicRoute><HmoManagement /></ClinicRoute>} />
      <Route path="/appointments" element={<ClinicRoute><Appointments /></ClinicRoute>} />
      <Route path="/inventory" element={<ClinicRoute><Inventory /></ClinicRoute>} />
      <Route path="/pharmacy" element={<ClinicRoute><Pharmacy /></ClinicRoute>} />
      <Route path="/billing" element={<ClinicRoute><Billing /></ClinicRoute>} />
      <Route path="/sales-history" element={<ClinicRoute><SalesHistory /></ClinicRoute>} />
      <Route path="/admin/roles" element={<ClinicRoute><AdminRoles /></ClinicRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
