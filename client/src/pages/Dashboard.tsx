import { useLocation, useNavigate } from 'react-router-dom';
import { Archive, Loader2, RefreshCw } from 'lucide-react';
import { ClassCard } from '@/components/ClassCard';
import { StudentInvitations } from '@/components/StudentInvitations';
import { UpcomingWidget } from '@/components/UpcomingWidget';
import { StatsBar } from '@/components/StatsBar';
import { Button } from '@/components/ui/button';
import { useRole } from '@/contexts/RoleContext';
import { useClasses as useClassActions } from '@/contexts/ClassesContext';
import { useClasses as useApiClasses } from '@/hooks-api/useClasses';

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

  const isArchivedView = location.pathname === '/archived';

  const activeClasses = classes.filter(
    (cls) => !cls.archived && !archivedClasses.includes(cls.id) && !unenrolledClasses.includes(cls.id)
  );

  const displayedArchivedClasses = classes.filter(
    (cls) => cls.archived || archivedClasses.includes(cls.id)
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
    <div className="p-3 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8 animate-fade-in">
      <div>
        <h1 className="text-xl md:text-3xl font-bold">Welcome back, {currentUserName}</h1>
        {isArchivedView ? (
          <p className="text-muted-foreground mt-1">View and restore your archived classes.</p>
        ) : (
          <p className="text-muted-foreground mt-1">Here's what's happening in your classes today.</p>
        )}
      </div>

      {!isArchivedView && <StatsBar />}

      {!isArchivedView && <StudentInvitations />}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
            <div className="space-y-5">
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
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
            <UpcomingWidget />
          </div>
        </div>
      ))}
    </div>
  );
}
