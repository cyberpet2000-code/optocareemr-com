import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Dashboard from "./pages/Dashboard";
import PatientRegister from "./pages/PatientRegister";
import PatientList from "./pages/PatientList";
import PatientRecord from "./pages/PatientRecord";
import Appointments from "./pages/Appointments";
import Inventory from "./pages/Inventory";
import Billing from "./pages/Billing";
import SalesHistory from "./pages/SalesHistory";
import AdminRoles from "./pages/AdminRoles";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/register" element={<PatientRegister />} />
      <Route path="/patients" element={<PatientList />} />
      <Route path="/patient/:id" element={<PatientRecord />} />
      <Route path="/appointments" element={<Appointments />} />
      <Route path="/inventory" element={<Inventory />} />
      <Route path="/billing" element={<Billing />} />
      <Route path="/sales-history" element={<SalesHistory />} />
      <Route path="/admin/roles" element={<AdminRoles />} />
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
