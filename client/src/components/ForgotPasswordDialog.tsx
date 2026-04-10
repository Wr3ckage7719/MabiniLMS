import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { KeyRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { authService } from '@/services/auth.service';

interface ForgotPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEmail?: string;
}

export function ForgotPasswordDialog({
  open,
  onOpenChange,
  initialEmail = '',
}: ForgotPasswordDialogProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState(initialEmail);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setEmail(initialEmail);
      setError('');
    }
  }, [open, initialEmail]);

  const validateEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    try {
      await authService.forgotPassword(email.trim().toLowerCase());

      toast({
        title: 'Reset link sent',
        description: `If ${email} exists, a password reset link has been sent.`,
      });

      onOpenChange(false);
    } catch (submitError: any) {
      const responseMessage = submitError?.response?.data?.error?.message || submitError?.response?.data?.message;
      setError(responseMessage || submitError?.message || 'Failed to send reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden rounded-3xl border border-border/70 bg-background/95 p-0 shadow-2xl backdrop-blur-md sm:max-w-md">
        <div className="bg-gradient-to-r from-primary/12 via-primary/5 to-transparent px-6 pb-4 pt-6">
          <DialogHeader className="space-y-3 text-left">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              Account Recovery
            </span>
            <DialogTitle className="text-2xl font-bold">Reset your password</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
              Enter your email and we will send a password reset link.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-6 pt-5">
          <div className="space-y-2">
            <Label htmlFor="forgot-password-email">Email Address</Label>
            <Input
              id="forgot-password-email"
              type="email"
              placeholder="name@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError('');
              }}
              className="h-11 rounded-xl border border-border/60 bg-secondary/40 focus-visible:ring-1 focus-visible:ring-primary/30"
              disabled={isLoading}
            />
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-11 rounded-xl"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="h-11 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={isLoading}
            >
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
