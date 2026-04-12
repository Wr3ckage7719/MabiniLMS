import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Lock, Mail, AlertCircle } from 'lucide-react';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { login, isLoggedIn, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showAnimation, setShowAnimation] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (isLoggedIn) {
      // Check if user is admin
      if (user?.role === 'admin') {
        navigate('/admin/dashboard');
      } else if (user?.role === 'teacher') {
        navigate('/teacher');
      } else {
        // Not an admin, redirect to regular dashboard
        navigate('/dashboard');
      }
    }
  }, [isLoggedIn, user, navigate]);

  useEffect(() => {
    setShowAnimation(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setEmailError('');
    setPasswordError('');

    const trimmedEmail = email.trim();
    let hasFieldError = false;

    if (!trimmedEmail) {
      setEmailError('Email is required');
      hasFieldError = true;
    }

    if (!password) {
      setPasswordError('Password is required');
      hasFieldError = true;
    }

    if (hasFieldError) {
      return;
    }

    setIsLoading(true);

    try {
      const loginResult = await login(
        trimmedEmail,
        password,
        requiresTwoFactor ? twoFactorCode.trim() : undefined,
        'admin'
      );

      if (loginResult.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        setError('Enter your 6-digit authenticator code to continue.');
        return;
      }

      setRequiresTwoFactor(false);
      setTwoFactorCode('');
      // After login, check role via the AuthContext
      // The useEffect above will handle the redirect
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Authentication failed. Please check your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
      </div>

      {/* Login Card */}
      <div className={`relative z-10 w-full max-w-md transition-all duration-700 ${showAnimation ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        <div className="bg-slate-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            {/* Admin Badge */}
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 mb-4 shadow-lg">
              <Shield className="w-8 h-8 text-white" />
            </div>
            
            <h1 className="text-3xl font-bold text-white mb-2">
              Administrator Access
            </h1>
            <p className="text-slate-400">
              MabiniLMS Admin Portal
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-400 font-medium mb-1">Authentication Failed</p>
                <p className="text-sm text-red-300/80">{error}</p>
              </div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-500" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError('');
                    if (requiresTwoFactor) {
                      setRequiresTwoFactor(false);
                      setTwoFactorCode('');
                    }
                  }}
                  placeholder="admin@mabinilms.edu"
                  disabled={isLoading}
                  className={`pl-11 bg-slate-900/50 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 ${
                    emailError ? 'border-red-500 focus:border-red-500' : 'border-slate-700'
                  }`}
                />
              </div>
              {emailError && (
                <p className="mt-1 text-xs text-red-400">{emailError}</p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-500" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError('');
                    if (requiresTwoFactor) {
                      setRequiresTwoFactor(false);
                      setTwoFactorCode('');
                    }
                  }}
                  placeholder="••••••••"
                  disabled={isLoading}
                  className={`pl-11 bg-slate-900/50 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 ${
                    passwordError ? 'border-red-500 focus:border-red-500' : 'border-slate-700'
                  }`}
                />
              </div>
              {passwordError && (
                <p className="mt-1 text-xs text-red-400">{passwordError}</p>
              )}
            </div>

            {requiresTwoFactor && (
              <div>
                <label htmlFor="twoFactorCode" className="block text-sm font-medium text-slate-300 mb-2">
                  Authenticator Code
                </label>
                <Input
                  id="twoFactorCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  disabled={isLoading}
                  className="bg-slate-900/50 text-white placeholder:text-slate-500 border-slate-700 focus:border-blue-500 focus:ring-blue-500/20"
                />
              </div>
            )}

            {/* Login Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium py-3 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Authenticating...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Shield className="w-5 h-5" />
                  {requiresTwoFactor ? 'Verify and Sign In' : 'Sign In as Administrator'}
                </span>
              )}
            </Button>
          </form>

          {/* Security Notice */}
          <div className="mt-6 pt-6 border-t border-slate-700/50">
            <div className="flex items-start gap-3 text-xs text-slate-400">
              <Lock className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>
                This portal is restricted to authorized administrators only. 
                All access attempts are logged and monitored for security purposes.
              </p>
            </div>
          </div>

          {/* Back to Main Site Link */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-sm text-slate-400 hover:text-slate-300 transition-colors"
            >
              ← Back to Main Login
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-slate-500">
          <p>MabiniLMS Admin Portal v1.0</p>
        </div>
      </div>
    </div>
  );
}
