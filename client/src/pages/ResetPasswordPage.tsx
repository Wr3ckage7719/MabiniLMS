import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { authService } from '@/services/auth.service';

const MIN_PASSWORD_LENGTH = 8;
const HAS_UPPERCASE_REGEX = /[A-Z]/;
const HAS_DIGIT_REGEX = /[0-9]/;
const HAS_SPECIAL_REGEX = /[^A-Za-z0-9]/;

const extractFieldValidationMessages = (error: unknown): string[] => {
  if (typeof error !== 'object' || error === null) {
    return [];
  }

  const maybeAxios = error as {
    response?: {
      data?: {
        error?: {
          metadata?: {
            fields?: Record<string, string[] | string>;
          };
        };
      };
    };
  };

  const fields = maybeAxios.response?.data?.error?.metadata?.fields;
  if (!fields || typeof fields !== 'object') {
    return [];
  }

  const messages: string[] = [];
  Object.values(fields).forEach((fieldErrors) => {
    if (Array.isArray(fieldErrors)) {
      fieldErrors.forEach((fieldError) => {
        if (typeof fieldError === 'string' && fieldError.trim().length > 0) {
          messages.push(fieldError.trim());
        }
      });
      return;
    }

    if (typeof fieldErrors === 'string' && fieldErrors.trim().length > 0) {
      messages.push(fieldErrors.trim());
    }
  });

  return messages;
};

const getErrorMessage = (error: unknown): string => {
  const fieldMessages = extractFieldValidationMessages(error);
  if (fieldMessages.length > 0) {
    return fieldMessages[0];
  }

  if (typeof error === 'object' && error !== null) {
    const maybeAxios = error as {
      response?: { data?: { error?: { message?: string }; message?: string } };
      message?: string;
    };

    const responseMessage = maybeAxios.response?.data?.error?.message || maybeAxios.response?.data?.message;
    if (responseMessage) {
      return responseMessage;
    }

    if (maybeAxios.message) {
      return maybeAxios.message;
    }
  }

  return 'Failed to reset password. Please try again.';
};

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const flow = (searchParams.get('flow') || '').trim().toLowerCase();
  const isStudentSignupFlow = flow === 'student-signup';
  const isTeacherOnboardingFlow = flow === 'teacher-onboarding';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasMinLength = password.length >= MIN_PASSWORD_LENGTH;
  const hasUppercase = HAS_UPPERCASE_REGEX.test(password);
  const hasDigit = HAS_DIGIT_REGEX.test(password);
  const hasSpecialCharacter = HAS_SPECIAL_REGEX.test(password);
  const passwordsMatch = password === confirmPassword;

  const passwordChecks = useMemo(
    () => [
      { label: `At least ${MIN_PASSWORD_LENGTH} characters`, met: hasMinLength },
      { label: 'At least one uppercase letter (A-Z)', met: hasUppercase },
      { label: 'At least one number (0-9)', met: hasDigit },
      { label: 'At least one special character', met: hasSpecialCharacter },
    ],
    [hasDigit, hasMinLength, hasSpecialCharacter, hasUppercase]
  );

  const allPasswordRequirementsMet = passwordChecks.every((check) => check.met);

  const validationMessage = useMemo(() => {
    if (!password) {
      return '';
    }

    if (!allPasswordRequirementsMet) {
      return 'Please complete all password requirements above.';
    }

    if (!passwordsMatch) {
      return 'Passwords do not match.';
    }

    return '';
  }, [allPasswordRequirementsMet, password, passwordsMatch]);

  const hasStudentNames = firstName.trim().length > 0 && lastName.trim().length > 0;

  const canSubmit =
    Boolean(token) &&
    allPasswordRequirementsMet &&
    passwordsMatch &&
    (!isStudentSignupFlow || hasStudentNames) &&
    !isSubmitting;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!token) {
      setError('Reset token is missing. Please use the latest reset link from your email.');
      return;
    }

    if (isStudentSignupFlow && !hasStudentNames) {
      setError('First name and last name are required to activate your student account.');
      return;
    }

    if (!allPasswordRequirementsMet) {
      setError('Please complete all password requirements before continuing.');
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (isStudentSignupFlow) {
        await authService.completeStudentSignup(token, password, firstName.trim(), lastName.trim());
        setSuccessMessage('Account setup complete. You can now sign in as a student.');
      } else if (isTeacherOnboardingFlow) {
        await authService.completeTeacherOnboarding(token, password);
        setSuccessMessage('Teacher onboarding complete. You can now sign in.');
      } else {
        await authService.resetPassword(token, password);
        setSuccessMessage('Password reset successful. You can now sign in with your new password.');
      }

      setTimeout(() => {
        navigate('/login');
      }, 1200);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = isStudentSignupFlow
    ? 'Complete Your Student Account'
    : isTeacherOnboardingFlow
      ? 'Complete Teacher Onboarding'
      : 'Reset Your Password';

  const subtitle = isStudentSignupFlow
    ? 'Create a secure password to activate your student account.'
    : isTeacherOnboardingFlow
      ? 'Create a secure password to finish teacher onboarding.'
      : 'Enter a new secure password for your account.';

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border bg-background/80 backdrop-blur p-6 md:p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground mt-2">{subtitle}</p>
        </div>

        <div className="mb-4 rounded-xl border border-border/60 bg-secondary/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Instructions</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
            {isStudentSignupFlow && <li>Enter your first and last name exactly as you want it displayed.</li>}
            <li>Create a password that meets all requirements below.</li>
            <li>Re-enter the same password in Confirm Password.</li>
            <li>Submit to finish account setup and continue to login.</li>
          </ol>
        </div>

        {!token && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This setup link is missing a token. Please request a new email link.
            </AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert className="mb-4 border-emerald-500/40 bg-emerald-500/10 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isStudentSignupFlow && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="student-first-name">First Name</Label>
                <Input
                  id="student-first-name"
                  type="text"
                  autoComplete="given-name"
                  placeholder="First name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="student-last-name">Last Name</Label>
                <Input
                  id="student-last-name"
                  type="text"
                  autoComplete="family-name"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="rounded-xl border border-border/60 bg-secondary/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Password Requirements</p>
            <div className="space-y-1.5">
              {passwordChecks.map((check) => (
                <div key={check.label} className="flex items-center gap-2 text-xs">
                  {check.met ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className={check.met ? 'text-emerald-600' : 'text-muted-foreground'}>{check.label}</span>
                </div>
              ))}
            </div>
          </div>

          {validationMessage && !error && !successMessage && (
            <p className="text-sm text-muted-foreground">{validationMessage}</p>
          )}

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting
              ? 'Submitting...'
              : isStudentSignupFlow
                ? 'Activate Student Account'
                : isTeacherOnboardingFlow
                  ? 'Finish Teacher Onboarding'
                  : 'Reset Password'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Remembered your password?{' '}
          <Link to="/login" className="text-primary hover:underline">
            Back to Login
          </Link>
        </p>
      </div>
    </div>
  );
}
