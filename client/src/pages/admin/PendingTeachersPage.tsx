import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as adminService from '@/services/admin.service';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
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
  Pencil,
  Trash2,
} from 'lucide-react';

const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const maybeError = error as any;
  return maybeError?.response?.data?.error?.message || maybeError?.message || fallback;
};

export default function PendingTeachersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const limit = 10;

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<adminService.AdminUser | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
  });

  const { data: teachersResponse, isLoading } = useQuery({
    queryKey: ['admin-teachers', page, searchTerm],
    queryFn: () => adminService.listUsers({
      page,
      limit,
      role: 'teacher',
      search: searchTerm || undefined,
    }),
  });

  const { data: pendingTeachers = [] } = useQuery({
    queryKey: ['pending-teachers'],
    queryFn: adminService.listPendingTeachers,
  });

  const teachers = teachersResponse?.users || [];
  const totalPages = teachersResponse?.totalPages || 1;

  const pendingTeacherIds = useMemo(
    () => new Set(pendingTeachers.map((teacher) => teacher.id)),
    [pendingTeachers]
  );

  // Approve teacher mutation
  const approveMutation = useMutation({
    mutationFn: adminService.approveTeacher,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-teachers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-teachers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast({
        title: 'Teacher Approved',
        description: 'The teacher has been approved and notified via email.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Approval Failed',
        description: getApiErrorMessage(error, 'Failed to approve teacher'),
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
      queryClient.invalidateQueries({ queryKey: ['admin-teachers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      setRejectDialogOpen(false);
      setSelectedTeacher(null);
      setRejectReason('');
      toast({
        title: 'Teacher Rejected',
        description: 'The teacher application has been rejected.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Rejection Failed',
        description: getApiErrorMessage(error, 'Failed to reject teacher'),
        variant: 'destructive',
      });
    },
  });

  const updateTeacherMutation = useMutation({
    mutationFn: ({ userId, updates }: { userId: string; updates: adminService.ManagedUserUpdateInput }) =>
      adminService.updateManagedUser(userId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-teachers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-teachers'] });
      setEditDialogOpen(false);
      setSelectedTeacher(null);
      toast({
        title: 'Teacher Updated',
        description: 'Teacher account details were updated successfully.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Update Failed',
        description: getApiErrorMessage(error, 'Failed to update teacher account.'),
        variant: 'destructive',
      });
    },
  });

  const deleteTeacherMutation = useMutation({
    mutationFn: (userId: string) => adminService.deleteManagedUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-teachers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-teachers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      setDeleteDialogOpen(false);
      setSelectedTeacher(null);
      toast({
        title: 'Teacher Removed',
        description: 'Teacher account has been deleted.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Delete Failed',
        description: getApiErrorMessage(error, 'Failed to delete teacher account.'),
        variant: 'destructive',
      });
    },
  });

  const handleApprove = (teacher: adminService.AdminUser) => {
    approveMutation.mutate(teacher.id);
  };

  const handleRejectClick = (teacher: adminService.AdminUser) => {
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

  const openEditDialog = (teacher: adminService.AdminUser) => {
    setSelectedTeacher(teacher);
    setEditForm({
      first_name: teacher.first_name || '',
      last_name: teacher.last_name || '',
      email: teacher.email,
    });
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (teacher: adminService.AdminUser) => {
    setSelectedTeacher(teacher);
    setDeleteDialogOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeacher) return;

    updateTeacherMutation.mutate({
      userId: selectedTeacher.id,
      updates: {
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        email: editForm.email.trim().toLowerCase(),
      },
    });
  };

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
          <h1 className="text-3xl font-bold text-white mb-2">Teacher Management</h1>
          <p className="text-slate-400">
            Review pending applications and manage teacher accounts
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
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="pl-10 bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>
        </Card>

        {/* Teachers List */}
        {isLoading ? (
          <Card className="bg-slate-800 border-slate-700 p-12">
            <div className="flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Loading teachers...</p>
            </div>
          </Card>
        ) : teachers.length > 0 ? (
          <div className="space-y-4">
            {teachers.map((teacher) => {
              const isPending = pendingTeacherIds.has(teacher.id) || teacher.pending_approval === true;
              const firstName = teacher.first_name || 'Unknown';
              const lastName = teacher.last_name || '';
              const initials = `${firstName[0] || 'T'}${lastName[0] || ''}`.toUpperCase();

              return (
                <Card key={teacher.id} className="bg-slate-800 border-slate-700 p-6">
                  <div className="flex items-start justify-between gap-4">
                  {/* Teacher Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <span className="text-white font-semibold text-lg">
                          {initials}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-white">
                          {firstName} {lastName}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          <Mail className="w-4 h-4" />
                          {teacher.email}
                        </div>
                        <div className="mt-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            isPending
                              ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                              : 'bg-green-500/20 text-green-300 border border-green-500/30'
                          }`}>
                            {isPending ? 'Pending Approval' : 'Approved'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Calendar className="w-4 h-4" />
                      <span>Applied on {formatDate(teacher.created_at)}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2 justify-end">
                    <Button
                      onClick={() => openEditDialog(teacher)}
                      variant="outline"
                      className="border-slate-600 hover:bg-slate-700"
                      disabled={updateTeacherMutation.isPending}
                    >
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit
                    </Button>

                    {isPending ? (
                      <>
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
                      </>
                    ) : (
                      <Button
                        onClick={() => openDeleteDialog(teacher)}
                        variant="destructive"
                        disabled={deleteTeacherMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
              );
            })}

            <div className="pt-2 flex items-center justify-between">
              <p className="text-sm text-slate-400">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="border-slate-700"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  className="border-slate-700"
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Card className="bg-slate-800 border-slate-700 p-12">
            <div className="flex flex-col items-center justify-center text-slate-400">
              <UserCheck className="w-16 h-16 mb-4 opacity-50" />
              <h3 className="text-lg font-semibold text-white mb-2">No Teachers Found</h3>
              <p className="text-center">
                {searchTerm
                  ? 'No teachers match your search criteria'
                  : 'Teacher accounts will appear here once created'}
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

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setSelectedTeacher(null);
          }
        }}
      >
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Teacher</DialogTitle>
            <DialogDescription className="text-slate-400">
              Update teacher account information.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-teacher-first-name">First Name</Label>
              <Input
                id="edit-teacher-first-name"
                value={editForm.first_name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, first_name: e.target.value }))}
                className="bg-slate-900 border-slate-700 text-white"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-teacher-last-name">Last Name</Label>
              <Input
                id="edit-teacher-last-name"
                value={editForm.last_name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, last_name: e.target.value }))}
                className="bg-slate-900 border-slate-700 text-white"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-teacher-email">Email</Label>
              <Input
                id="edit-teacher-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                className="bg-slate-900 border-slate-700 text-white"
                required
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditDialogOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateTeacherMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {updateTeacherMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setSelectedTeacher(null);
          }
        }}
      >
        <AlertDialogContent className="bg-slate-800 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Teacher Account</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will permanently delete {selectedTeacher?.email}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-700 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedTeacher && deleteTeacherMutation.mutate(selectedTeacher.id)}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteTeacherMutation.isPending}
            >
              {deleteTeacherMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Remove Teacher
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
