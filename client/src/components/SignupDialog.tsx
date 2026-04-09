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

const STUDENT_INSTITUTIONAL_DOMAIN = 'mabinicolleges.edu.ph';

export function SignupDialog({ open, onOpenChange, isTeacher }: SignupDialogProps) {
  const { register, requestStudentSignup } = useAuth();
  const { toast } = useToast();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
      await requestStudentSignup(normalizedEmail);

      toast({
        title: 'Credentials Sent',
        description: 'Check your institutional inbox for your temporary login credentials.',
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

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
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
        title: 'Account Created',
        description: 'Your teacher account was created. Login access depends on admin approval.',
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
              : `Enter your institutional email (@${STUDENT_INSTITUTIONAL_DOMAIN}). We will send temporary credentials to your inbox.`}
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
              {isLoading ? 'Requesting...' : 'Send My Credentials'}
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
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
