import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { memo, useEffect, useMemo, useRef, useState } from "react";
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
import PatientFeedback from "./pages/PatientFeedback";
import Expenses from "./pages/Expenses";
import InventoryAudit from "./pages/InventoryAudit";
import AccountSettings from "./pages/AccountSettings";
import MonthlyReports from "./pages/MonthlyReports";
import DailyFrontDeskReport from "./pages/DailyFrontDeskReport";
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
import AppErrorBoundary from "@/components/AppErrorBoundary";
import PageErrorBoundary from "@/components/PageErrorBoundary";

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
      label={label || `Loading ${(() => { try { return localStorage.getItem("active_clinic_name") || "Clinic"; } catch { return "Clinic"; } })()}...`}
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

function RouteScrollRestoration() {
  const location = useLocation();
  const stateKey = location.pathname + location.search;
  const currentKey = useRef(stateKey);

  const getScrollableElements = () =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-oc-scroll]"));

  const saveState = () => {
    const containers: Record<string, number> = {};
    getScrollableElements().forEach((element, index) => {
      containers[String(index)] = element.scrollTop;
    });
    try {
      sessionStorage.setItem("optocare:navigation-state", JSON.stringify({
        key: currentKey.current,
        windowY: window.scrollY,
        containers,
      }));
    } catch {}
  };

  useEffect(() => {
    if (currentKey.current !== stateKey) saveState();
    currentKey.current = stateKey;
    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = sessionStorage.getItem("optocare:navigation-state");
        const saved = raw ? JSON.parse(raw) : null;
        if (!saved || saved.key !== stateKey) {
          window.scrollTo(0, 0);
          return;
        }
        window.scrollTo(0, saved.windowY ?? 0);
        getScrollableElements().forEach((element, index) => {
          const position = saved.containers?.[String(index)];
          if (typeof position === "number") element.scrollTop = position;
        });
      } catch {
        window.scrollTo(0, 0);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [stateKey]);

  useEffect(() => {
    const save = () => saveState();
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("beforeunload", save);
    return () => {
      window.removeEventListener("scroll", save);
      window.removeEventListener("beforeunload", save);
    };
  }, []);

  useEffect(() => {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function (...args) {
      saveState();
      return originalPushState.apply(this, args);
    };
    history.replaceState = function (...args) {
      saveState();
      return originalReplaceState.apply(this, args);
    };
    return () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  });

  return null;
}

export function AppRoutes() {
  const location = useLocation();
  const { user, isAuthReady } = useAuth();

  useEffect(() => {
    diag.event("routing", "navigate", { path: location.pathname });
  }, [location.pathname]);

  const isLegalRoute = location.pathname === "/legal" || location.pathname.startsWith("/legal/");
  const isPublicRoute =
  isLegalRoute ||
  location.pathname.startsWith("/feedback/") ||
  ["/login", "/reset-password", "/accept-invite", "/signup", "/no-access"].includes(location.pathname);

  if (!isAuthReady) return <FullScreenLoader />;

  if (user && (location.pathname === "/login" || location.pathname === "/signup")) {
    return <LandingRedirect />;
  }

  return isPublicRoute ? (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/feedback/:token" element={<PatientFeedback />} />
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
        <Route path="/onboarding" element={<PageErrorBoundary pageName="Onboarding"><Onboarding /></PageErrorBoundary>} />
        <Route path="/select-clinic" element={<PageErrorBoundary pageName="Clinic Selection"><SelectClinic /></PageErrorBoundary>} />

        <Route element={<AppLayout />}>
          <Route path="/super-admin" element={<SuperAdminOnly><PageErrorBoundary pageName="Super Admin Dashboard"><SuperAdminDashboard /></PageErrorBoundary></SuperAdminOnly>} />
          <Route path="/super-admin/system-health" element={<SuperAdminOnly><PageErrorBoundary pageName="System Health"><SystemHealth /></PageErrorBoundary></SuperAdminOnly>} />
          <Route path="/super-admin-dashboard" element={<Navigate to="/super-admin" replace />} />
          <Route path="/super-admin/create-clinic" element={<SuperAdminOnly><PageErrorBoundary pageName="Create Clinic"><SuperAdminCreateClinic /></PageErrorBoundary></SuperAdminOnly>} />
          <Route path="/super-admin/clinics" element={<SuperAdminOnly><PageErrorBoundary pageName="Clinics"><SuperAdminClinics /></PageErrorBoundary></SuperAdminOnly>} />
          <Route path="/super-admin/archives" element={<SuperAdminOnly><PageErrorBoundary pageName="Clinic Data Archives"><SuperAdminArchives /></PageErrorBoundary></SuperAdminOnly>} />
          <Route path="/super-admin/users" element={<SuperAdminOnly><PageErrorBoundary pageName="User Management"><AdminRoles embedded /></PageErrorBoundary></SuperAdminOnly>} />

          <Route path="/dashboard" element={<PageErrorBoundary pageName="Dashboard"><Dashboard /></PageErrorBoundary>} />
          <Route path="/visits" element={<PageErrorBoundary pageName="Visits"><Visits /></PageErrorBoundary>} />
          <Route path="/register" element={<PageErrorBoundary pageName="Patient Registration"><PatientRegister /></PageErrorBoundary>} />
          <Route path="/patients/followups" element={<PageErrorBoundary pageName="Patients"><PatientList /></PageErrorBoundary>} />
          <Route path="/patients" element={<PatientList />} />
          <Route path="/patient/:id" element={<PageErrorBoundary pageName="Patient Record"><PatientRecord /></PageErrorBoundary>} />
          <Route path="/hmos" element={<PageErrorBoundary pageName="HMO Management"><HmoManagement /></PageErrorBoundary>} />
          <Route path="/appointments" element={<PageErrorBoundary pageName="Appointments"><Appointments /></PageErrorBoundary>} />
          <Route path="/inventory" element={<PageErrorBoundary pageName="Inventory"><Inventory /></PageErrorBoundary>} />
          <Route path="/billing" element={<PageErrorBoundary pageName="Billing"><Billing /></PageErrorBoundary>} />
          <Route path="/admin/roles" element={<PageErrorBoundary pageName="Staff & Roles"><AdminRoles /></PageErrorBoundary>} />
          <Route path="/finance/expenses" element={<PageErrorBoundary pageName="Expenses"><Expenses /></PageErrorBoundary>} />
          <Route path="/inventory/audit" element={<PageErrorBoundary pageName="Inventory Audit"><InventoryAudit /></PageErrorBoundary>} />
          <Route path="/settings/account" element={<PageErrorBoundary pageName="Account Settings"><AccountSettings /></PageErrorBoundary>} />
          <Route path="/reports/monthly" element={<PageErrorBoundary pageName="Monthly Reports"><MonthlyReports /></PageErrorBoundary>} />
          <Route path="/reports/daily-front-desk" element={<PageErrorBoundary pageName="Daily Front Desk Report"><DailyFrontDeskReport /></PageErrorBoundary>} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="/" element={<LandingRedirect />} />
      </Routes>
    </ProtectedRouteGate>
  );
}

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AccessProvider>
          <BrowserRouter>
            <RouteScrollRestoration />
            <AppRoutes />
          </BrowserRouter>
        </AccessProvider>
        {isDiagEnabled() && <DiagOverlay />}
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
