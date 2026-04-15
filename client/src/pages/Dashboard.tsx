import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Archive, RefreshCw } from 'lucide-react';
import { ClassCard } from '@/components/ClassCard';
import { StudentInvitations } from '@/components/StudentInvitations';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRole } from '@/contexts/RoleContext';
import { useClasses as useClassActions } from '@/contexts/ClassesContext';
import { useClasses as useApiClasses } from '@/hooks-api/useClasses';
import { useAssignments } from '@/hooks-api/useAssignments';

const StatsBar = lazy(() => import('@/components/StatsBar').then((module) => ({ default: module.StatsBar })));
const UpcomingWidget = lazy(() => import('@/components/UpcomingWidget').then((module) => ({ default: module.UpcomingWidget })));

const HEAVY_WIDGETS_MOUNT_DELAY_MS = 140;

function StatsBarFallback() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-2xl bg-card shadow-sm border-0 p-4 min-h-[88px]">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-10" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function UpcomingWidgetFallback() {
  return (
    <div className="rounded-2xl border bg-card shadow-sm p-6 min-h-[360px] space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-5 w-40" />
      </div>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-border/50 p-3 space-y-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

function MobileClassesLoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-2xl border bg-card p-4 space-y-3 min-h-[168px]">
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-4 w-4/5" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-8 flex-1" />
            <Skeleton className="h-8 flex-1" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DesktopActiveClassesLoadingSkeleton() {
  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-2xl border bg-card p-4 space-y-3 min-h-[168px]">
            <Skeleton className="h-5 w-3/5" />
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-4/5" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-8 flex-1" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArchivedClassesLoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="md:hidden space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-2xl border bg-card p-4 space-y-3 min-h-[168px]">
            <Skeleton className="h-5 w-3/5" />
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ))}
      </div>

      <div className="hidden md:block space-y-5">
        <Skeleton className="h-6 w-56" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-2xl border bg-card p-4 space-y-3 min-h-[168px]">
              <Skeleton className="h-5 w-3/5" />
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { currentUserName } = useRole();
  const { archivedClasses, unenrolledClasses, handleArchive, handleUnenroll, handleRestore } = useClassActions();
  const {
    data: classes = [],
    isLoading,
    error,
    refetch,
  } = useApiClasses();
  const location = useLocation();
  const navigate = useNavigate();
  const [mountHeavyWidgets, setMountHeavyWidgets] = useState(false);

  const isArchivedView = location.pathname === '/archived';

  useEffect(() => {
    if (isArchivedView) {
      setMountHeavyWidgets(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setMountHeavyWidgets(true);
    }, HEAVY_WIDGETS_MOUNT_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isArchivedView]);

  const {
    data: assignments = [],
    isLoading: isAssignmentsLoading,
  } = useAssignments(undefined, {
    enabled: mountHeavyWidgets && !isArchivedView,
  });

  const activeClasses = useMemo(
    () => classes.filter((cls) => !cls.archived && !archivedClasses.includes(cls.id) && !unenrolledClasses.includes(cls.id)),
    [classes, archivedClasses, unenrolledClasses]
  );

  const displayedArchivedClasses = useMemo(
    () => classes.filter((cls) => cls.archived || archivedClasses.includes(cls.id)),
    [classes, archivedClasses]
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
          <Suspense fallback={<StatsBarFallback />}>
            {mountHeavyWidgets ? (
              <StatsBar classes={classes} assignments={assignments} isLoading={isAssignmentsLoading} />
            ) : (
              <StatsBarFallback />
            )}
          </Suspense>
        </div>
      )}

      {!isArchivedView && (
        <div className="hidden md:block">
          <StudentInvitations />
        </div>
      )}

      {isLoading && (
        isArchivedView ? (
          <ArchivedClassesLoadingSkeleton />
        ) : (
          <>
            <div className="md:hidden">
              <MobileClassesLoadingSkeleton />
            </div>

            <div className="hidden md:grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
              <div className="lg:col-span-2">
                <DesktopActiveClassesLoadingSkeleton />
              </div>
              <div>
                <UpcomingWidgetFallback />
              </div>
            </div>
          </>
        )
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
              <h3 className="text-base font-semibold text-slate-900 mb-1">No Archived Classes</h3>
              <p className="text-sm text-slate-600 text-center max-w-md">
                You don't have any archived classes yet. Archive completed classes to keep your dashboard organized.
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
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No active classes. Join a class to get started!</p>
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
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-lg">No active classes. Join a class to get started!</p>
                </div>
              )}
            </div>
            <div>
              <Suspense fallback={<UpcomingWidgetFallback />}>
                {mountHeavyWidgets ? (
                  <UpcomingWidget classes={classes} assignments={assignments} isLoading={isAssignmentsLoading} />
                ) : (
                  <UpcomingWidgetFallback />
                )}
              </Suspense>
            </div>
          </div>
        </>
      ))}
    </div>
  );
}
