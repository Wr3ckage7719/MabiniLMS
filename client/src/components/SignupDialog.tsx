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
import { Eye, EyeOff } from 'lucide-react';

interface SignupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isTeacher: boolean;
}

const STUDENT_INSTITUTIONAL_DOMAIN = 'mabinicolleges.edu.ph';

export function SignupDialog({ open, onOpenChange, isTeacher }: SignupDialogProps) {
  const { register, requestStudentSignup } = useAuth();
  const { toast } = useToast();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStudentSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Institutional email is required');
      return;
    }

    if (!normalizedEmail.endsWith(`@${STUDENT_INSTITUTIONAL_DOMAIN}`)) {
      setError(`Use your institutional email (@${STUDENT_INSTITUTIONAL_DOMAIN})`);
      return;
    }

    setIsLoading(true);

    try {
      const signupMessage = await requestStudentSignup(normalizedEmail);

      toast({
        title: 'Signup Request Processed',
        description: signupMessage,
      });

      resetForm();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request credentials');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTeacherSignup = async (e: React.FormEvent) => {
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

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Email is required');
      return;
    }

    setIsLoading(true);

    try {
      await register(normalizedEmail, password, fullName, 'teacher');
      
      // Reset form and close dialog
      resetForm();
      onOpenChange(false);
      
      toast({
        title: 'Teacher account submitted',
        description: 'Please wait for admin verification before signing in.',
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
    setFullName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setError('');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{isTeacher ? 'Create Teacher Account' : 'Student Sign-up'}</DialogTitle>
          <DialogDescription>
            {isTeacher
              ? 'Register your teacher account. Admin approval may be required before access.'
              : `Enter your institutional email (@${STUDENT_INSTITUTIONAL_DOMAIN}). We will send an account setup email so you can sign in with your password.`}
          </DialogDescription>
          <div className="pt-2">
            <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
              {isTeacher ? 'Teacher Sign-up' : 'Student Sign-up'}
            </span>
          </div>
        </DialogHeader>

        {!isTeacher ? (
          <form onSubmit={handleStudentSignup} className="space-y-4">
            <div>
              <Input
                type="email"
                placeholder={`name@${STUDENT_INSTITUTIONAL_DOMAIN}`}
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
              {isLoading ? 'Requesting...' : 'Send Account Setup Email'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleTeacherSignup} className="space-y-4">
            <div>
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl bg-secondary/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 h-11"
                disabled={isLoading}
              />
            </div>

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
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password (min 8 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 rounded-xl border-0 bg-secondary/50 pr-10 focus-visible:ring-1 focus-visible:ring-primary/30"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <div className="relative">
                <Input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-11 rounded-xl border-0 bg-secondary/50 pr-10 focus-visible:ring-1 focus-visible:ring-primary/30"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  disabled={isLoading}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && <div className="text-sm text-destructive text-center">{error}</div>}

            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-medium bg-foreground text-background hover:bg-foreground/90"
              disabled={isLoading}
            >
              {isLoading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
