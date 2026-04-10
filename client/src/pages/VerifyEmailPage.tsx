import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { authService } from '@/services/auth.service';

type VerificationStatus = 'loading' | 'success' | 'error';

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

  return 'Unable to verify your email right now. Please try again later.';
};

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<VerificationStatus>('loading');
  const [message, setMessage] = useState('Verifying your email...');
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [resendError, setResendError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Verification token is missing. Please use the latest verification email.');
      return;
    }

    const verify = async () => {
      setStatus('loading');
      setMessage('Verifying your email...');

      try {
        await authService.verifyEmail(token);
        setStatus('success');
        setMessage('Your email has been verified successfully. You can now sign in.');
      } catch (error) {
        setStatus('error');
        setMessage(getErrorMessage(error));
      }
    };

    void verify();
  }, [token]);

  const handleResend = async (event: React.FormEvent) => {
    event.preventDefault();
    setResendMessage('');
    setResendError('');

    const normalizedEmail = resendEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setResendError('Enter your email address to resend the verification link.');
      return;
    }

    setResendLoading(true);
    try {
      await authService.resendVerification(normalizedEmail);
      setResendMessage('Verification email sent. Please check your inbox.');
    } catch (error) {
      setResendError(getErrorMessage(error));
    } finally {
      setResendLoading(false);
    }
  };

  const isLoading = status === 'loading';
  const isSuccess = status === 'success';

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border bg-background/85 backdrop-blur p-6 md:p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            {isLoading && <Loader2 className="h-6 w-6 text-primary animate-spin" />}
            {isSuccess && <CheckCircle2 className="h-6 w-6 text-emerald-600" />}
            {!isLoading && !isSuccess && <AlertCircle className="h-6 w-6 text-amber-600" />}
          </div>
          <h1 className="text-2xl font-semibold">Email Verification</h1>
          <p className="text-sm text-muted-foreground mt-2">{message}</p>
        </div>

        {isSuccess ? (
          <Button asChild className="w-full">
            <Link to="/login">Continue to Login</Link>
          </Button>
        ) : (
          <>
            {!isLoading && (
              <form onSubmit={handleResend} className="space-y-3">
                <label className="text-sm font-medium" htmlFor="resend-email">
                  Resend verification email
                </label>
                <Input
                  id="resend-email"
                  type="email"
                  placeholder="you@example.com"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  disabled={resendLoading}
                />

                {resendError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{resendError}</AlertDescription>
                  </Alert>
                )}

                {resendMessage && (
                  <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700">
                    <Mail className="h-4 w-4" />
                    <AlertDescription>{resendMessage}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={resendLoading}>
                  {resendLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {resendLoading ? 'Sending...' : 'Resend Verification Email'}
                </Button>
              </form>
            )}

            <p className="text-center text-sm text-muted-foreground mt-6">
              Back to{' '}
              <Link to="/login" className="text-primary hover:underline">
                Login
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
