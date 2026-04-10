import { useState } from 'react';
import { Outlet, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Shield,
  LayoutDashboard,
  UserCheck,
  Users,
  Settings,
  FileText,
  LogOut,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import { Loader2 } from 'lucide-react';

export default function AdminLayout() {
  const { isLoggedIn, isLoading, user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isLoggedIn) {
    return <Navigate to="/admin/login" replace />;
  }

  // Redirect if not admin
  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const navItems = [
    { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/teachers/pending', icon: UserCheck, label: 'Pending Teachers' },
    { to: '/admin/students', icon: Users, label: 'Student Management' },
    { to: '/admin/settings', icon: Settings, label: 'System Settings' },
    { to: '/admin/audit-logs', icon: FileText, label: 'Audit Logs' },
  ];

  return (
    <div className="h-screen bg-slate-900 flex overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside
        className={`hidden lg:flex h-full flex-col bg-slate-800 border-r border-slate-700 transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-700">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-white">Admin Portal</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-slate-400 hover:text-white hover:bg-slate-700"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                } ${!sidebarOpen && 'justify-center'}`
              }
              title={!sidebarOpen ? item.label : undefined}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User Info & Logout */}
        <div className="p-4 border-t border-slate-700">
          {sidebarOpen ? (
            <div className="space-y-3">
              <div className="px-3 py-2 bg-slate-700/50 rounded-lg">
                <p className="text-xs text-slate-400">Logged in as</p>
                <p className="text-sm font-medium text-white truncate">{user?.email}</p>
              </div>
              <Button
                onClick={handleLogout}
                variant="ghost"
                className="w-full justify-start text-slate-400 hover:text-white hover:bg-slate-700"
              >
                <LogOut className="w-5 h-5 mr-2" />
                Logout
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleLogout}
              variant="ghost"
              size="icon"
              className="w-full text-slate-400 hover:text-white hover:bg-slate-700"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          )}
        </div>
      </aside>

      {/* Mobile Sidebar */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Mobile Menu */}
          <aside className="fixed top-0 left-0 bottom-0 w-64 bg-slate-800 border-r border-slate-700 z-50 lg:hidden flex flex-col">
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-white">Admin Portal</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(false)}
                className="text-slate-400 hover:text-white hover:bg-slate-700"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700'
                    }`
                  }
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-sm font-medium">{item.label}</span>
                </NavLink>
              ))}
            </nav>

            {/* User Info & Logout */}
            <div className="p-4 border-t border-slate-700">
              <div className="space-y-3">
                <div className="px-3 py-2 bg-slate-700/50 rounded-lg">
                  <p className="text-xs text-slate-400">Logged in as</p>
                  <p className="text-sm font-medium text-white truncate">{user?.email}</p>
                </div>
                <Button
                  onClick={handleLogout}
                  variant="ghost"
                  className="w-full justify-start text-slate-400 hover:text-white hover:bg-slate-700"
                >
                  <LogOut className="w-5 h-5 mr-2" />
                  Logout
                </Button>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar (Mobile) */}
        <div className="lg:hidden h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(true)}
            className="text-slate-400 hover:text-white hover:bg-slate-700"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-white">Admin</span>
          </div>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>

        {/* Content Area */}
        <main className="flex-1 overflow-auto bg-slate-900">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
