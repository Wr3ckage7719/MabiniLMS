import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/auth/Login';
import Register from './components/auth/Register';

function AuthContent() {
  const { user, profile, loading, signOut } = useAuth();
  const [showRegister, setShowRegister] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return showRegister ? (
      <Register onToggle={() => setShowRegister(false)} />
    ) : (
      <Login onToggle={() => setShowRegister(true)} />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Bar */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-blue-600">MabiniLMS</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-700">
                <span className="font-medium">{profile?.first_name} {profile?.last_name}</span>
                <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs capitalize">
                  {profile?.role}
                </span>
              </div>
              <button
                onClick={signOut}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Welcome to MabiniLMS Dashboard
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">Your Profile</h3>
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">Name:</span> {profile?.first_name} {profile?.last_name}</p>
                <p><span className="font-medium">Email:</span> {profile?.email}</p>
                <p><span className="font-medium">Role:</span> <span className="capitalize">{profile?.role}</span></p>
                <p><span className="font-medium">User ID:</span> {user.id}</p>
              </div>
            </div>

            <div className="p-4 bg-green-50 rounded-lg">
              <h3 className="font-semibold text-green-900 mb-2">Authentication Status</h3>
              <div className="space-y-2 text-sm">
                <p className="flex items-center">
                  <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                  Logged in successfully
                </p>
                <p className="flex items-center">
                  <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                  Supabase connected
                </p>
                <p className="flex items-center">
                  <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                  Profile loaded
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg text-white">
            <h3 className="text-xl font-bold mb-2">Phase 1 Complete! 🎉</h3>
            <p className="mb-4">Authentication system is working perfectly. You can now:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Register new users with different roles</li>
              <li>Login and logout</li>
              <li>Access protected routes</li>
              <li>View user profiles</li>
            </ul>
            <p className="mt-4 text-sm opacity-90">
              Next up: Building course management features!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AuthContent />
    </AuthProvider>
  );
}

export default App;
