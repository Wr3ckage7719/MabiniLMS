import { useState } from 'react';
import { CLASS_COLORS } from '@/lib/data';
import { useClasses } from '@/hooks-api/useClasses';
import { useGrades } from '@/hooks-api/useGrades';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Download } from 'lucide-react';
import { batchService } from '@/services/batch.service';
import { useToast } from '@/hooks/use-toast';

export default function GradesPage() {
  // Fetch real data from API
  const { data: classes = [], isLoading: classesLoading, error: classesError, refetch: refetchClasses } = useClasses();
  const { data: grades = [], isLoading: gradesLoading, error: gradesError, refetch: refetchGrades } = useGrades();
  const { toast } = useToast();
  const [exportingCourseId, setExportingCourseId] = useState<string | null>(null);

  const handleExportMyGrade = async (courseId: string, courseName: string) => {
    if (exportingCourseId) return;
    setExportingCourseId(courseId);
    try {
      const response: any = await batchService.exportMyGrade(courseId);
      const csv = typeof response === 'string' ? response : (response?.data ?? '');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = courseName.replace(/[^a-z0-9-_]+/gi, '_');
      a.download = `my-grade-${safeName}-${courseId.slice(0, 8)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: 'Export failed',
        description:
          error?.response?.data?.error?.message ||
          error?.response?.data?.message ||
          error?.message ||
          'Failed to export your grade',
        variant: 'destructive',
      });
    } finally {
      setExportingCourseId(null);
    }
  };

  const isLoading = classesLoading || gradesLoading;
  const classError = classesError;
  const gradesWarning = gradesError;
  const gradesWarningMessage =
    (gradesWarning as any)?.response?.data?.error?.message ||
    (gradesWarning as any)?.response?.data?.message ||
    (gradesWarning instanceof Error ? gradesWarning.message : '');

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Grades</h1>
        <p className="text-muted-foreground mt-1">Your performance across all classes.</p>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && classError && (
        <div className="text-center py-12">
          <p className="text-destructive mb-2">Failed to load classes</p>
          <p className="text-sm text-muted-foreground">
            {classError instanceof Error ? classError.message : 'Please try again later'}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl mt-4 gap-2"
            onClick={() => {
              refetchClasses();
              refetchGrades();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !classError && gradesWarning && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
          {gradesWarningMessage || 'Grades could not be loaded right now. Class list is available, and you can retry in a moment.'}
        </div>
      )}

      {/* Content */}
      {!isLoading && !classError && (
        <div className="space-y-4 animate-stagger">
          {classes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg">No classes enrolled yet</p>
              <p className="text-sm mt-2">Enroll in a class to see your grades</p>
            </div>
          ) : (
            classes.map((cls) => {
              // Get grades for this class
              const classGrades = grades.filter(g => g.classId === cls.id);
              const submitted = classGrades.filter(g => g.status === 'submitted' || g.status === 'graded').length;
              const total = classGrades.length;
              const progress = total > 0 ? (submitted / total) * 100 : 0;
              
              // Calculate average grade
              const gradedAssignments = classGrades.filter(g => g.status === 'graded' && g.points);
              const averageGrade = gradedAssignments.length > 0
                ? gradedAssignments.reduce((sum, g) => sum + (g.points || 0), 0) / gradedAssignments.length
                : 0;
              
              // Convert to letter grade
              const getLetterGrade = (score: number) => {
                if (score >= 93) return 'A';
                if (score >= 90) return 'A-';
                if (score >= 87) return 'B+';
                if (score >= 83) return 'B';
                if (score >= 80) return 'B-';
                if (score >= 77) return 'C+';
                if (score >= 73) return 'C';
                if (score >= 70) return 'C-';
                if (score >= 67) return 'D+';
                if (score >= 63) return 'D';
                return 'F';
              };

              const grade = averageGrade > 0 ? getLetterGrade(averageGrade) : '—';

              const isExporting = exportingCourseId === cls.id;

              return (
                <Card key={cls.id} className="border-0 shadow-sm card-interactive">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full ${CLASS_COLORS[cls.color]}`} />
                        <div>
                          <h3 className="font-semibold">{cls.name}</h3>
                          <p className="text-sm text-muted-foreground">{cls.teacher}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-bold text-primary">{grade}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl gap-2"
                          disabled={isExporting}
                          onClick={() => handleExportMyGrade(cls.id, cls.name)}
                          title="Download my grade (Mabini registrar format)"
                        >
                          {isExporting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          <span className="hidden sm:inline">{isExporting ? 'Exporting…' : 'Export my grade'}</span>
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>{submitted}/{total} assignments completed</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
