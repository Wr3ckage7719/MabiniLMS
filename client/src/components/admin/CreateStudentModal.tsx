import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as adminService from '@/services/admin.service';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Copy, Check, Eye, EyeOff } from 'lucide-react';

interface CreateStudentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreateStudentModal({ open, onOpenChange }: CreateStudentModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    student_id: '',
  });
  const [createdStudent, setCreatedStudent] = useState<any>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const createMutation = useMutation({
    mutationFn: adminService.createStudent,
    onSuccess: (data) => {
      setCreatedStudent(data);
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast({
        title: 'Student Created',
        description: 'The student account has been created successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Creation Failed',
        description: error.message || 'Failed to create student account',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const handleClose = () => {
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      student_id: '',
    });
    setCreatedStudent(null);
    setShowPassword(false);
    setCopied(false);
    onOpenChange(false);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: 'Copied',
        description: 'Credentials copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: 'Copy Failed',
        description: 'Failed to copy to clipboard',
        variant: 'destructive',
      });
    }
  };

  const copyAllCredentials = () => {
    const credentials = `Username: ${createdStudent.student.email}\nTemporary Password: ${createdStudent.temporary_password}`;
    copyToClipboard(credentials);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
        {!createdStudent ? (
          <>
            <DialogHeader>
              <DialogTitle>Create Student Account</DialogTitle>
              <DialogDescription className="text-slate-400">
                Create a new student account with a temporary password
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name</Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  required
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name</Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  required
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  placeholder="student@school.edu"
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="student_id">Student ID (Optional)</Label>
                <Input
                  id="student_id"
                  value={formData.student_id}
                  onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                  placeholder="2024-001"
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClose}
                  className="text-slate-400 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Create Student
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-500" />
                Student Created Successfully
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Save these credentials before closing. The student has been emailed their login information.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Student Info */}
              <div className="p-4 bg-slate-900 rounded-lg border border-slate-700">
                <p className="text-sm text-slate-400 mb-1">Student</p>
                <p className="text-white font-medium">
                  {createdStudent.student.first_name} {createdStudent.student.last_name}
                </p>
              </div>

              {/* Credentials */}
              <div className="space-y-3">
                <div className="p-4 bg-slate-900 rounded-lg border border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-slate-400">Username / Email</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(createdStudent.student.email)}
                      className="h-auto p-1"
                    >
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-white font-mono text-sm break-all">
                    {createdStudent.student.email}
                  </p>
                </div>

                <div className="p-4 bg-slate-900 rounded-lg border border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-slate-400">Temporary Password</p>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowPassword(!showPassword)}
                        className="h-auto p-1"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(createdStudent.temporary_password)}
                        className="h-auto p-1"
                      >
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <p className="text-white font-mono text-sm">
                    {showPassword ? createdStudent.temporary_password : '••••••••••••'}
                  </p>
                </div>
              </div>

              {/* Warning */}
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-sm text-yellow-300">
                  ⚠️ Student must change their password on first login. Temporary password expires in 7 days.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                onClick={copyAllCredentials}
                variant="outline"
                className="border-slate-700"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy All Credentials
              </Button>
              <Button
                onClick={handleClose}
                className="bg-green-600 hover:bg-green-700"
              >
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
