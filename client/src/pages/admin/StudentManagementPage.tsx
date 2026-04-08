import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { GraduationCap, UserPlus, Upload } from 'lucide-react';
import CreateStudentModal from '@/components/admin/CreateStudentModal';
import BulkImportStudentsModal from '@/components/admin/BulkImportStudentsModal';

export default function StudentManagementPage() {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [bulkImportModalOpen, setBulkImportModalOpen] = useState(false);

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

        {/* Placeholder for student list */}
        <Card className="bg-slate-800 border-slate-700 p-12">
          <div className="text-center text-slate-400">
            <GraduationCap className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>Student list view coming soon</p>
            <p className="text-sm mt-2">Use the /api/users endpoint with role filter to view students</p>
          </div>
        </Card>
      </div>

      {/* Modals */}
      <CreateStudentModal open={createModalOpen} onOpenChange={setCreateModalOpen} />
      <BulkImportStudentsModal open={bulkImportModalOpen} onOpenChange={setBulkImportModalOpen} />
    </div>
  );
}
