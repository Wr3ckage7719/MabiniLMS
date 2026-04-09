import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { GraduationCap, AlertCircle } from 'lucide-react';
import { SignupDialog } from '@/components/SignupDialog';

const STUDENT_INSTITUTIONAL_DOMAIN = 'mabinicolleges.edu.ph';
const AUTH_ERROR_STORAGE_KEY = 'auth_error';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, loginWithGoogle, isLoggedIn, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isTeacher, setIsTeacher] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const [showPendingApproval, setShowPendingApproval] = useState(false);

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (isLoggedIn && user) {
      // Check if teacher account is pending approval
      if (user.role === 'teacher' && user.pending_approval) {
        setShowPendingApproval(true);
      } else {
        navigate('/dashboard');
      }
    }
  }, [isLoggedIn, user, navigate]);

  useEffect(() => {
    setShowAnimation(true);
  }, []);

  useEffect(() => {
    const storedAuthError = sessionStorage.getItem(AUTH_ERROR_STORAGE_KEY);
    if (storedAuthError) {
      setError(storedAuthError);
      sessionStorage.removeItem(AUTH_ERROR_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        navigate('/');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setShowPendingApproval(false);
    setIsLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (!isTeacher && !normalizedEmail.endsWith(`@${STUDENT_INSTITUTIONAL_DOMAIN}`)) {
        throw new Error(`Student login requires @${STUDENT_INSTITUTIONAL_DOMAIN} email.`);
      }

      await login(normalizedEmail, password);
      // The useEffect will handle navigation or showing pending message
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRole = () => {
    setIsTeacher(!isTeacher);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex flex-col lg:flex-row">
      {/* Left Side - Branding (Hidden on Mobile) */}
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-8 relative overflow-hidden">
        {/* Decorative Elements */}
        <div className="absolute top-10 left-10 w-20 h-20 rounded-full bg-primary/10 blur-2xl" />
        <div className="absolute bottom-20 right-12 w-32 h-32 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute top-1/2 right-20 w-24 h-24 rounded-full bg-primary/5 blur-2xl" />
        
        {/* Content */}
        <div className="relative z-10 text-center max-w-sm">
          {/* Logo */}
          <div className={`flex justify-center mb-8 transition-all duration-700 ${showAnimation ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-glow">
              <GraduationCap className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          
          {/* Title */}
          <h1 className={`text-5xl font-bold mb-4 transition-all duration-700 ${showAnimation ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
            Mabini Classroom
          </h1>
          
          {/* Subtitle */}
          <p className={`text-lg text-muted-foreground mb-8 transition-all duration-700 ${showAnimation ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{transitionDelay: '100ms'}}>
            Collaborate, learn, and grow together
          </p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-4 lg:p-8 min-h-screen lg:min-h-auto">{/* Logo on Mobile */}
        <div className={`lg:hidden mb-8 transition-all duration-700 ${showAnimation ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-glow">
            <GraduationCap className="h-6 w-6 text-primary-foreground" />
          </div>
        </div>

        <div className={`w-full max-w-md transition-all duration-700 ${showAnimation ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`} style={{transitionDelay: '100ms'}}>
          <div className="glass rounded-2xl border p-6 lg:p-8 space-y-6 shadow-lg">{/* Header */}
            <div>
              <h2 className="text-2xl lg:text-3xl font-bold">Welcome back</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Sign in to your account to continue
              </p>
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <Input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-xl bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 h-11"
                  disabled={isLoading}
                />
              </div>

              <div>
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-xl bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 h-11"
                  disabled={isLoading}
                />
              </div>

              <button type="button" className="text-xs text-primary hover:underline">
                Forgot password?
              </button>

              {error && <div className="text-sm text-destructive text-center bg-destructive/10 p-3 rounded-lg">{error}</div>}

              {/* Pending Approval Alert for Teachers */}
              {showPendingApproval && (
                <Alert className="bg-amber-500/10 border-amber-500/30 text-amber-700">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Account Pending Approval</strong>
                    <p className="mt-1 text-sm">
                      Your teacher account is awaiting admin verification. You will receive an email once approved.
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                className="w-full h-11 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={isLoading}
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>

            {/* Switch Role */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                Logging in as a{' '}
                <button
                  onClick={toggleRole}
                  className="text-primary font-semibold cursor-pointer hover:underline transition-colors"
                >
                  {isTeacher ? 'Student' : 'Teacher'}
                </button>
                ?
              </p>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-muted"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="px-2 bg-background/80 text-muted-foreground">or</span>
              </div>
            </div>

            {/* Google Login */}
            <Button
              onClick={async () => {
                setIsLoading(true);
                setError('');
                try {
                  await loginWithGoogle();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Google login failed');
                  setIsLoading(false);
                }
              }}
              disabled={isLoading}
              variant="outline"
              className="w-full h-11 rounded-xl border font-medium gap-2.5"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </Button>

            {/* Demo Account - Removed for production */}
            {/* 
            <Button
              onClick={handleDemoLogin}
              disabled={isLoading}
              variant="ghost"
              className="w-full h-11 rounded-xl transition-all duration-300 text-muted-foreground hover:text-foreground hover:bg-secondary/30"
            >
              Try {isTeacher ? 'Teacher' : 'Student'} Demo
            </Button>
            */}

            {/* Sign Up Link */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                Don't have an account?{' '}
                <button
                  onClick={() => setSignupOpen(true)}
                  className="text-primary font-semibold hover:underline transition-colors"
                >
                  Sign up
                </button>
              </p>
            </div>
          </div>
        </div>

        <SignupDialog open={signupOpen} onOpenChange={setSignupOpen} isTeacher={isTeacher} />
      </div>
    </div>
  );
}
