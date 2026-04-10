import { useState } from 'react';
import { Mail, Check, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useClasses } from '@/contexts/ClassesContext';

interface InviteStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
}

export function InviteStudentDialog({
  open,
  onOpenChange,
  classId,
}: InviteStudentDialogProps) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(null);
  const { sendInvitation } = useClasses();

  const className = classId ? `Class ${classId.toUpperCase()}` : 'Class';

  const validateEmail = (emailToValidate: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(emailToValidate);
  };

  const handleSendInvitation = async () => {
    if (!email.trim()) {
      setMessage('Please enter an email address');
      setMessageType('error');
      return;
    }

    if (!validateEmail(email)) {
      setMessage('Please enter a valid email address');
      setMessageType('error');
      return;
    }

    setIsLoading(true);
    try {
      await sendInvitation(classId, email, className);
      setMessage('Invitation sent successfully!');
      setMessageType('success');
      
      setTimeout(() => {
        setEmail('');
        setMessage('');
        setMessageType(null);
        onOpenChange(false);
      }, 2000);
    } catch (error) {
      setMessage('Failed to send invitation');
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setMessage('');
    setMessageType(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Invite Student to {className}
          </DialogTitle>
          <DialogDescription>
            Enter the student's email address to send them an invitation to join the class.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Student Email
            </label>
            <Input
              type="email"
              placeholder="student@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (message) {
                  setMessage('');
                  setMessageType(null);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isLoading && messageType !== 'success') {
                  handleSendInvitation();
                }
              }}
              disabled={isLoading}
              className="rounded-lg"
            />
          </div>

          {message && (
            <div
              className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                messageType === 'success'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {messageType === 'success' ? (
                <Check className="h-4 w-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
              )}
              <span>{message}</span>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendInvitation}
              disabled={isLoading || !email.trim()}
              className="rounded-lg"
            >
              {isLoading ? 'Sending...' : 'Send Invitation'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
