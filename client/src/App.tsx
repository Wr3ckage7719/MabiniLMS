import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import AppLayout from "./layouts/AppLayout";
import AdminLayout from "./layouts/AdminLayout";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import ClassDetail from "./pages/ClassDetail";
import CalendarPage from "./pages/CalendarPage";
import UpcomingPage from "./pages/UpcomingPage";
import GradesPage from "./pages/GradesPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import PendingTeachersPage from "./pages/admin/PendingTeachersPage";
import StudentManagementPage from "./pages/admin/StudentManagementPage";
import SystemSettingsPage from "./pages/admin/SystemSettingsPage";
import AuditLogsPage from "./pages/admin/AuditLogsPage";
import BugReportsPage from "./pages/admin/BugReportsPage";
import TeacherDashboard from "./pages/TeacherDashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import NotFound from "./pages/NotFound";
import SubmissionQueueSync from "./components/SubmissionQueueSync";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 401) {
          return false;
        }
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Index />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
    <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />

    {/* Teacher Routes */}
    <Route
      path="/teacher"
      element={(
        <ProtectedRoute role="teacher">
          <TeacherDashboard />
        </ProtectedRoute>
      )}
    />
    
    {/* Admin Routes */}
    <Route path="/admin/login" element={<AdminLoginPage />} />
    <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
    <Route element={<AdminLayout />}>
      <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
      <Route path="/admin/teachers/pending" element={<PendingTeachersPage />} />
      <Route path="/admin/students" element={<StudentManagementPage />} />
      <Route path="/admin/settings" element={<SystemSettingsPage />} />
      <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
      <Route path="/admin/bug-reports" element={<BugReportsPage />} />
    </Route>
    
    {/* Regular App Routes */}
    <Route element={<AppLayout />}>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/class/:id" element={<ClassDetail />} />
      <Route path="/upcoming" element={<UpcomingPage />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/grades" element={<GradesPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/archived" element={<Dashboard />} />
    </Route>
    
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <SubmissionQueueSync />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
