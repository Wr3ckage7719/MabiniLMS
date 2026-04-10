import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Mail, Check, AlertCircle, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useClasses } from '@/contexts/ClassesContext';
import type { DirectEnrollmentResult } from '@/services/invitations.service';

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
  const queryClient = useQueryClient();
  const [emailsInput, setEmailsInput] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messageType, setMessageType] = useState<'success' | 'error' | null>(null);
  const [results, setResults] = useState<DirectEnrollmentResult[]>([]);
  const { directEnrollStudentsByEmail } = useClasses();

  const className = classId ? `Class ${classId.toUpperCase()}` : 'Class';

  const parseEmails = (rawInput: string): string[] => {
    return rawInput
      .split(/[\n,;]+/)
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0);
  };

  const getErrorMessage = (error: unknown): string => {
    if (!error || typeof error !== 'object') {
      return 'Failed to enroll students by email.';
    }

    const axiosLike = error as {
      response?: {
        data?: {
          error?: { message?: string };
          message?: string;
        };
      };
      message?: string;
    };

    return (
      axiosLike.response?.data?.error?.message ||
      axiosLike.response?.data?.message ||
      axiosLike.message ||
      'Failed to enroll students by email.'
    );
  };

  const getResultBadgeClasses = (status: DirectEnrollmentResult['status']): string => {
    switch (status) {
      case 'enrolled':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'already_enrolled':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-red-100 text-red-800 border-red-200';
    }
  };

  const getStatusLabel = (status: DirectEnrollmentResult['status']): string => {
    switch (status) {
      case 'enrolled':
        return 'Enrolled';
      case 'already_enrolled':
        return 'Already Enrolled';
      case 'invalid_domain':
        return 'Invalid Domain';
      case 'student_not_found':
        return 'Student Not Found';
      case 'not_student':
        return 'Not a Student';
      default:
        return 'Failed';
    }
  };

  const handleDirectEnroll = async () => {
    const parsedEmails = parseEmails(emailsInput);

    if (parsedEmails.length === 0) {
      setMessage('Enter at least one student email address.');
      setMessageType('error');
      return;
    }

    setIsLoading(true);
    try {
      const response = await directEnrollStudentsByEmail(classId, parsedEmails);
      setResults(response.results);

      if (response.enrolled > 0) {
        await queryClient.invalidateQueries({ queryKey: ['students', classId] });
      }

      const summary = `${response.enrolled} enrolled, ${response.already_enrolled} already enrolled, ${response.failed} failed.`;

      if (response.failed > 0) {
        setMessage(summary);
        setMessageType('error');
      } else {
        setMessage(summary);
        setMessageType('success');
      }
    } catch (error) {
      setMessage(getErrorMessage(error));
      setMessageType('error');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setEmailsInput('');
    setMessage('');
    setMessageType(null);
    setResults([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Enroll Students to {className}
          </DialogTitle>
          <DialogDescription>
            Enter one or more institutional student emails. Separate with commas or new lines.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Student Emails
            </label>
            <Textarea
              placeholder="student1@mabinicolleges.edu.ph\nstudent2@mabinicolleges.edu.ph"
              value={emailsInput}
              onChange={(e) => {
                setEmailsInput(e.target.value);
                if (message) {
                  setMessage('');
                  setMessageType(null);
                }
                if (results.length > 0) {
                  setResults([]);
                }
              }}
              disabled={isLoading}
              className="rounded-lg min-h-[110px]"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Direct enrollment only supports student accounts with @mabinicolleges.edu.ph.
            </p>
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

          {results.length > 0 && (
            <div className="space-y-2 max-h-56 overflow-y-auto rounded-lg border p-3">
              {results.map((result) => (
                <div
                  key={`${result.student_email}-${result.status}`}
                  className="flex items-start justify-between gap-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{result.student_email}</p>
                    <p className="text-xs text-muted-foreground">{result.message}</p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-1 text-xs whitespace-nowrap ${getResultBadgeClasses(result.status)}`}
                  >
                    {getStatusLabel(result.status)}
                  </span>
                </div>
              ))}
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
              onClick={handleDirectEnroll}
              disabled={isLoading || !emailsInput.trim()}
              className="rounded-lg"
            >
              {isLoading ? (
                'Enrolling...'
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Enroll by Email
                </span>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
