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
import { useToast } from '@/hooks/use-toast';
import { GraduationCap, UserPlus, Upload, Loader2, Search, Pencil, Trash2, ArrowUpDown } from 'lucide-react';
import CreateStudentModal from '@/components/admin/CreateStudentModal';
import BulkImportStudentsModal from '@/components/admin/BulkImportStudentsModal';

const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const maybeError = error as any;
  return maybeError?.response?.data?.error?.message || maybeError?.message || fallback;
};

export default function StudentManagementPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [bulkImportModalOpen, setBulkImportModalOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<adminService.AdminUser | null>(null);
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
  });
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'newest' | 'oldest'>('newest');
  const [page, setPage] = useState(1);
  const limit = 10;

  const { data: studentsResponse, isLoading: studentsLoading } = useQuery({
    queryKey: ['admin-students', page, search],
    queryFn: () => adminService.listUsers({ page, limit, role: 'student', search: search || undefined }),
  });

  const students = studentsResponse?.users || [];
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
        title: 'Student Removed',
        description: 'Student account has been deleted.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Delete Failed',
        description: getApiErrorMessage(error, 'Failed to delete student account.'),
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
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Student Management</h1>
            <p className="text-slate-400">Create and manage student accounts</p>
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
            className="bg-slate-800 border-slate-700 p-6 cursor-pointer hover:bg-slate-750 transition-colors group"
            onClick={() => setCreateModalOpen(true)}
          >
            <div className="bg-green-600 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <UserPlus className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-white font-semibold mb-2 group-hover:text-green-400 transition-colors">
              Create Single Student
            </h3>
            <p className="text-slate-400 text-sm">
              Create a new student account with temporary password
            </p>
          </Card>

          <Card
            className="bg-slate-800 border-slate-700 p-6 cursor-pointer hover:bg-slate-750 transition-colors group"
            onClick={() => setBulkImportModalOpen(true)}
          >
            <div className="bg-blue-600 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <Upload className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-white font-semibold mb-2 group-hover:text-blue-400 transition-colors">
              Bulk Import Students
            </h3>
            <p className="text-slate-400 text-sm">
              Import multiple students from a CSV file
            </p>
          </Card>
        </div>

        {/* Info Card */}
        <Card className="bg-blue-500/10 border-blue-500/30 p-6">
          <div className="flex items-start gap-4">
            <GraduationCap className="w-6 h-6 text-blue-400 flex-shrink-0" />
            <div>
              <h3 className="text-white font-semibold mb-2">Student Account Management</h3>
              <ul className="text-blue-300 text-sm space-y-1">
                <li>• Created students receive temporary passwords via email</li>
                <li>• Students must change their password on first login</li>
                <li>• Temporary passwords expire after 7 days</li>
                <li>• Institutional email validation can be configured in System Settings</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Student List */}
        <Card className="bg-slate-800 border-slate-700 p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <h3 className="text-lg font-semibold text-white">Students</h3>
            <div className="flex w-full md:w-auto flex-col md:flex-row gap-2">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by name or email"
                  className="pl-9 bg-slate-900 border-slate-700 text-white"
                />
              </div>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
                <SelectTrigger className="w-full md:w-52 bg-slate-900 border-slate-700 text-white">
                  <ArrowUpDown className="w-4 h-4 mr-2 text-slate-400" />
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

          {studentsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : sortedStudents.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <GraduationCap className="w-14 h-14 mx-auto mb-3 opacity-40" />
              <p>No students found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedStudents.map((student) => (
                <div
                  key={student.id}
                  className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3"
                >
                  <div>
                    <p className="text-white font-medium">
                      {(student.first_name || '').trim()} {(student.last_name || '').trim()}
                    </p>
                    <p className="text-sm text-slate-400">{student.email}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <p className="text-xs text-slate-500 mr-2">
                      Joined {new Date(student.created_at).toLocaleDateString()}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-slate-600 hover:bg-slate-700"
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
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
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
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Student</DialogTitle>
            <DialogDescription className="text-slate-400">
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
                className="bg-slate-900 border-slate-700 text-white"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-student-last-name">Last Name</Label>
              <Input
                id="edit-student-last-name"
                value={editForm.last_name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, last_name: e.target.value }))}
                className="bg-slate-900 border-slate-700 text-white"
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
        <AlertDialogContent className="bg-slate-800 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Student Account</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will permanently delete {selectedStudent?.email}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-700 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedStudent && deleteStudentMutation.mutate(selectedStudent.id)}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteStudentMutation.isPending}
            >
              {deleteStudentMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Remove Student
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
