import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useClasses } from '@/hooks-api/useClasses';
import { ClassCard } from '@/components/ClassCard';
import { UpcomingWidget } from '@/components/UpcomingWidget';
import { StatsBar } from '@/components/StatsBar';
import { Button } from '@/components/ui/button';
import { useRole } from '@/contexts/RoleContext';
import { Loader2, RefreshCw } from 'lucide-react';

export default function Dashboard() {
  const { currentUserName } = useRole();
  const location = useLocation();
  const navigate = useNavigate();
  // Fetch real classes from API
  const { data: allClasses = [], isLoading, error, refetch } = useClasses();

  const isArchivedView = location.pathname === '/archived';

  const activeClasses = useMemo(() => allClasses.filter((cls) => !cls.archived), [allClasses]);
  const displayedArchivedClasses = useMemo(() => allClasses.filter((cls) => !!cls.archived), [allClasses]);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Welcome back, {currentUserName}</h1>
        {isArchivedView ? (
          <p className="text-muted-foreground mt-1">View and restore your archived classes.</p>
        ) : (
          <p className="text-muted-foreground mt-1">Here's what's happening in your classes today.</p>
        )}
      </div>

      {!isArchivedView && <StatsBar />}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="text-center py-12">
          <p className="text-destructive mb-2">Failed to load classes</p>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Please try again later'}
          </p>
          <Button variant="outline" size="sm" className="rounded-xl mt-4 gap-2" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      )}

      {isArchivedView && !isLoading && !error ? (
        <div className="space-y-5">
          {displayedArchivedClasses.length > 0 ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Archived Classes ({displayedArchivedClasses.length})</h2>
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => navigate('/dashboard')}>
                  Back to Active
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-stagger">
                {displayedArchivedClasses.map((cls) => (
                  <ClassCard 
                    key={cls.id} 
                    classItem={{ ...cls, archived: true }}
                    onArchive={() => {}}
                    onUnenroll={() => {}}
                    onRestore={() => {}}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg">No archived classes yet.</p>
              <Button variant="outline" size="sm" className="rounded-xl mt-4" onClick={() => navigate('/dashboard')}>
                Back to Active
              </Button>
            </div>
          )}
        </div>
      ) : !isLoading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-5">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-stagger">
                  {activeClasses.map((cls) => (
                    <ClassCard 
                      key={cls.id} 
                      classItem={cls}
                      onArchive={() => {}}
                      onUnenroll={() => {}}
                      onRestore={() => {}}
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
      )}
    </div>
  );
}
