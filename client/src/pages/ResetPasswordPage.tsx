import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { authService } from '@/services/auth.service';

const MIN_PASSWORD_LENGTH = 8;

const getErrorMessage = (error: unknown): string => {
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

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validationMessage = useMemo(() => {
    if (!password) {
      return '';
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }

    if (password !== confirmPassword) {
      return 'Passwords do not match.';
    }

    return '';
  }, [password, confirmPassword]);

  const canSubmit = Boolean(token) && password.length >= MIN_PASSWORD_LENGTH && password === confirmPassword && !isSubmitting;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!token) {
      setError('Reset token is missing. Please use the latest reset link from your email.');
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      await authService.resetPassword(token, password);
      setSuccessMessage('Password reset successful. You can now sign in with your new password.');

      setTimeout(() => {
        navigate('/login');
      }, 1200);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border bg-background/80 backdrop-blur p-6 md:p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">Reset Your Password</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Enter a new password for your account.
          </p>
        </div>

        {!token && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This reset link is missing a token. Please request a new password reset email.
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

          {validationMessage && !error && !successMessage && (
            <p className="text-sm text-muted-foreground">{validationMessage}</p>
          )}

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Resetting Password...' : 'Reset Password'}
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
