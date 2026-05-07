import { useMemo, useState } from 'react';
import { CLASS_COLORS } from '@/lib/data';
import { useClasses } from '@/hooks-api/useClasses';
import { useGrades, useBatchWeightedCourseGrades } from '@/hooks-api/useGrades';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/contexts/RoleContext';
import {
  formatMabiniGradePoint,
  describeMabiniRemarks,
} from '@/lib/grade-points';
import { GRADING_PERIOD_LABELS } from '@/lib/task-types';
import type { MabiniGradingPeriodKey, MabiniWeightedSummary, WeightedCourseGradeBreakdown } from '@/services/grades.service';
import type { ClassItem } from '@/lib/data';

const ALL_PERIODS: MabiniGradingPeriodKey[] = ['pre_mid', 'midterm', 'pre_final', 'final'];

interface ClassGradeCardProps {
  cls: ClassItem;
  weighted?: WeightedCourseGradeBreakdown | null;
  classGrades: Array<{ status: string; points?: number | null; maxPoints?: number | null; gradingPeriod?: string | null }>;
  isExporting: boolean;
  onExport: (cls: ClassItem, mabini: MabiniWeightedSummary | null | undefined, fallbackPercent: number | null) => void;
}

function ClassGradeCard({ cls, weighted, classGrades, isExporting, onExport }: ClassGradeCardProps) {

  const submitted = classGrades.filter((g) => g.status === 'submitted' || g.status === 'graded').length;
  const total = classGrades.length;
  const progress = total > 0 ? (submitted / total) * 100 : 0;

  // Average percentage across graded assignments — corrects the previous
  // "average raw points" bug which produced misleading values when assignments
  // had different max_points (e.g. 50/50 + 100/100 averaged to 75 instead of 100%).
  const percentageAverage = useMemo(() => {
    const graded = classGrades.filter(
      (g) => g.status === 'graded' && typeof g.points === 'number' && typeof g.maxPoints === 'number' && (g.maxPoints || 0) > 0
    );
    if (graded.length === 0) return null;
    const sum = graded.reduce((acc, g) => acc + ((g.points as number) / (g.maxPoints as number)) * 100, 0);
    return sum / graded.length;
  }, [classGrades]);

  // Prefer the registrar Mabini block when the course has period pinning configured
  // because that is the official rating shown in the TTH 1-2_30PM.xlsx workbook.
  const mabini = weighted?.mabini ?? null;
  const overallGP = mabini?.overall_grade_point ?? null;
  const overallRemarks = mabini ? mabini.remarks : describeMabiniRemarks(null);

  // Per-period summary (used as the grade chip when overall is INC)
  const periodSummary = useMemo(() => {
    if (!mabini) return null;
    const completed = ALL_PERIODS.filter((p) => mabini.period_grades[p] !== null);
    return { completed: completed.length, total: ALL_PERIODS.length };
  }, [mabini]);

  const gradeDisplay = (() => {
    if (mabini && overallGP !== null) return formatMabiniGradePoint(overallGP);
    if (mabini && periodSummary) {
      // Show the latest available period GP when overall is incomplete
      for (let i = ALL_PERIODS.length - 1; i >= 0; i -= 1) {
        const gp = mabini.period_grade_points[ALL_PERIODS[i]];
        if (gp !== null) return formatMabiniGradePoint(gp);
      }
      return 'INC';
    }
    if (typeof percentageAverage === 'number') {
      return `${Math.round(percentageAverage)}%`;
    }
    return '—';
  })();

  return (
    <Card className="border-0 shadow-sm card-interactive">
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
            <div className="text-right">
              <span className="text-2xl font-bold text-primary leading-none block">{gradeDisplay}</span>
              {mabini && (
                <span className={`text-[11px] font-medium ${
                  overallRemarks === 'Passed' ? 'text-emerald-600' :
                  overallRemarks === 'Failed' ? 'text-rose-600' : 'text-muted-foreground'
                }`}>
                  {overallRemarks}
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl gap-2"
              disabled={isExporting}
              onClick={() => onExport(cls, mabini, percentageAverage)}
              title="Download my official report card (PDF)"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">{isExporting ? 'Generating PDF…' : 'Download report card'}</span>
            </Button>
          </div>
        </div>

        {mabini && (
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ALL_PERIODS.map((period) => {
              const gp = mabini.period_grade_points[period];
              const grade = mabini.period_grades[period];
              return (
                <div key={period} className="rounded-lg border bg-muted/30 px-2 py-1.5 text-center">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {GRADING_PERIOD_LABELS[period]}
                  </div>
                  <div className="text-sm font-semibold">
                    {gp !== null ? formatMabiniGradePoint(gp) : 'INC'}
                  </div>
                  {grade !== null && (
                    <div className="text-[10px] text-muted-foreground">{grade.toFixed(2)}%</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

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
}

export default function GradesPage() {
  const { data: classes = [], isLoading: classesLoading, error: classesError, refetch: refetchClasses } = useClasses();
  const { data: grades = [], isLoading: gradesLoading, error: gradesError, refetch: refetchGrades } = useGrades();
  const classIds = useMemo(() => classes.map((c) => c.id), [classes]);
  const { data: batchWeighted = {} } = useBatchWeightedCourseGrades(classIds);
  const { toast } = useToast();
  const { user } = useAuth();
  const { currentUserName } = useRole();
  const [exportingCourseId, setExportingCourseId] = useState<string | null>(null);

  const handleExportMyGrade = async (
    cls: ClassItem,
    mabini: MabiniWeightedSummary | null | undefined,
    fallbackPercent: number | null
  ) => {
    if (exportingCourseId) return;
    setExportingCourseId(cls.id);
    try {
      const { generateReportCardPdf } = await import('@/lib/report-card-pdf');
      const blob = await generateReportCardPdf({
        studentName: currentUserName || user?.email || 'Student',
        studentEmail: user?.email,
        courseName: cls.name,
        courseSection: cls.section,
        instructorName: cls.teacher,
        schedule: cls.schedule,
        semester: undefined,
        generatedAt: new Date(),
        mabini,
        fallbackPercent,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = cls.name.replace(/[^a-z0-9-_]+/gi, '_');
      a.download = `report-card-${safeName}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: 'Export failed',
        description: error?.message || 'Could not generate report card PDF.',
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
        <p className="text-muted-foreground mt-1">
          Mabini Colleges 4-period rating across all classes.
        </p>
      </div>

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

      {!isLoading && !classError && (
        <div className="space-y-4 animate-stagger">
          {classes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg">No classes enrolled yet</p>
              <p className="text-sm mt-2">Enroll in a class to see your grades</p>
            </div>
          ) : (
            classes.map((cls) => {
              // /grades/my-grades returns the raw server shape:
              //   { course:{id}, assignment:{max_points, grading_period}, grade:{points_earned}, submission_status }
              const classGrades = (grades as any[])
                .filter((g) => (g?.course?.id || g?.classId) === cls.id)
                .map((g) => {
                  const gradePoints =
                    typeof g?.grade?.points_earned === 'number'
                      ? g.grade.points_earned
                      : typeof g?.points === 'number'
                        ? g.points
                        : null;
                  const maxPts =
                    typeof g?.assignment?.max_points === 'number'
                      ? g.assignment.max_points
                      : typeof g?.maxPoints === 'number'
                        ? g.maxPoints
                        : null;
                  const status: string =
                    g?.submission_status || g?.status || (g?.grade ? 'graded' : 'submitted');
                  const gradingPeriod =
                    g?.assignment?.grading_period ?? g?.gradingPeriod ?? null;

                  return {
                    status,
                    points: gradePoints,
                    maxPoints: maxPts,
                    gradingPeriod,
                  };
                });

              return (
                <ClassGradeCard
                  key={cls.id}
                  cls={cls}
                  weighted={batchWeighted[cls.id] ?? null}
                  classGrades={classGrades}
                  isExporting={exportingCourseId === cls.id}
                  onExport={handleExportMyGrade}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
