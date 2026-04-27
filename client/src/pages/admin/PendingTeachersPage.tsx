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
  ArrowUpDown,
  Check,
  X,
  Mail,
  Calendar,
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const maybeError = error as any;
  return maybeError?.response?.data?.error?.message || maybeError?.message || fallback;
};

const EMPTY_ADMIN_USERS: adminService.AdminUser[] = [];
const EMPTY_PENDING_TEACHERS: adminService.PendingTeacher[] = [];

export default function PendingTeachersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'newest' | 'oldest' | 'pending-first'>('pending-first');
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

  const {
    data: pendingTeachersData,
    isLoading: isPendingTeachersLoading,
    error: pendingTeachersError,
  } = useQuery({
    queryKey: ['pending-teachers'],
    queryFn: adminService.listPendingTeachers,
  });

  const pendingTeachers = pendingTeachersData ?? EMPTY_PENDING_TEACHERS;
  const teachers = teachersResponse?.users ?? EMPTY_ADMIN_USERS;
  const totalPages = teachersResponse?.totalPages || 1;

  const pendingTeacherIds = useMemo(
    () => new Set(pendingTeachers.map((teacher) => teacher.id)),
    [pendingTeachers]
  );

  const pendingStatusById = useMemo(() => {
    const statusMap = new Map<string, adminService.PendingTeacher['status']>();
    pendingTeachers.forEach((teacher) => {
      statusMap.set(teacher.id, teacher.status || 'legacy_pending_profile');
    });
    return statusMap;
  }, [pendingTeachers]);

  const teacherIds = useMemo(() => new Set(teachers.map((teacher) => teacher.id)), [teachers]);

  const pendingApplicationOnlyTeachers = useMemo<adminService.AdminUser[]>(() => {
    return pendingTeachers
      .filter((teacher) => !teacherIds.has(teacher.id))
      .map((teacher) => ({
        id: teacher.id,
        email: teacher.email,
        first_name: teacher.first_name,
        last_name: teacher.last_name,
        role: 'teacher',
        pending_approval: true,
        avatar_url: null,
        created_at: teacher.created_at,
        updated_at: teacher.created_at,
      }));
  }, [pendingTeachers, teacherIds]);

  const mergedTeachers = useMemo(() => {
    return [...teachers, ...pendingApplicationOnlyTeachers];
  }, [teachers, pendingApplicationOnlyTeachers]);

  const sortedTeachers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filteredTeachers = normalizedSearch
      ? mergedTeachers.filter((teacher) => {
          const fullName = `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim().toLowerCase();
          return fullName.includes(normalizedSearch) || teacher.email.toLowerCase().includes(normalizedSearch);
        })
      : mergedTeachers;

    return [...filteredTeachers].sort((a, b) => {
      const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim() || a.email;
      const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim() || b.email;

      if (sortBy === 'name-asc') {
        return nameA.localeCompare(nameB);
      }

      if (sortBy === 'name-desc') {
        return nameB.localeCompare(nameA);
      }

      if (sortBy === 'pending-first') {
        const aPending = pendingTeacherIds.has(a.id) || a.pending_approval === true;
        const bPending = pendingTeacherIds.has(b.id) || b.pending_approval === true;
        if (aPending !== bPending) {
          return aPending ? -1 : 1;
        }
        return nameA.localeCompare(nameB);
      }

      const createdA = new Date(a.created_at).getTime();
      const createdB = new Date(b.created_at).getTime();
      if (sortBy === 'oldest') {
        return createdA - createdB;
      }

      return createdB - createdA;
    });
  }, [mergedTeachers, pendingTeacherIds, searchTerm, sortBy]);

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

  const isTableLoading = isLoading || isPendingTeachersLoading;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Teacher Management</h1>
          <p className="text-muted-foreground">
            Review pending applications and manage teacher accounts
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            New teacher requests can appear as Awaiting Email Verification first. Approval becomes available after email verification.
          </p>
        </div>

        {/* Search Bar */}
        <Card className="bg-card border-border p-4">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="pl-10 bg-background border-input text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
              <SelectTrigger className="w-full md:w-56 bg-background border-input text-foreground">
                <ArrowUpDown className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending-first">Pending First</SelectItem>
                <SelectItem value="newest">Newest Applied</SelectItem>
                <SelectItem value="oldest">Oldest Applied</SelectItem>
                <SelectItem value="name-asc">Name (A to Z)</SelectItem>
                <SelectItem value="name-desc">Name (Z to A)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        {pendingTeachersError && !isTableLoading && (
          <Card className="bg-card border-destructive/40 p-4">
            <div className="text-sm text-destructive">
              Failed to load pending teacher applications. Please refresh the page.
            </div>
          </Card>
        )}

        {/* Teachers List */}
        {isTableLoading ? (
          <Card className="bg-card border-border p-12">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Loading teachers...</p>
            </div>
          </Card>
        ) : sortedTeachers.length > 0 ? (
          <div className="space-y-4">
            {sortedTeachers.map((teacher) => {
              const pendingStatus =
                pendingStatusById.get(teacher.id) || (teacher.pending_approval === true ? 'legacy_pending_profile' : undefined);
              const isPending = Boolean(pendingStatus) || teacher.pending_approval === true;
              const isApplicationOnly = !teacherIds.has(teacher.id);
              const canApprove = pendingStatus === 'pending_review' || pendingStatus === 'legacy_pending_profile';
              const isAwaitingEmailVerification = pendingStatus === 'pending_email_verification';
              const firstName = teacher.first_name || 'Unknown';
              const lastName = teacher.last_name || '';
              const initials = `${firstName[0] || 'T'}${lastName[0] || ''}`.toUpperCase();

              return (
                <Card key={teacher.id} className="bg-card border-border p-6">
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
                        <h3 className="text-xl font-semibold text-foreground">
                          {firstName} {lastName}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="w-4 h-4" />
                          {teacher.email}
                        </div>
                        <div className="mt-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            pendingStatus === 'pending_email_verification'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : isPending
                                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                                : 'bg-green-500/20 text-green-300 border border-green-500/30'
                          }`}>
                            {pendingStatus === 'pending_email_verification'
                              ? 'Awaiting Email Verification'
                              : isPending
                                ? 'Pending Approval'
                                : 'Approved'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      <span>Applied on {formatDate(teacher.created_at)}</span>
                    </div>

                    {isAwaitingEmailVerification && (
                      <div className="text-xs text-blue-300 mt-2">
                        This applicant must verify their email before admin approval can proceed.
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2 justify-end">
                    {!isApplicationOnly && (
                      <Button
                        onClick={() => openEditDialog(teacher)}
                        variant="outline"
                        className="border-border hover:bg-accent"
                        disabled={updateTeacherMutation.isPending}
                      >
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit
                      </Button>
                    )}

                    {isPending ? (
                      <>
                        {canApprove ? (
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
                        ) : (
                          <Button
                            disabled
                            variant="outline"
                            className="border-blue-400/40 text-blue-300"
                          >
                            Waiting for Verification
                          </Button>
                        )}
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
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="border-border"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  className="border-border"
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Card className="bg-card border-border p-12">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <UserCheck className="w-16 h-16 mb-4 opacity-50" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Teachers Found</h3>
              <p className="text-center">
                {searchTerm
                  ? 'No teachers match your search criteria'
                  : 'Teacher applications will appear here after signup. Unverified ones are marked as Awaiting Email Verification.'}
              </p>
            </div>
          </Card>
        )}
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Reject Teacher Application</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Are you sure you want to reject {selectedTeacher?.first_name} {selectedTeacher?.last_name}?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-300">
                The teacher request will be rejected and the applicant will be notified by email.
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
                className="bg-background border-input text-foreground placeholder:text-muted-foreground"
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
              className="text-muted-foreground hover:text-foreground"
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
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Teacher</DialogTitle>
            <DialogDescription className="text-muted-foreground">
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
                className="bg-background border-input text-foreground"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-teacher-last-name">Last Name</Label>
              <Input
                id="edit-teacher-last-name"
                value={editForm.last_name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, last_name: e.target.value }))}
                className="bg-background border-input text-foreground"
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
                className="bg-background border-input text-foreground"
                required
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditDialogOpen(false)}
                className="text-muted-foreground hover:text-foreground"
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
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Teacher Account</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently delete {selectedTeacher?.email}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground">
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
