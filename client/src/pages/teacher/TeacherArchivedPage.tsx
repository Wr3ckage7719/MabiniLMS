import { useClasses } from '@/hooks-api/useClasses';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function TeacherArchivedPage() {
  const { data: classes = [] } = useClasses();
  const archivedClasses = classes.filter((course) => course.archived);

  return (
    <div className="w-full h-full overflow-auto animate-fade-in">
      <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Archived Classes</h1>
          <p className="text-muted-foreground">Classes you have archived.</p>
        </div>

        {archivedClasses.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No archived classes found.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {archivedClasses.map((course) => (
              <Card key={course.id} className="border-0 shadow-sm">
                <CardContent className="p-5 space-y-2">
                  <h3 className="font-semibold">{course.name}</h3>
                  <p className="text-sm text-muted-foreground">{course.section}</p>
                  <p className="text-xs text-muted-foreground">{course.room} • {course.schedule}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
