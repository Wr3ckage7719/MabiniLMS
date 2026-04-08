import { useAuth } from '@/contexts/AuthContext';
import { Clock, Mail, CheckCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function PendingApprovalOverlay() {
  const { user } = useAuth();

  // Only show for teachers with pending approval
  if (!user || user.role !== 'teacher' || !user.pending_approval) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center space-y-6 shadow-xl">
        {/* Clock Icon */}
        <div className="mx-auto w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <Clock className="w-10 h-10 text-amber-600 dark:text-amber-400" />
        </div>

        {/* Title */}
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Account Pending Approval
          </h2>
          <p className="text-muted-foreground">
            Your teacher account is currently being reviewed by an administrator.
          </p>
        </div>

        {/* What's Happening */}
        <div className="bg-muted/50 rounded-lg p-4 text-left space-y-3">
          <h3 className="font-semibold text-sm text-foreground">What happens next?</h3>
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-1 mt-0.5">
                <CheckCircle className="w-3 h-3 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                An administrator will verify your identity
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-1 mt-0.5">
                <Mail className="w-3 h-3 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                You'll receive an email once your account is approved
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-1 mt-0.5">
                <CheckCircle className="w-3 h-3 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                After approval, you can create classes and manage students
              </p>
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <p className="text-xs text-muted-foreground">
          If you have questions, please contact your school administrator.
        </p>

        {/* Account Info */}
        <div className="pt-4 border-t text-sm text-muted-foreground">
          Signed in as: <span className="font-medium text-foreground">{user.email}</span>
        </div>
      </Card>
    </div>
  );
}
