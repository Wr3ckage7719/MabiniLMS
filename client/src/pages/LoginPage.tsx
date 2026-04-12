import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GraduationCap } from 'lucide-react';
import { SignupDialog } from '@/components/SignupDialog';
import { ForgotPasswordDialog } from '@/components/ForgotPasswordDialog';
import { useToast } from '@/hooks/use-toast';

const AUTH_ERROR_STORAGE_KEY = 'auth_error';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, loginWithGoogle, isLoggedIn, user } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isTeacher, setIsTeacher] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);

  useEffect(() => {
    setShowAnimation(true);
  }, []);

  useEffect(() => {
    if (isLoggedIn && user) {
      const resolvedRole = (user.role || '').toLowerCase();
      if (resolvedRole === 'admin') {
        navigate('/admin/dashboard');
      } else if (resolvedRole === 'teacher') {
        navigate('/teacher');
      } else {
        navigate('/dashboard');
      }
    }
  }, [isLoggedIn, user, navigate]);

  useEffect(() => {
    const storedAuthError = sessionStorage.getItem(AUTH_ERROR_STORAGE_KEY);
    if (storedAuthError) {
      setError(storedAuthError);
      toast({
        title: 'Authentication blocked',
        description: storedAuthError,
        variant: 'destructive',
      });
      sessionStorage.removeItem(AUTH_ERROR_STORAGE_KEY);
    }
  }, [toast]);

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
    setIsLoading(true);

    try {
      const loginResult = await login(
        email,
        password,
        requiresTwoFactor ? twoFactorCode.trim() : undefined,
        'app'
      );

      if (loginResult.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        setError('Enter your 6-digit authenticator code to continue.');
        toast({
          title: 'Two-factor verification required',
          description: 'Enter your authenticator app code to finish signing in.',
        });
        return;
      }

      setRequiresTwoFactor(false);
      setTwoFactorCode('');
      navigate('/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      toast({
        title: 'Login failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRole = () => {
    setIsTeacher(!isTeacher);
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      await loginWithGoogle(isTeacher ? 'teacher' : 'student');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google login failed';
      setError(message);
      toast({
        title: 'Google login failed',
        description: message,
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col lg:flex-row overflow-hidden">
      <div className="absolute inset-0" aria-hidden="true">
        <img
          src="/backgroundlms.jpg"
          alt=""
          className="h-full w-full object-cover object-center sm:object-[center_35%]"
        />
        <div className="absolute inset-0 bg-slate-950/72" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/70 to-emerald-950/60" />
      </div>

      {/* Left Side - Branding (Hidden on Mobile) */}
      <div className="relative z-10 hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-8">
        {/* Content */}
        <div className="text-center max-w-sm px-8 py-10">
          {/* Logo */}
          <div className={`flex justify-center mb-8 transition-all duration-700 ${showAnimation ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-glow">
              <GraduationCap className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          
          {/* Title */}
          <h1 className={`text-5xl font-bold text-white mb-4 transition-all duration-700 ${showAnimation ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
            Mabini Classroom
          </h1>
          
          {/* Subtitle */}
          <p className={`text-lg text-slate-200 mb-8 transition-all duration-700 ${showAnimation ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{transitionDelay: '100ms'}}>
            Collaborate, learn, and grow together
          </p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="relative z-10 w-full lg:w-1/2 flex flex-col items-center justify-center p-4 lg:p-8 min-h-screen lg:min-h-auto">{/* Logo on Mobile */}
        <div className={`lg:hidden mb-8 flex items-center gap-3 transition-all duration-700 ${showAnimation ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
          <div className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-glow">
            <GraduationCap className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">Mabini Classroom</span>
        </div>

        <div className={`w-full max-w-md transition-all duration-700 ${showAnimation ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`} style={{transitionDelay: '100ms'}}>
          <div className="rounded-2xl border border-white/20 bg-background/90 p-6 lg:p-8 space-y-6 shadow-2xl backdrop-blur-md">{/* Header */}
            <div>
              <h2 className="text-2xl lg:text-3xl font-bold">Welcome back</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Sign in to your account to continue
              </p>
              <span className="mt-3 inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {isTeacher ? 'Teacher Portal' : 'Student Portal'}
              </span>
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <Input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (requiresTwoFactor) {
                      setRequiresTwoFactor(false);
                      setTwoFactorCode('');
                    }
                  }}
                  className="rounded-xl bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 h-11"
                  disabled={isLoading}
                />
              </div>

              <div>
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (requiresTwoFactor) {
                      setRequiresTwoFactor(false);
                      setTwoFactorCode('');
                    }
                  }}
                  className="rounded-xl bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 h-11"
                  disabled={isLoading}
                />
              </div>

              {requiresTwoFactor && (
                <div>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="6-digit authenticator code"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="rounded-xl bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 h-11"
                    disabled={isLoading}
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => setForgotPasswordOpen(true)}
                className="ml-auto block text-xs font-medium text-primary transition-colors hover:text-primary/80 hover:underline underline-offset-4"
              >
                Forgot password?
              </button>

              {error && <div className="text-sm text-destructive text-center bg-destructive/10 p-3 rounded-lg">{error}</div>}

              <Button
                type="submit"
                className="w-full h-11 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={isLoading}
              >
                {isLoading ? 'Signing in...' : requiresTwoFactor ? 'Verify and sign in' : 'Sign in'}
              </Button>
            </form>

            {/* Switch Role */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                You are in <span className="font-semibold text-foreground">{isTeacher ? 'Teacher' : 'Student'}</span> mode.{' '}
                <button
                  onClick={toggleRole}
                  className="text-primary font-semibold cursor-pointer hover:underline transition-colors underline-offset-4"
                >
                  Switch to {isTeacher ? 'Student' : 'Teacher'}
                </button>
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
              onClick={handleGoogleLogin}
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

            {/* Sign Up Link */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                Don't have an account?{' '}
                <button
                  onClick={() => setSignupOpen(true)}
                  className="text-primary font-semibold hover:underline transition-colors underline-offset-4"
                >
                  Sign up
                </button>
              </p>
            </div>
          </div>
        </div>

        <SignupDialog open={signupOpen} onOpenChange={setSignupOpen} isTeacher={isTeacher} />
        <ForgotPasswordDialog
          open={forgotPasswordOpen}
          onOpenChange={setForgotPasswordOpen}
          initialEmail={email}
        />
      </div>
    </div>
  );
}
