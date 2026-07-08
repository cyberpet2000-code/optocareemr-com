import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { memo, useEffect, useMemo, useState } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useAccessAuth, useAccessClinic, useAccessRole, AccessProvider } from "@/hooks/useAccess";
import AppLayout from "@/components/AppLayout";
import { ACCESS_TIMEOUT_MS, resolveDefaultRoute, resolveProtectedRoute } from "@/lib/route-access";
import Dashboard from "./pages/Dashboard";
import Visits from "@/pages/Visits";
import PatientRegister from "./pages/PatientRegister";
import PatientList from "./pages/PatientList";
import PatientRecord from "./pages/PatientRecord";
import Appointments from "./pages/Appointments";
import Inventory from "./pages/Inventory";
import Billing from "./pages/Billing";
import AdminRoles from "./pages/AdminRoles";
import HmoManagement from "./pages/HmoManagement";
import Onboarding from "./pages/Onboarding";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import SuperAdminClinics from "./pages/SuperAdminClinics";
import SuperAdminCreateClinic from "./pages/SuperAdminCreateClinic";
import SuperAdminArchives from "./pages/SuperAdminArchives";
import SystemHealth from "./pages/SystemHealth";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import SelectClinic from "./pages/SelectClinic";
import AcceptInvite from "./pages/AcceptInvite";
import NoAccess from "./pages/NoAccess";
import NotFound from "./pages/NotFound";
import LegalIndex from "./pages/legal/LegalIndex";
import LegalTerms from "./pages/legal/Terms";
import LegalPrivacy from "./pages/legal/Privacy";
import LegalCookies from "./pages/legal/Cookies";
import LegalDPA from "./pages/legal/DPA";
import LegalSecurity from "./pages/legal/Security";
import LegalCompliance from "./pages/legal/Compliance";
import LegalMedical from "./pages/legal/MedicalDisclaimer";
import LegalContact from "./pages/legal/Contact";
import Expenses from "./pages/Expenses";
import InventoryAudit from "./pages/InventoryAudit";
import AccountSettings from "./pages/AccountSettings";
import MonthlyReports from "./pages/MonthlyReports";
import {
  diag,
  isDiagEnabled,
  installDiagFetchPatch,
  DiagOverlay,
} from "@/lib/diag";
import { apiClient } from "@/lib/apiClient";
import { toast } from "sonner";
import { ThemeProvider } from "@/components/ThemeProvider";
import OptoLoader from "@/components/OptoLoader";

installDiagFetchPatch();


const queryClient = new QueryClient();
function playAlert() {
  const audio = new Audio("/notify.mp3");
  audio.play().catch(() => {});
}

function FullScreenLoader({ label }: { label?: string }) {
  return (
    <OptoLoader
      fullscreen
      size={56}
      label={label || `Loading ${localStorage.getItem("active_clinic_name") || "Clinic"}...`}
    />
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
  if (loading) return <FullScreenLoader />;
  if (!isSuperAdmin) return <FullScreenMessage label="Super Admin access required" />;
  return <>{children}</>;
}

function ProtectedRouteGate({ children }: { children: React.ReactNode }) {
  const { user, isAuthReady } = useAccessAuth();
  const { clinic, effectiveClinicId, memberships, profile } = useAccessClinic();
  const { role, roleMissing } = useAccessRole();
  
  useEffect(() => {
  if (!user || !effectiveClinicId) return;

  if ("Notification" in window) {
    Notification.requestPermission();
  }

  const patientsChannel = apiClient
    .channel("patients-live")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "patients",
      },
      payload => {
        const p: any = payload.new;

        if (p.clinic_id !== effectiveClinicId) return;

        toast(
          `🔔 New patient added — ${p.full_name || "Patient"} (#${p.queue_number || ""})`
        );

        playAlert();

        if (Notification.permission === "granted") {
          new Notification("OptoCare EMR", {
            body: `New patient added — ${p.full_name || "Patient"}`,
          });
        }
      }
    )
    .subscribe();

  const visitsChannel = apiClient
    .channel("visits-live")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "visits",
      },
      payload => {
        const v: any = payload.new;
        if (v.clinic_id !== effectiveClinicId) return;

        if (v.status === "completed") {
          toast("✅ Visit completed");

          playAlert();

          if (Notification.permission === "granted") {
            new Notification("OptoCare EMR", {
              body: "Visit completed",
            });
          }
        }
      }
    )
    .subscribe();

  return () => {
    apiClient.removeChannel(patientsChannel);
    apiClient.removeChannel(visitsChannel);
  };
}, [user,effectiveClinicId]);
  const location = useLocation();
  const [timedOut, setTimedOut] = useState(false);
  const setupCompleted = clinic?.setup_completed ?? null;
  const lifecycleStatus = (clinic as any)?.lifecycle_status ?? null;
  const isActive = profile?.is_active !== false;

  useEffect(() => {
    if (isAuthReady || !user) {
      setTimedOut(false);
      return;
    }
    
    const timer = window.setTimeout(() => setTimedOut(true), ACCESS_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [isAuthReady, user]);

  const decision = useMemo(() => resolveProtectedRoute({
    path: location.pathname,
    isAuthenticated: !!user,
    isAuthReady,
    didTimeout: timedOut,
    role,
    clinicId: effectiveClinicId,
    setupCompleted,
    roleMissing,
    membershipsCount: memberships.length,
    lifecycleStatus,
    isActive,
  }), [effectiveClinicId, isActive, isAuthReady, lifecycleStatus, location.pathname, memberships.length, role, roleMissing, setupCompleted, timedOut, user]);

  useEffect(() => {
    console.debug("[route:guard]", {
      path: location.pathname,
      decision: decision.type,
      target: decision.type === "redirect" ? decision.to : null,
      isAuthenticated: !!user,
      isAuthReady,
      role,
      clinicId: effectiveClinicId,
      isActive,
    });
  }, [decision, effectiveClinicId, isActive, isAuthReady, location.pathname, role, user]);

  if (decision.type === "loading") return <FullScreenLoader label={decision.label} />;
  if (decision.type === "error") return <FullScreenMessage label={decision.label} />;
  if (decision.type === "redirect") return <Navigate to={decision.to} replace />;
  return <>{children}</>;
}

const LandingRedirect = memo(function LandingRedirect() {
  const { clinic, effectiveClinicId, memberships } = useAccessClinic();
  const { role } = useAccessRole();

  const target = useMemo(() => resolveDefaultRoute({
    role,
    clinicId: effectiveClinicId,
    setupCompleted: clinic?.setup_completed,
    membershipsCount: memberships.length,
  }), [clinic?.setup_completed, effectiveClinicId, memberships.length, role]);

  return <Navigate to={target} replace />;
});

export function AppRoutes() {
  const location = useLocation();
  const { user, isAuthReady } = useAuth();

  useEffect(() => {
    diag.event("routing", "navigate", { path: location.pathname });
  }, [location.pathname]);

  const isLegalRoute = location.pathname === "/legal" || location.pathname.startsWith("/legal/");
  const isPublicRoute = isLegalRoute || ["/login", "/reset-password", "/accept-invite", "/signup", "/no-access"].includes(location.pathname);

  if (!isAuthReady) return <FullScreenLoader />;

  if (user && (location.pathname === "/login" || location.pathname === "/signup")) {
    return <LandingRedirect />;
  }

  return isPublicRoute ? (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/signup" element={<AcceptInvite />} />
      <Route path="/no-access" element={<NoAccess />} />
      <Route path="/legal" element={<LegalIndex />} />
      <Route path="/legal/terms" element={<LegalTerms />} />
      <Route path="/legal/privacy" element={<LegalPrivacy />} />
      <Route path="/legal/cookies" element={<LegalCookies />} />
      <Route path="/legal/dpa" element={<LegalDPA />} />
      <Route path="/legal/security" element={<LegalSecurity />} />
      <Route path="/legal/compliance" element={<LegalCompliance />} />
      <Route path="/legal/medical-disclaimer" element={<LegalMedical />} />
      <Route path="/legal/contact" element={<LegalContact />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  ) : (
    <ProtectedRouteGate>
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/select-clinic" element={<SelectClinic />} />

        <Route element={<AppLayout />}>
          <Route path="/super-admin" element={<SuperAdminOnly><SuperAdminDashboard /></SuperAdminOnly>} />
          <Route path="/super-admin/system-health" element={<SuperAdminOnly><SystemHealth /></SuperAdminOnly>} />
          <Route path="/super-admin-dashboard" element={<Navigate to="/super-admin" replace />} />
          <Route path="/super-admin/create-clinic" element={<SuperAdminOnly><SuperAdminCreateClinic /></SuperAdminOnly>} />
          <Route path="/super-admin/clinics" element={<SuperAdminOnly><SuperAdminClinics /></SuperAdminOnly>} />
          <Route path="/super-admin/archives" element={<SuperAdminOnly><SuperAdminArchives /></SuperAdminOnly>} />
          <Route path="/super-admin/users" element={<SuperAdminOnly><AdminRoles embedded /></SuperAdminOnly>} />

          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/visits" element={<Visits />} />
          <Route path="/register" element={<PatientRegister />} />
          <Route path="/patients" element={<PatientList />} />
          <Route path="/patient/:id" element={<PatientRecord />} />
          <Route path="/hmos" element={<HmoManagement />} />
          <Route path="/appointments" element={<Appointments />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/admin/roles" element={<AdminRoles />} />
          <Route path="/finance/expenses" element={<Expenses />} />
          <Route path="/inventory/audit" element={<InventoryAudit />} />
          <Route path="/settings/account" element={<AccountSettings />} />
          <Route path="/reports/monthly" element={<MonthlyReports />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="/" element={<LandingRedirect />} />
      </Routes>
    </ProtectedRouteGate>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AccessProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AccessProvider>
        {isDiagEnabled() && <DiagOverlay />}
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
