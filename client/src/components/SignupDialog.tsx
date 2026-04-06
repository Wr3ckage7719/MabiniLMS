import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface SignupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isTeacher: boolean;
}

type SignupStep = 'email' | 'verify' | 'details';

export function SignupDialog({ open, onOpenChange, isTeacher }: SignupDialogProps) {
  const { register, login } = useAuth();
  const { toast } = useToast();
  
  // Form state
  const [step, setStep] = useState<SignupStep>('email');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Verification state
  const [sentCode, setSentCode] = useState<string>('');
  const [codeResendCount, setCodeResendCount] = useState(0);

  // Helper function to generate a random verification code
  const generateVerificationCode = () => {
    return Math.random().toString().slice(2, 8);
  };

  // Step 1: Send verification code to email
  const handleSendVerificationCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Email is required');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);

    try {
      // Generate and store verification code
      const code = generateVerificationCode();
      setSentCode(code);
      setCodeResendCount(0);
      setVerificationCode('');

      // Simulate sending email
      toast({
        title: 'Verification Code Sent',
        description: `A verification code has been sent to ${email}. (Test code: ${code})`,
      });

      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send verification code');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify the code entered by user
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!verificationCode) {
      setError('Verification code is required');
      return;
    }

    if (verificationCode !== sentCode) {
      setError('Verification code is incorrect');
      return;
    }

    try {
      setStep('details');
      setVerificationCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    }
  };

  // Helper function to resend code
  const handleResendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (codeResendCount >= 3) {
      setError('Maximum resend attempts reached. Please try again later.');
      return;
    }

    setIsLoading(true);

    try {
      const code = generateVerificationCode();
      setSentCode(code);
      setVerificationCode('');
      setCodeResendCount(codeResendCount + 1);

      toast({
        title: 'Code Resent',
        description: `A new verification code has been sent to ${email}. (Test code: ${code})`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Create account with verified email
  const handleCompleteSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!fullName || !password || !confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);

    try {
      // Register the account first
      await register(email, password, fullName);
      
      // Then log the user in
      await login(email, password);
      
      // Reset form and close dialog
      resetForm();
      onOpenChange(false);
      
      toast({
        title: 'Account Created',
        description: 'Welcome to Mabini Classroom!',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset all form fields when closing dialog
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const resetForm = () => {
    setStep('email');
    setFullName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setVerificationCode('');
    setError('');
    setSentCode('');
    setCodeResendCount(0);
  };

  const handleBackToEmail = () => {
    setStep('email');
    setVerificationCode('');
    setError('');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {step === 'email' && 'Create your account'}
            {step === 'verify' && 'Verify your email'}
            {step === 'details' && 'Set up your profile'}
          </DialogTitle>
          <DialogDescription>
            {step === 'email' && 'Enter your email to get started'}
            {step === 'verify' && `We've sent a code to ${email}`}
            {step === 'details' && 'Complete your profile to finish signing up'}
          </DialogDescription>
          <div className="pt-2">
            <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
              {isTeacher ? 'Teacher Sign-up' : 'Student Sign-up'}
            </span>
          </div>
        </DialogHeader>

        {/* Step 1: Email Verification */}
        {step === 'email' && (
          <form onSubmit={handleSendVerificationCode} className="space-y-4">
            <div>
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 h-11"
                disabled={isLoading}
              />
            </div>

            {error && <div className="text-sm text-destructive text-center">{error}</div>}

            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-medium bg-foreground text-background hover:bg-foreground/90"
              disabled={isLoading}
            >
              {isLoading ? 'Sending...' : 'Send Verification Code'}
            </Button>
          </form>
        )}

        {/* Step 2: Code Verification */}
        {step === 'verify' && (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div>
              <Input
                type="text"
                placeholder="Enter 6-digit code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.slice(0, 6))}
                className="rounded-xl bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 h-11 text-center tracking-widest"
                disabled={isLoading}
                maxLength={6}
              />
            </div>

            {error && <div className="text-sm text-destructive text-center">{error}</div>}

            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-medium bg-foreground text-background hover:bg-foreground/90"
              disabled={isLoading}
            >
              {isLoading ? 'Verifying...' : 'Verify Code'}
            </Button>

            <div className="flex gap-2 text-sm">
              <button
                type="button"
                onClick={handleBackToEmail}
                className="flex-1 px-4 py-2 rounded-xl border text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50"
                disabled={isLoading}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleResendCode}
                className="flex-1 px-4 py-2 rounded-xl border text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50"
                disabled={isLoading || codeResendCount >= 3}
              >
                {isLoading ? 'Sending...' : `Resend${codeResendCount > 0 ? ` (${3 - codeResendCount})` : ''}`}
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Account Details */}
        {step === 'details' && (
          <form onSubmit={handleCompleteSignup} className="space-y-4">
            <div>
              <Input
                type="text"
                placeholder="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="rounded-xl bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 h-11"
                disabled={isLoading}
              />
            </div>

            <div>
              <Input
                type="password"
                placeholder="Password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 h-11"
                disabled={isLoading}
              />
            </div>

            <div>
              <Input
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="rounded-xl bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 h-11"
                disabled={isLoading}
              />
            </div>

            {error && <div className="text-sm text-destructive text-center">{error}</div>}

            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-medium bg-foreground text-background hover:bg-foreground/90"
              disabled={isLoading}
            >
              {isLoading ? 'Creating account...' : 'Create Account'}
            </Button>

            <button
              type="button"
              onClick={handleBackToEmail}
              className="w-full px-4 py-2 rounded-xl border text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50"
              disabled={isLoading}
            >
              Back
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
