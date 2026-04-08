import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Lock, AlertCircle, CheckCircle } from 'lucide-react';

interface FirstLoginPasswordChangeProps {
  open: boolean;
  userId: string;
  onComplete: () => void;
}

export default function FirstLoginPasswordChange({ 
  open, 
  userId, 
  onComplete 
}: FirstLoginPasswordChangeProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const passwordRequirements = [
    { label: 'At least 8 characters', met: newPassword.length >= 8 },
    { label: 'Contains a number', met: /\d/.test(newPassword) },
    { label: 'Contains uppercase letter', met: /[A-Z]/.test(newPassword) },
    { label: 'Passwords match', met: newPassword === confirmPassword && newPassword.length > 0 },
  ];

  const allRequirementsMet = passwordRequirements.every(r => r.met);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!allRequirementsMet) {
      setError('Please meet all password requirements');
      return;
    }

    setIsLoading(true);

    try {
      // Update password via Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      // Mark temporary password as used
      await supabase
        .from('temporary_passwords')
        .update({ used_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('used_at', null);

      onComplete();
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Change Your Password</DialogTitle>
          <DialogDescription className="text-center">
            For security, you must change your temporary password before continuing.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              disabled={isLoading}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              disabled={isLoading}
            />
          </div>

          {/* Password Requirements */}
          <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
            <p className="text-xs font-medium text-muted-foreground">Password Requirements:</p>
            {passwordRequirements.map((req, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                {req.met ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                )}
                <span className={req.met ? 'text-green-600' : 'text-muted-foreground'}>
                  {req.label}
                </span>
              </div>
            ))}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            disabled={isLoading || !allRequirementsMet}
            className="w-full"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update Password
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
