import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import * as adminService from '@/services/admin.service';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { GraduationCap, UserPlus, Upload, Loader2, Search, Pencil, Trash2, ArrowUpDown, RotateCcw, AlertTriangle } from 'lucide-react';
import CreateStudentModal from '@/components/admin/CreateStudentModal';
import BulkImportStudentsModal from '@/components/admin/BulkImportStudentsModal';

const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const maybeError = error as any;
  return maybeError?.response?.data?.error?.message || maybeError?.message || fallback;
};

const EMPTY_STUDENTS: adminService.AdminUser[] = [];

export default function StudentManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [bulkImportModalOpen, setBulkImportModalOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [hardDeleteDialogOpen, setHardDeleteDialogOpen] = useState(false);
  const [hardDeleteConfirmation, setHardDeleteConfirmation] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<adminService.AdminUser | null>(null);
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
  });
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'newest' | 'oldest'>('newest');
  const [page, setPage] = useState(1);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const limit = 10;

  const { data: studentsResponse, isLoading: studentsLoading } = useQuery({
    queryKey: ['admin-students', page, search, showDeactivated],
    queryFn: () =>
      adminService.listUsers({
        page,
        limit,
        role: 'student',
        search: search || undefined,
        include_deleted: showDeactivated || undefined,
      }),
  });

  const students = studentsResponse?.users ?? EMPTY_STUDENTS;
  const totalPages = studentsResponse?.totalPages || 1;

  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim() || a.email;
      const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim() || b.email;

      if (sortBy === 'name-asc') {
        return nameA.localeCompare(nameB);
      }

      if (sortBy === 'name-desc') {
        return nameB.localeCompare(nameA);
      }

      const createdA = new Date(a.created_at).getTime();
      const createdB = new Date(b.created_at).getTime();
      if (sortBy === 'oldest') {
        return createdA - createdB;
      }

      return createdB - createdA;
    });
  }, [students, sortBy]);

  const updateStudentMutation = useMutation({
    mutationFn: ({ userId, updates }: { userId: string; updates: adminService.ManagedUserUpdateInput }) =>
      adminService.updateManagedUser(userId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      setEditDialogOpen(false);
      setSelectedStudent(null);
      toast({
        title: 'Student Updated',
        description: 'Student account details were updated successfully.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Update Failed',
        description: getApiErrorMessage(error, 'Failed to update student account.'),
        variant: 'destructive',
      });
    },
  });

  const deleteStudentMutation = useMutation({
    mutationFn: (userId: string) => adminService.deleteManagedUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      setDeleteDialogOpen(false);
      setSelectedStudent(null);
      toast({
        title: 'Student Deactivated',
        description: 'Account is deactivated. Their work is preserved and can be restored.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Delete Failed',
        description: getApiErrorMessage(error, 'Failed to deactivate student account.'),
        variant: 'destructive',
      });
    },
  });

  const restoreStudentMutation = useMutation({
    mutationFn: (userId: string) => adminService.restoreManagedUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      setRestoreDialogOpen(false);
      setSelectedStudent(null);
      toast({
        title: 'Student Restored',
        description: 'Account is active again. The student can sign in.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Restore Failed',
        description: getApiErrorMessage(error, 'Failed to restore student account.'),
        variant: 'destructive',
      });
    },
  });

  const hardDeleteStudentMutation = useMutation({
    mutationFn: ({ userId, confirmationName }: { userId: string; confirmationName: string }) =>
      adminService.hardDeleteManagedUser(userId, confirmationName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      setHardDeleteDialogOpen(false);
      setHardDeleteConfirmation('');
      setSelectedStudent(null);
      toast({
        title: 'Student Permanently Deleted',
        description: 'All associated data has been erased.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Permanent Delete Failed',
        description: getApiErrorMessage(error, 'Failed to permanently delete account.'),
        variant: 'destructive',
      });
    },
  });

  const openEditDialog = (student: adminService.AdminUser) => {
    setSelectedStudent(student);
    setEditForm({
      first_name: student.first_name || '',
      last_name: student.last_name || '',
      email: student.email,
    });
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (student: adminService.AdminUser) => {
    setSelectedStudent(student);
    setDeleteDialogOpen(true);
  };

  const openRestoreDialog = (student: adminService.AdminUser) => {
    setSelectedStudent(student);
    setRestoreDialogOpen(true);
  };

  const openHardDeleteDialog = (student: adminService.AdminUser) => {
    setSelectedStudent(student);
    setHardDeleteConfirmation('');
    setHardDeleteDialogOpen(true);
  };

  const expectedConfirmationName = selectedStudent
    ? `${selectedStudent.first_name || ''} ${selectedStudent.last_name || ''}`.trim()
    : '';
  const isHardDeleteConfirmed =
    expectedConfirmationName.length > 0 &&
    hardDeleteConfirmation.trim().toLowerCase() === expectedConfirmationName.toLowerCase();

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;

    updateStudentMutation.mutate({
      userId: selectedStudent.id,
      updates: {
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        email: editForm.email.trim().toLowerCase(),
      },
    });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Student Management</h1>
            <p className="text-muted-foreground">Create and manage student accounts</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setCreateModalOpen(true)}
              className="bg-green-600 hover:bg-green-700"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Create Student
            </Button>
            <Button
              onClick={() => setBulkImportModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Upload className="w-4 h-4 mr-2" />
              Bulk Import
            </Button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card
            className="bg-card border-border p-6 cursor-pointer hover:bg-accent/40 transition-colors group"
            onClick={() => setCreateModalOpen(true)}
          >
            <div className="bg-green-600 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <UserPlus className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-foreground font-semibold mb-2 group-hover:text-primary transition-colors">
              Create Single Student
            </h3>
            <p className="text-muted-foreground text-sm">
              Create a new student account with temporary password
            </p>
          </Card>

          <Card
            className="bg-card border-border p-6 cursor-pointer hover:bg-accent/40 transition-colors group"
            onClick={() => setBulkImportModalOpen(true)}
          >
            <div className="bg-blue-600 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <Upload className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-foreground font-semibold mb-2 group-hover:text-primary transition-colors">
              Bulk Import Students
            </h3>
            <p className="text-muted-foreground text-sm">
              Import multiple students from a CSV file
            </p>
          </Card>
        </div>

        {/* Info Card */}
        <Card className="bg-primary/10 border-primary/30 p-6">
          <div className="flex items-start gap-4">
            <GraduationCap className="w-6 h-6 text-primary flex-shrink-0" />
            <div>
              <h3 className="text-foreground font-semibold mb-2">Student Account Management</h3>
              <ul className="text-muted-foreground text-sm space-y-1">
                <li>• Created students receive temporary passwords via email</li>
                <li>• Students must change their password on first login</li>
                <li>• Temporary passwords expire after 7 days</li>
                <li>• Institutional email validation can be configured in System Settings</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Student List */}
        <Card className="bg-card border-border p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <h3 className="text-lg font-semibold text-foreground">Students</h3>
            <div className="flex w-full md:w-auto flex-col md:flex-row gap-2">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by name or email"
                  className="pl-9 bg-background border-input text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
                <SelectTrigger className="w-full md:w-52 bg-background border-input text-foreground">
                  <ArrowUpDown className="w-4 h-4 mr-2 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest Joined</SelectItem>
                  <SelectItem value="oldest">Oldest Joined</SelectItem>
                  <SelectItem value="name-asc">Name (A to Z)</SelectItem>
                  <SelectItem value="name-desc">Name (Z to A)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mb-3 flex items-center gap-2">
            <Switch
              id="show-deactivated"
              checked={showDeactivated}
              onCheckedChange={(value) => {
                setShowDeactivated(value);
                setPage(1);
              }}
            />
            <Label htmlFor="show-deactivated" className="text-sm text-muted-foreground cursor-pointer">
              Show deactivated accounts
            </Label>
          </div>

          {studentsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : sortedStudents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <GraduationCap className="w-14 h-14 mx-auto mb-3 opacity-40" />
              <p>No students found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedStudents.map((student) => {
                const isDeactivated = Boolean(student.deleted_at);
                return (
                  <div
                    key={student.id}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                      isDeactivated
                        ? 'border-amber-500/30 bg-amber-500/5'
                        : 'border-border bg-background/60'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-foreground font-medium truncate">
                          {(student.first_name || '').trim()} {(student.last_name || '').trim()}
                        </p>
                        {isDeactivated && (
                          <span className="text-[10px] uppercase font-semibold tracking-wide text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
                            Deactivated
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{student.email}</p>
                      {isDeactivated && student.deleted_at && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Deactivated {new Date(student.deleted_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-xs text-muted-foreground mr-2 hidden sm:block">
                        Joined {new Date(student.created_at).toLocaleDateString()}
                      </p>
                      {isDeactivated ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-border hover:bg-accent"
                            onClick={() => openRestoreDialog(student)}
                          >
                            <RotateCcw className="w-4 h-4 mr-1" />
                            Restore
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => openHardDeleteDialog(student)}
                          >
                            <AlertTriangle className="w-4 h-4 mr-1" />
                            Delete permanently
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-border hover:bg-accent"
                            onClick={() => openEditDialog(student)}
                          >
                            <Pencil className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => openDeleteDialog(student)}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Deactivate
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
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
        </Card>
      </div>

      {/* Modals */}
      <CreateStudentModal open={createModalOpen} onOpenChange={setCreateModalOpen} />
      <BulkImportStudentsModal open={bulkImportModalOpen} onOpenChange={setBulkImportModalOpen} />

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setSelectedStudent(null);
          }
        }}
      >
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Student</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Update the student account information.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-student-first-name">First Name</Label>
              <Input
                id="edit-student-first-name"
                value={editForm.first_name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, first_name: e.target.value }))}
                className="bg-background border-input text-foreground"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-student-last-name">Last Name</Label>
              <Input
                id="edit-student-last-name"
                value={editForm.last_name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, last_name: e.target.value }))}
                className="bg-background border-input text-foreground"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-student-email">Email</Label>
              <Input
                id="edit-student-email"
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
                disabled={updateStudentMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {updateStudentMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
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
            setSelectedStudent(null);
          }
        }}
      >
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Student Account</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {selectedStudent?.email} will be deactivated and can no longer
              sign in. Their submissions, grades, and class history stay
              intact and can be restored by another admin. Use the
              "Permanently delete" action only if you need to fully erase
              this account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedStudent && deleteStudentMutation.mutate(selectedStudent.id)}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteStudentMutation.isPending}
            >
              {deleteStudentMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Deactivate Student
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={restoreDialogOpen}
        onOpenChange={(open) => {
          setRestoreDialogOpen(open);
          if (!open) {
            setSelectedStudent(null);
          }
        }}
      >
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Student Account</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {selectedStudent?.email} will be reactivated and able to sign in
              again. Their submissions and grades have been preserved while the
              account was deactivated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedStudent && restoreStudentMutation.mutate(selectedStudent.id)}
              disabled={restoreStudentMutation.isPending}
            >
              {restoreStudentMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Restore Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={hardDeleteDialogOpen}
        onOpenChange={(open) => {
          setHardDeleteDialogOpen(open);
          if (!open) {
            setHardDeleteConfirmation('');
            setSelectedStudent(null);
          }
        }}
      >
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="w-5 h-5" />
              Permanently Delete Account
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This permanently erases <span className="font-medium text-foreground">{selectedStudent?.email}</span>{' '}
              and cascades to delete all of their submissions, grades, exam
              attempts, lesson progress, and audit log entries. This action
              cannot be undone. Restoration is impossible.
              <br />
              <br />
              Type the user's full name{' '}
              <span className="font-mono text-foreground">{expectedConfirmationName}</span>{' '}
              to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="hard-delete-confirm">Confirm full name</Label>
            <Input
              id="hard-delete-confirm"
              autoFocus
              value={hardDeleteConfirmation}
              onChange={(e) => setHardDeleteConfirmation(e.target.value)}
              className="bg-background border-input text-foreground"
              placeholder={expectedConfirmationName}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setHardDeleteDialogOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!isHardDeleteConfirmed || hardDeleteStudentMutation.isPending}
              onClick={() =>
                selectedStudent &&
                hardDeleteStudentMutation.mutate({
                  userId: selectedStudent.id,
                  confirmationName: hardDeleteConfirmation,
                })
              }
            >
              {hardDeleteStudentMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Erase Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
