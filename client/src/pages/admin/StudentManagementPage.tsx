import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import * as adminService from '@/services/admin.service';
import { GraduationCap, UserPlus, Upload, Loader2, Search } from 'lucide-react';
import CreateStudentModal from '@/components/admin/CreateStudentModal';
import BulkImportStudentsModal from '@/components/admin/BulkImportStudentsModal';

export default function StudentManagementPage() {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [bulkImportModalOpen, setBulkImportModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 10;

  const { data: studentsResponse, isLoading: studentsLoading } = useQuery({
    queryKey: ['admin-students', page, search],
    queryFn: () => adminService.listUsers({ page, limit, role: 'student', search: search || undefined }),
  });

  const students = studentsResponse?.users || [];
  const totalPages = studentsResponse?.totalPages || 1;

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
          </div>

          {studentsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <GraduationCap className="w-14 h-14 mx-auto mb-3 opacity-40" />
              <p>No students found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {students.map((student) => (
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
                  <p className="text-xs text-slate-500">Joined {new Date(student.created_at).toLocaleDateString()}</p>
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
    </div>
  );
}
