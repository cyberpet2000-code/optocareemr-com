import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useClinic } from "@/hooks/useClinic";
import { useRole } from "@/hooks/useRole";
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
import SuperAdminCreateClinic from "./pages/SuperAdminCreateClinic";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function Spinner() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  const { clinic, loading: clinicLoading } = useClinic();
  const { isSuperAdmin, loading: roleLoading } = useRole();
  const location = useLocation();

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (clinicLoading || roleLoading) return <Spinner />;

  // Onboarding gate: any non-super-admin clinic user with setup_completed=false → /onboarding
  const onOnboarding = location.pathname.startsWith("/onboarding");
  if (!isSuperAdmin && clinic && clinic.setup_completed === false && !onOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <Routes>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/" element={<Dashboard />} />
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
      {/* Super-admin */}
      <Route path="/super-admin" element={<Dashboard />} />
      <Route path="/super-admin/create-clinic" element={<SuperAdminCreateClinic />} />
      <Route path="/super-admin/clinics" element={<AdminRoles />} />
      <Route path="/super-admin/performance" element={<Dashboard />} />
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
