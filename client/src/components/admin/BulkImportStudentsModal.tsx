import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as adminService from '@/services/admin.service';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { parse } from 'papaparse';

interface BulkImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImportRowError {
  row: number;
  email: string;
  error: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeHeader = (header: string): string => {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
};

const extractErrorMessage = (error: unknown, fallback: string): string => {
  const maybeError = error as any;
  return maybeError?.response?.data?.error?.message || maybeError?.message || fallback;
};

export default function BulkImportStudentsModal({ open, onOpenChange }: BulkImportModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<adminService.StudentData[]>([]);
  const [validStudents, setValidStudents] = useState<adminService.StudentData[]>([]);
  const [validationErrors, setValidationErrors] = useState<ImportRowError[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const importMutation = useMutation({
    mutationFn: adminService.bulkCreateStudents,
    onSuccess: (data) => {
      const combinedErrors = [...validationErrors, ...(data.errors || [])];
      const adjustedResult = {
        ...data,
        total: data.total + validationErrors.length,
        failed: data.failed + validationErrors.length,
        errors: combinedErrors,
      };

      setResult(adjustedResult);
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin-students'] });
      toast({
        title: 'Import Complete',
        description: `${adjustedResult.created} students created, ${adjustedResult.failed} failed`,
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Import Failed',
        description: extractErrorMessage(error, 'Failed to import students'),
        variant: 'destructive',
      });
    },
  });

  const parseCsvFile = (selectedFile: File) => {
    parse<Record<string, string | undefined>>(selectedFile, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: normalizeHeader,
      complete: (results) => {
        const csvRows = Array.isArray(results.data) ? results.data : [];
        const parsedStudents: adminService.StudentData[] = [];
        const rowErrors: ImportRowError[] = [];

        if (results.errors.length > 0) {
          const firstError = results.errors[0];
          setParseError(firstError.message || 'Unable to parse CSV file.');
        } else {
          setParseError(null);
        }

        csvRows.forEach((row, index) => {
          const rowNumber = index + 2;
          const firstName = (row.first_name || '').trim();
          const lastName = (row.last_name || '').trim();
          const email = (row.email || '').trim().toLowerCase();
          const studentId = (row.student_id || '').trim();

          const isCompletelyEmpty = !firstName && !lastName && !email && !studentId;
          if (isCompletelyEmpty) {
            return;
          }

          if (!firstName || !lastName || !email) {
            rowErrors.push({
              row: rowNumber,
              email: email || 'N/A',
              error: 'First name, last name, and email are required',
            });
            return;
          }

          if (!EMAIL_REGEX.test(email)) {
            rowErrors.push({
              row: rowNumber,
              email,
              error: 'Invalid email format',
            });
            return;
          }

          parsedStudents.push({
            first_name: firstName,
            last_name: lastName,
            email,
            student_id: studentId || undefined,
          });
        });

        setValidStudents(parsedStudents);
        setPreview(parsedStudents.slice(0, 5));
        setValidationErrors(rowErrors);
      },
      error: (error) => {
        setParseError(error.message || 'Unable to parse CSV file.');
        setValidStudents([]);
        setPreview([]);
        setValidationErrors([]);
      },
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setResult(null);
    parseCsvFile(selectedFile);
  };

  const handleImport = () => {
    if (!file) return;

    if (parseError) {
      toast({
        title: 'Invalid CSV File',
        description: parseError,
        variant: 'destructive',
      });
      return;
    }

    if (validStudents.length === 0) {
      toast({
        title: 'No Valid Rows Found',
        description: 'Upload a CSV with at least one valid student row before importing.',
        variant: 'destructive',
      });
      return;
    }

    importMutation.mutate(validStudents);
  };

  const downloadTemplate = () => {
    const template = 'first_name,last_name,email,student_id\nJohn,Doe,john@school.edu,2024-001\nJane,Smith,jane@school.edu,2024-002';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'student_import_template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    setFile(null);
    setPreview([]);
    setValidStudents([]);
    setValidationErrors([]);
    setParseError(null);
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
                  type="button"
                  onClick={downloadTemplate}
                  variant="outline"
                  size="sm"
                  className="border-slate-600 text-white hover:bg-slate-700"
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

              {parseError && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
                  {parseError}
                </div>
              )}

              {validationErrors.length > 0 && (
                <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-200">
                  <p className="font-medium mb-1">{validationErrors.length} row(s) will be skipped due to invalid data.</p>
                  <p className="text-xs text-yellow-100/80">Import will continue for valid rows only.</p>
                </div>
              )}

              {preview.length > 0 && (
                <div className="bg-slate-900 rounded-lg p-4">
                  <p className="text-sm text-slate-400 mb-2">Preview (first 5 valid rows):</p>
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
                disabled={!file || importMutation.isPending || !!parseError || validStudents.length === 0}
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
                  {result.errors.map((err: ImportRowError, i: number) => (
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
