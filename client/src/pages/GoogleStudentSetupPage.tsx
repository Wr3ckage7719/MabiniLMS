import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { AppLogo } from '@/components/AppLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { authService } from '@/services/auth.service';

const passwordPolicy = {
  minLength: 8,
  uppercase: /[A-Z]/,
  digit: /[0-9]/,
  special: /[^A-Za-z0-9]/,
};

const normalizeName = (value: string): string => value.trim().replace(/\s+/g, ' ');

const isValidPassword = (value: string): boolean => {
  return (
    value.length >= passwordPolicy.minLength &&
    passwordPolicy.uppercase.test(value) &&
    passwordPolicy.digit.test(value) &&
    passwordPolicy.special.test(value)
  );
};

export default function GoogleStudentSetupPage() {
  const { user, isLoggedIn, isLoading, logout } = useAuth();
  const { toast } = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const suggestedName = useMemo(() => {
    const fullName = (user?.name || '').trim();
    if (!fullName) {
      return { first: '', last: '' };
    }

    const [firstToken, ...restTokens] = fullName.split(' ').filter(Boolean);
    return {
      first: firstToken || '',
      last: restTokens.join(' '),
    };
  }, [user?.name]);

  useEffect(() => {
    if (!firstName) {
      setFirstName(suggestedName.first);
    }

    if (!lastName) {
      setLastName(suggestedName.last);
    }
  }, [suggestedName, firstName, lastName]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  const role = (user?.role || '').toLowerCase();
  if (role !== 'student') {
    return <Navigate to="/dashboard" replace />;
  }

  if (!user?.requiresGoogleStudentSetup) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const normalizedFirstName = normalizeName(firstName);
    const normalizedLastName = normalizeName(lastName);

    if (!normalizedFirstName || !normalizedLastName) {
      setError('First name and last name are required.');
      return;
    }

    if (!isValidPassword(password)) {
      setError('Password must be at least 8 characters and include uppercase, number, and special character.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Password and confirmation do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      await authService.completeGoogleStudentOnboarding(
        normalizedFirstName,
        normalizedLastName,
        password
      );

      toast({
        title: 'Account setup complete',
        description: 'Your student account now supports both Google and email/password sign-in.',
      });

      window.location.replace('/dashboard');
    } catch (submitError) {
      const message = submitError instanceof Error
        ? submitError.message
        : 'Unable to complete account setup. Please try again.';
      setError(message);
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    window.location.replace('/login');
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0" aria-hidden="true">
        <img
          src="/backgroundlms.jpg"
          alt=""
          className="h-full w-full object-cover object-center sm:object-[center_35%]"
        />
        <div className="absolute inset-0 bg-slate-950/75" />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-slate-900/75 to-emerald-950/70" />
      </div>

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="grid w-full gap-8 lg:grid-cols-[1fr_460px]">
          <section className="hidden rounded-3xl border border-white/15 bg-white/5 p-8 backdrop-blur-sm lg:block">
            <div className="mb-6 flex items-center gap-3 text-white">
              <AppLogo className="h-12 w-12" />
              <p className="text-xl font-semibold tracking-tight">Mabini Classroom</p>
            </div>
            <h1 className="text-4xl font-bold leading-tight text-white">Finish your student account setup</h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-200">
              This is a one-time setup after your first Google sign-in. Confirm your name and create a password so you can also log in without Google.
            </p>
          </section>

          <section className="rounded-3xl border border-white/20 bg-background/95 p-6 shadow-2xl backdrop-blur-md sm:p-8">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <AppLogo className="h-10 w-10" />
              <p className="text-lg font-semibold tracking-tight">Mabini Classroom</p>
            </div>

            <h2 className="text-2xl font-bold">Set up your account</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Create your account password and verify your student profile name.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="google-student-first-name">First Name</Label>
                  <Input
                    id="google-student-first-name"
                    value={firstName}
                    onChange={(event) => {
                      setFirstName(event.target.value);
                      if (error) setError('');
                    }}
                    placeholder="First name"
                    className="h-11 rounded-xl"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="google-student-last-name">Last Name</Label>
                  <Input
                    id="google-student-last-name"
                    value={lastName}
                    onChange={(event) => {
                      setLastName(event.target.value);
                      if (error) setError('');
                    }}
                    placeholder="Last name"
                    className="h-11 rounded-xl"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="google-student-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="google-student-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (error) setError('');
                    }}
                    placeholder="Create password"
                    className="h-11 rounded-xl pr-10"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use at least 8 characters with one uppercase letter, one number, and one special character.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="google-student-confirm-password">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="google-student-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      if (error) setError('');
                    }}
                    placeholder="Confirm password"
                    className="h-11 rounded-xl pr-10"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <div className="grid gap-2 pt-1 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={handleSignOut}
                  disabled={isSubmitting}
                >
                  Sign out
                </Button>
                <Button
                  type="submit"
                  className="h-11 rounded-xl"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Completing setup...' : 'Complete setup'}
                </Button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
