import { useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, RefreshCw } from 'lucide-react';
import { ClassCard } from '@/components/ClassCard';
import { Skeleton } from '@/components/ui/skeleton';
import { StudentInvitations } from '@/components/StudentInvitations';
import { UpcomingWidget } from '@/components/UpcomingWidget';
import { StatsBar } from '@/components/StatsBar';
import { Button } from '@/components/ui/button';
import { useRole } from '@/contexts/RoleContext';
import { useClasses as useClassActions } from '@/contexts/ClassesContext';
import { useClasses as useApiClasses } from '@/hooks-api/useClasses';
import { useAssignments } from '@/hooks-api/useAssignments';
import { useStudentProgressSummary } from '@/hooks-api/useLessons';
import {
  computeCourseCompletion,
  groupAssignmentsByClass,
  type CourseCompletion,
} from '@/lib/course-completion';

export default function Dashboard() {
  const { currentUserName } = useRole();
  const { archivedClasses, unenrolledClasses, handleArchive, handleUnenroll, handleRestore } = useClassActions();
  const {
    data: classes = [],
    isLoading,
    error,
    refetch,
  } = useApiClasses();
  // Lesson-based progress is the authoritative completion metric (the LMS is
  // lesson-centric — assessments live inside lessons). Falls back to the
  // legacy assignment-based calculation only when the student has no
  // published lessons at all in a course.
  const { data: progressSummary = [] } = useStudentProgressSummary();
  const { data: allAssignments = [] } = useAssignments();
  const completionByClass = useMemo<Map<string, CourseCompletion>>(() => {
    const out = new Map<string, CourseCompletion>();
    const lessonByCourse = new Map(
      progressSummary.map((p) => [p.course_id, p])
    );
    const grouped = groupAssignmentsByClass(allAssignments);
    const seen = new Set<string>();

    lessonByCourse.forEach((row, classId) => {
      seen.add(classId);
      if (row.total_lessons > 0) {
        out.set(classId, {
          percent: row.percent,
          completed: row.done_lessons,
          total: row.total_lessons,
          nextItem: null,
        });
      } else {
        // No lessons yet — fall back so the ring isn't misleadingly empty.
        out.set(classId, computeCourseCompletion(grouped.get(classId) ?? []));
      }
    });

    grouped.forEach((items, classId) => {
      if (seen.has(classId)) return;
      out.set(classId, computeCourseCompletion(items));
    });

    return out;
  }, [progressSummary, allAssignments]);
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isArchivedView = location.pathname === '/archived';
  const searchQuery = (searchParams.get('q') || '').trim().toLowerCase();

  const matchesSearchQuery = (cls: (typeof classes)[number]) => {
    if (!searchQuery) {
      return true;
    }

    const haystack = [
      cls.name,
      cls.section,
      cls.block,
      cls.level,
      cls.room,
      cls.schedule,
      cls.code,
      ...(cls.tags ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(searchQuery);
  };

  const activeClasses = classes.filter(
    (cls) =>
      !cls.archived &&
      !archivedClasses.includes(cls.id) &&
      !unenrolledClasses.includes(cls.id) &&
      matchesSearchQuery(cls)
  );

  const displayedArchivedClasses = classes.filter(
    (cls) => (cls.archived || archivedClasses.includes(cls.id)) && matchesSearchQuery(cls)
  );

  const handleArchiveClass = async (classId: string) => {
    await handleArchive(classId);
    await refetch();
  };

  const handleUnenrollClass = async (classId: string) => {
    await handleUnenroll(classId);
    await refetch();
  };

  const handleRestoreClass = async (classId: string) => {
    await handleRestore(classId);
    await refetch();
  };

  return (
    <div className="p-3 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-3.5 md:space-y-8 animate-fade-in">
      <div className="hidden md:block">
        <h1 className="text-xl md:text-3xl font-bold">Welcome back, {currentUserName}</h1>
        {isArchivedView ? (
          <p className="text-muted-foreground mt-1">View and restore your archived classes.</p>
        ) : (
          <p className="text-muted-foreground mt-1">Here's what's happening in your classes today.</p>
        )}
      </div>

      {!isArchivedView && (
        <div className="hidden md:block">
          <StatsBar />
        </div>
      )}

      {!isArchivedView && (
        <div className="hidden md:block">
          <StudentInvitations />
        </div>
      )}

      {isLoading && (
        <div className="space-y-4">
          <div className="md:hidden space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
          <div className="hidden md:grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="h-6 w-32" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-2xl overflow-hidden border bg-card">
                    <Skeleton className="h-24 w-full rounded-none" />
                    <div className="p-4 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-3 w-2/5" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      )}

      {!isLoading && error && (
        <div className="text-center py-12">
          <p className="text-destructive mb-2">Failed to load classes</p>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Please try again later'}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl mt-4 gap-2"
            onClick={() => {
              void refetch();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !error && (isArchivedView ? (
        <div className="space-y-5">
          {displayedArchivedClasses.length > 0 ? (
            <>
              <div className="md:hidden space-y-3 animate-stagger">
                {displayedArchivedClasses.map((cls) => (
                  <ClassCard
                    key={cls.id}
                    classItem={{ ...cls, archived: true }}
                    onArchive={handleArchiveClass}
                    onUnenroll={handleUnenrollClass}
                    onRestore={handleRestoreClass}
                  />
                ))}
              </div>

              <div className="hidden md:block space-y-5">
                <h2 className="text-lg font-semibold">Archived Classes ({displayedArchivedClasses.length})</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-stagger">
                  {displayedArchivedClasses.map((cls) => (
                    <ClassCard
                      key={cls.id}
                      classItem={{ ...cls, archived: true }}
                      onArchive={handleArchiveClass}
                      onUnenroll={handleUnenrollClass}
                      onRestore={handleRestoreClass}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <div className="mb-3 p-2 bg-blue-100 rounded-full">
                <Archive className="h-8 w-8 text-blue-500" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">
                {searchQuery ? 'No Archived Classes Match Your Search' : 'No Archived Classes'}
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                {searchQuery
                  ? 'Try a different class name, room, section, or schedule keyword.'
                  : "You don't have any archived classes yet. Archive completed classes to keep your dashboard organized."}
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {activeClasses.length > 0 ? (
              <div className="space-y-3 animate-stagger">
                {activeClasses.map((cls) => (
                  <ClassCard
                    key={cls.id}
                    classItem={cls}
                    onArchive={handleArchiveClass}
                    onUnenroll={handleUnenrollClass}
                    onRestore={handleRestoreClass}
                    completion={completionByClass.get(cls.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">
                  {searchQuery
                    ? 'No classes match your search.'
                    : 'No active classes. Join a class to get started!'}
                </p>
              </div>
            )}

            {displayedArchivedClasses.length > 0 && (
              <div className="pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-xl text-muted-foreground"
                  onClick={() => navigate('/archived')}
                >
                  View Archived ({displayedArchivedClasses.length})
                </Button>
              </div>
            )}
          </div>

          <div className="hidden md:grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
            <div className="lg:col-span-2 space-y-4 md:space-y-5">
              {activeClasses.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Your Classes</h2>
                    {displayedArchivedClasses.length > 0 && (
                      <Button variant="ghost" size="sm" className="rounded-xl text-muted-foreground" onClick={() => navigate('/archived')}>
                        View Archived ({displayedArchivedClasses.length})
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 animate-stagger">
                    {activeClasses.map((cls) => (
                      <ClassCard
                        key={cls.id}
                        classItem={cls}
                        onArchive={handleArchiveClass}
                        onUnenroll={handleUnenrollClass}
                        onRestore={handleRestoreClass}
                        completion={completionByClass.get(cls.id)}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-lg">
                    {searchQuery
                      ? 'No classes match your search.'
                      : 'No active classes. Join a class to get started!'}
                  </p>
                </div>
              )}
            </div>
            <div>
              <UpcomingWidget />
            </div>
          </div>
        </>
      ))}
    </div>
  );
}
