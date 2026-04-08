import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as adminService from '@/services/admin.service';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  UserCheck,
  Search,
  Check,
  X,
  Mail,
  Calendar,
  Loader2,
  AlertCircle,
} from 'lucide-react';

export default function PendingTeachersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Fetch pending teachers
  const { data: teachers, isLoading } = useQuery({
    queryKey: ['pending-teachers'],
    queryFn: adminService.listPendingTeachers,
  });

  // Approve teacher mutation
  const approveMutation = useMutation({
    mutationFn: adminService.approveTeacher,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-teachers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast({
        title: 'Teacher Approved',
        description: 'The teacher has been approved and notified via email.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Approval Failed',
        description: error.message || 'Failed to approve teacher',
        variant: 'destructive',
      });
    },
  });

  // Reject teacher mutation
  const rejectMutation = useMutation({
    mutationFn: ({ teacherId, reason }: { teacherId: string; reason?: string }) =>
      adminService.rejectTeacher(teacherId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-teachers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      setRejectDialogOpen(false);
      setSelectedTeacher(null);
      setRejectReason('');
      toast({
        title: 'Teacher Rejected',
        description: 'The teacher application has been rejected.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Rejection Failed',
        description: error.message || 'Failed to reject teacher',
        variant: 'destructive',
      });
    },
  });

  const handleApprove = (teacher: any) => {
    approveMutation.mutate(teacher.id);
  };

  const handleRejectClick = (teacher: any) => {
    setSelectedTeacher(teacher);
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = () => {
    if (selectedTeacher) {
      rejectMutation.mutate({
        teacherId: selectedTeacher.id,
        reason: rejectReason,
      });
    }
  };

  const filteredTeachers = teachers?.filter((teacher) =>
    `${teacher.first_name} ${teacher.last_name} ${teacher.email}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Pending Teacher Approvals</h1>
          <p className="text-slate-400">
            Review and approve teacher applications to grant system access
          </p>
        </div>

        {/* Search Bar */}
        <Card className="bg-slate-800 border-slate-700 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>
        </Card>

        {/* Teachers List */}
        {isLoading ? (
          <Card className="bg-slate-800 border-slate-700 p-12">
            <div className="flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Loading pending teachers...</p>
            </div>
          </Card>
        ) : filteredTeachers && filteredTeachers.length > 0 ? (
          <div className="space-y-4">
            {filteredTeachers.map((teacher) => (
              <Card key={teacher.id} className="bg-slate-800 border-slate-700 p-6">
                <div className="flex items-start justify-between gap-4">
                  {/* Teacher Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <span className="text-white font-semibold text-lg">
                          {teacher.first_name[0]}{teacher.last_name[0]}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-white">
                          {teacher.first_name} {teacher.last_name}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          <Mail className="w-4 h-4" />
                          {teacher.email}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Calendar className="w-4 h-4" />
                      <span>Applied on {formatDate(teacher.created_at)}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleApprove(teacher)}
                      disabled={approveMutation.isPending}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {approveMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Check className="w-4 h-4 mr-2" />
                      )}
                      Approve
                    </Button>
                    <Button
                      onClick={() => handleRejectClick(teacher)}
                      disabled={rejectMutation.isPending}
                      variant="destructive"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="bg-slate-800 border-slate-700 p-12">
            <div className="flex flex-col items-center justify-center text-slate-400">
              <UserCheck className="w-16 h-16 mb-4 opacity-50" />
              <h3 className="text-lg font-semibold text-white mb-2">No Pending Teachers</h3>
              <p className="text-center">
                {searchTerm
                  ? 'No teachers match your search criteria'
                  : 'All teacher applications have been reviewed'}
              </p>
            </div>
          </Card>
        )}
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Reject Teacher Application</DialogTitle>
            <DialogDescription className="text-slate-400">
              Are you sure you want to reject {selectedTeacher?.first_name} {selectedTeacher?.last_name}?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-300">
                The teacher's account will be permanently deleted and they will be notified via email.
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Reason for Rejection (Optional)
              </label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Provide a reason for rejection that will be included in the notification email..."
                className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setRejectDialogOpen(false);
                setRejectReason('');
              }}
              className="text-slate-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRejectConfirm}
              disabled={rejectMutation.isPending}
              variant="destructive"
            >
              {rejectMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Reject Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
