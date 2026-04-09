import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as adminService from '@/services/admin.service';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download, Loader2, CheckCircle, XCircle, FileText } from 'lucide-react';
import { parse } from 'papaparse';

interface BulkImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function BulkImportStudentsModal({ open, onOpenChange }: BulkImportModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);

  const importMutation = useMutation({
    mutationFn: adminService.bulkCreateStudents,
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin-students'] });
      toast({
        title: 'Import Complete',
        description: `${data.created} students created, ${data.failed} failed`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Import Failed',
        description: error.message || 'Failed to import students',
        variant: 'destructive',
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      parse(selectedFile, {
        header: true,
        complete: (results) => {
          setPreview(results.data.slice(0, 5));
        },
      });
    }
  };

  const handleImport = () => {
    if (!file) return;
    
    parse(file, {
      header: true,
      complete: (results) => {
        const students = results.data.filter((row: any) => row.email);
        importMutation.mutate(students as any);
      },
    });
  };

  const downloadTemplate = () => {
    const template = 'first_name,last_name,email,student_id\nJohn,Doe,john@school.edu,2024-001\nJane,Smith,jane@school.edu,2024-002';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student_import_template.csv';
    a.click();
  };

  const handleClose = () => {
    setFile(null);
    setPreview([]);
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl">
        {!result ? (
          <>
            <DialogHeader>
              <DialogTitle>Bulk Import Students</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  onClick={downloadTemplate}
                  variant="outline"
                  size="sm"
                  className="border-slate-700"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Template
                </Button>
              </div>

              <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                  id="csv-upload"
                />
                <label htmlFor="csv-upload" className="cursor-pointer">
                  <Upload className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                  <p className="text-white mb-2">{file ? file.name : 'Click to upload CSV file'}</p>
                  <p className="text-sm text-slate-400">CSV format: first_name, last_name, email, student_id</p>
                </label>
              </div>

              {preview.length > 0 && (
                <div className="bg-slate-900 rounded-lg p-4">
                  <p className="text-sm text-slate-400 mb-2">Preview (first 5 rows):</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left p-2">First Name</th>
                          <th className="text-left p-2">Last Name</th>
                          <th className="text-left p-2">Email</th>
                          <th className="text-left p-2">Student ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row, i) => (
                          <tr key={i} className="border-b border-slate-800">
                            <td className="p-2">{row.first_name}</td>
                            <td className="p-2">{row.last_name}</td>
                            <td className="p-2">{row.email}</td>
                            <td className="p-2">{row.student_id || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleImport}
                disabled={!file || importMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {importMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Import Students
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Import Complete</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
                  <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">{result.created}</p>
                  <p className="text-sm text-slate-400">Created</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
                  <XCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">{result.failed}</p>
                  <p className="text-sm text-slate-400">Failed</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="bg-slate-900 rounded-lg p-4 max-h-48 overflow-y-auto">
                  <p className="text-sm font-medium text-red-400 mb-2">Errors:</p>
                  {result.errors.map((err: any, i: number) => (
                    <p key={i} className="text-xs text-slate-400">
                      Row {err.row}: {err.email} - {err.error}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={handleClose} className="bg-green-600 hover:bg-green-700">
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
