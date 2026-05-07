import React, { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AppLogo } from "@/components/AppLogo";
import AppLayout from "./layouts/AppLayout";
import AdminLayout from "./layouts/AdminLayout";
import Index from "./pages/Index";
import LoginPage from "./pages/LoginPage";
import ProtectedRoute from "./components/ProtectedRoute";
import NotFound from "./pages/NotFound";
import SubmissionQueueSync from "./components/SubmissionQueueSync";

// Lazy-load every page not on the login/auth critical path.
// Each becomes its own JS chunk — downloaded only when the route is visited.
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const ClassDetail = React.lazy(() => import('./pages/ClassDetail'));
const CalendarPage = React.lazy(() => import('./pages/CalendarPage'));
const UpcomingPage = React.lazy(() => import('./pages/UpcomingPage'));
const GradesPage = React.lazy(() => import('./pages/GradesPage'));
const LessonDetailPage = React.lazy(() => import('./pages/LessonDetailPage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));
const GoogleStudentSetupPage = React.lazy(() => import('./pages/GoogleStudentSetupPage'));
const ResetPasswordPage = React.lazy(() => import('./pages/ResetPasswordPage'));
const VerifyEmailPage = React.lazy(() => import('./pages/VerifyEmailPage'));
const AdminLoginPage = React.lazy(() => import('./pages/AdminLoginPage'));
const PendingTeachersPage = React.lazy(() => import('./pages/admin/PendingTeachersPage'));
const StudentManagementPage = React.lazy(() => import('./pages/admin/StudentManagementPage'));
const SystemSettingsPage = React.lazy(() => import('./pages/admin/SystemSettingsPage'));
const AuditLogsPage = React.lazy(() => import('./pages/admin/AuditLogsPage'));
const BugReportsPage = React.lazy(() => import('./pages/admin/BugReportsPage'));
const TeacherDashboard = React.lazy(() => import('./pages/TeacherDashboard'));
const LessonEditorPage = React.lazy(() => import('./pages/LessonEditorPage'));
const MaterialReaderPage = React.lazy(() => import('./pages/MaterialReaderPage'));
const AssignmentBuilderPage = React.lazy(() => import('./pages/AssignmentBuilderPage'));
const MaterialUploadPage = React.lazy(() => import('./pages/MaterialUploadPage'));
const AdminDashboardPage = React.lazy(() => import('./pages/admin/AdminDashboardPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000, // 30 minutes — keeps data warm across short breaks
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 401) {
          return false;
        }
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: true,
      networkMode: 'offlineFirst',
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
    <Route
      path="/auth/google-student-setup"
      element={(
        <ProtectedRoute role="student">
          <GoogleStudentSetupPage />
        </ProtectedRoute>
      )}
    />
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
    
    {/* Full-screen lesson pages — outside AppLayout so they own the entire viewport. */}
    <Route
      path="/class/:id/lessons/:lessonId/edit"
      element={(
        <ProtectedRoute>
          <LessonEditorPage />
        </ProtectedRoute>
      )}
    />
    <Route
      path="/class/:id/lessons/:lessonId"
      element={(
        <ProtectedRoute>
          <LessonDetailPage />
        </ProtectedRoute>
      )}
    />
    <Route
      path="/class/:id/lessons/:lessonId/new/reading-material"
      element={(
        <ProtectedRoute role="teacher">
          <MaterialUploadPage />
        </ProtectedRoute>
      )}
    />
    <Route
      path="/class/:id/lessons/:lessonId/new/:taskType"
      element={(
        <ProtectedRoute role="teacher">
          <AssignmentBuilderPage />
        </ProtectedRoute>
      )}
    />
    <Route
      path="/class/:id/lessons/:lessonId/materials/:materialId"
      element={(
        <ProtectedRoute>
          <MaterialReaderPage />
        </ProtectedRoute>
      )}
    />

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
            <Suspense
              fallback={
                <div className="min-h-screen flex items-center justify-center bg-background">
                  <AppLogo className="h-12 w-12 animate-pulse" />
                </div>
              }
            >
              <AppRoutes />
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
