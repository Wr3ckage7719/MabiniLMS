import { useMemo, useState } from 'react';
import { Loader2, ShieldCheck, AlertCircle, Clock } from 'lucide-react';
import { useClasses } from '@/hooks-api/useClasses';
import { useMyCompetencySummary } from '@/hooks-api/useCompetency';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CompetencyStatus, StudentUnitStatus } from '@/services/competency.service';

const STATUS_LABEL: Record<CompetencyStatus, string> = {
  competent: 'Competent',
  in_progress: 'In progress',
  not_yet_competent: 'Not yet competent',
};

const STATUS_COLOR: Record<CompetencyStatus, string> = {
  competent: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  not_yet_competent: 'bg-rose-100 text-rose-700 border-rose-200',
};

const STATUS_ICON: Record<CompetencyStatus, JSX.Element> = {
  competent: <ShieldCheck className="h-4 w-4" />,
  in_progress: <Clock className="h-4 w-4" />,
  not_yet_competent: <AlertCircle className="h-4 w-4" />,
};

interface UnitRowProps {
  unit: StudentUnitStatus;
}

function UnitRow({ unit }: UnitRowProps) {
  const percent = Math.min(100, Math.max(0, unit.percent_complete));
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono uppercase tracking-wide">{unit.code}</span>
              <span>•</span>
              <span>Threshold {unit.threshold_percent}%</span>
            </div>
            <div className="text-base font-semibold mt-1 truncate">{unit.title}</div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLOR[unit.status]}`}
          >
            {STATUS_ICON[unit.status]}
            {STATUS_LABEL[unit.status]}
          </span>
        </div>

        <div>
          <Progress value={percent} className="h-2" />
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-1.5">
            <span>{percent.toFixed(0)}% of evidence cleared</span>
            <span>
              {unit.contributions.filter((c) => c.earned_fraction > 0).length} / {unit.evidence_count}{' '}
              evidence items
            </span>
          </div>
        </div>

        {unit.contributions.length > 0 && (
          <ul className="divide-y border rounded-md">
            {unit.contributions.map((contribution) => (
              <li
                key={contribution.evidence_id}
                className="px-3 py-2 flex items-center justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate">{contribution.artifact_title}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {contribution.artifact_kind} • {contribution.detail}
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold whitespace-nowrap ${
                    contribution.earned_fraction >= 1
                      ? 'text-emerald-600'
                      : contribution.earned_fraction > 0
                        ? 'text-amber-600'
                        : 'text-muted-foreground'
                  }`}
                >
                  {(contribution.earned_fraction * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function CompetencyPortfolioPage() {
  const { data: classesData, isLoading: classesLoading } = useClasses();
  const classes = useMemo(() => classesData ?? [], [classesData]);

  const [selectedCourseId, setSelectedCourseId] = useState<string | undefined>(undefined);

  const effectiveCourseId =
    selectedCourseId ?? (classes.length > 0 ? classes[0]?.id : undefined);

  const summaryQuery = useMyCompetencySummary(effectiveCourseId);

  const totals = useMemo(() => {
    const summary = summaryQuery.data;
    if (!summary) {
      return { competent: 0, inProgress: 0, notYet: 0, total: 0 };
    }
    return {
      competent: summary.competent_count,
      inProgress: summary.in_progress_count,
      notYet: summary.not_yet_competent_count,
      total: summary.units.length,
    };
  }, [summaryQuery.data]);

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Competency portfolio</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your TESDA-aligned units of competency. Status is derived from your assignment
            grades and learning material progress.
          </p>
        </div>

        <div className="w-56">
          <Select
            value={effectiveCourseId}
            onValueChange={(value) => setSelectedCourseId(value)}
            disabled={classesLoading || classes.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((cls) => (
                <SelectItem key={cls.id} value={cls.id}>
                  {cls.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {classes.length === 0 && !classesLoading && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6 text-sm text-muted-foreground">
            You are not enrolled in any classes yet.
          </CardContent>
        </Card>
      )}

      {effectiveCourseId && (
        <>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5 grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Competent</div>
                <div className="text-2xl font-bold text-emerald-600 mt-1">{totals.competent}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">In progress</div>
                <div className="text-2xl font-bold text-amber-600 mt-1">{totals.inProgress}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Not yet</div>
                <div className="text-2xl font-bold text-rose-600 mt-1">{totals.notYet}</div>
              </div>
            </CardContent>
          </Card>

          {summaryQuery.isLoading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading competency status…
            </div>
          )}

          {summaryQuery.error && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5 text-sm text-destructive">
                Could not load your competency status. Please try again.
              </CardContent>
            </Card>
          )}

          {!summaryQuery.isLoading && summaryQuery.data && summaryQuery.data.units.length === 0 && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6 text-sm text-muted-foreground">
                Your teacher has not yet declared competency units for this class.
              </CardContent>
            </Card>
          )}

          {summaryQuery.data && summaryQuery.data.units.length > 0 && (
            <div className="space-y-3">
              {summaryQuery.data.units.map((unit) => (
                <UnitRow key={unit.unit_id} unit={unit} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
