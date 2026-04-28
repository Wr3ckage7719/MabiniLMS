import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [driveAccessAcknowledged, setDriveAccessAcknowledged] = useState(false);

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

    if (!driveAccessAcknowledged) {
      setError('Please acknowledge the Google Drive access notice to continue.');
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
    if (!fullName) {
      setError('All fields are required');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Email is required');
      return;
    }

    setIsLoading(true);

    try {
      await register(normalizedEmail, '', fullName, 'teacher');
      
      // Reset form and close dialog
      resetForm();
      onOpenChange(false);
      
      toast({
        title: 'Teacher account submitted',
        description: 'Verify your email first, then wait for admin approval. You will set your password after approval.',
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
    setError('');
    setDriveAccessAcknowledged(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{isTeacher ? 'Create Teacher Account' : 'Student Sign-up'}</DialogTitle>
          <DialogDescription>
            {isTeacher
              ? 'Submit your teacher application. You will verify your email first, then complete password setup only after admin approval.'
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

            <label className="flex items-start gap-2 text-xs text-muted-foreground select-none">
              <Checkbox
                checked={driveAccessAcknowledged}
                onCheckedChange={(checkedState) => setDriveAccessAcknowledged(checkedState === true)}
                disabled={isLoading}
                aria-label="Acknowledge Google Drive access notice"
              />
              <span>
                I acknowledge that when I submit activities, my teacher will be granted access to the
                Google Drive file I submit. This helps reduce access denied errors.
              </span>
            </label>

            {error && <div className="text-sm text-destructive text-center">{error}</div>}

            <Button
              type="submit"
              className="w-full h-11 rounded-xl font-medium bg-foreground text-background hover:bg-foreground/90"
              disabled={isLoading || !driveAccessAcknowledged}
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
              <p className="text-sm text-muted-foreground">
                Password setup happens after approval through a one-time onboarding link sent to your email.
              </p>
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
