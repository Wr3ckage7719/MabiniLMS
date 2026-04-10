import { useEffect, useState } from 'react';
import { Mail, Clock, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useClasses } from '@/contexts/ClassesContext';
import { useAuth } from '@/contexts/AuthContext';

export function StudentInvitations() {
  const { user } = useAuth();
  const {
    getStudentInvitations,
    acceptInvitation,
    declineInvitation,
    refreshInvitations,
    invitationsLoading,
  } = useClasses();
  const [processingInvitationId, setProcessingInvitationId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void refreshInvitations();
  }, [refreshInvitations, user?.id]);

  if (!user) return null;

  const invitations = getStudentInvitations(user.email);

  if (!invitationsLoading && invitations.length === 0) return null;

  const pendingInvitations = invitations.filter(inv => inv.status === 'pending');

  if (!invitationsLoading && pendingInvitations.length === 0) return null;

  const handleAccept = async (invitationId: string) => {
    setProcessingInvitationId(invitationId);
    try {
      await acceptInvitation(invitationId);
    } finally {
      setProcessingInvitationId(null);
    }
  };

  const handleDecline = async (invitationId: string) => {
    setProcessingInvitationId(invitationId);
    try {
      await declineInvitation(invitationId);
    } finally {
      setProcessingInvitationId(null);
    }
  };

  return (
    <Card className="border-0 shadow-sm mb-6 bg-gradient-to-r from-blue-50 to-blue-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-5 w-5 text-blue-600" />
          Class Invitations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {invitationsLoading && pendingInvitations.length === 0 && (
          <p className="text-sm text-muted-foreground">Loading invitations...</p>
        )}
        {pendingInvitations.map((invitation) => {
          const isProcessing = processingInvitationId === invitation.id;

          return (
            <div
              key={invitation.id}
              className="flex items-center justify-between p-4 bg-white rounded-lg border border-blue-100 hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="flex-shrink-0">
                  <Clock className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="font-medium text-sm">{invitation.className || 'Unknown Class'}</p>
                  <p className="text-xs text-muted-foreground">
                    Teacher invited you to join
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 ml-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void handleDecline(invitation.id);
                  }}
                  disabled={isProcessing}
                  className="rounded-lg h-9"
                >
                  <X className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">Decline</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    void handleAccept(invitation.id);
                  }}
                  disabled={isProcessing}
                  className="rounded-lg h-9 bg-green-600 hover:bg-green-700"
                >
                  <Check className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">Accept</span>
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
