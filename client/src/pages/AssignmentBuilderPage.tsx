import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTeacherLesson } from '@/hooks-api/useLessons';
import { CreateAssignmentDialog, type TaskType } from '@/components/CreateAssignmentDialog';

const VALID_TASK_TYPES: TaskType[] = ['activity', 'quiz', 'exam'];

const isValidTaskType = (value: string | undefined): value is TaskType =>
  Boolean(value) && VALID_TASK_TYPES.includes(value as TaskType);

export default function AssignmentBuilderPage() {
  const { id, lessonId, taskType: taskTypeParam } = useParams();
  const classId = id ?? '';
  const navigate = useNavigate();

  const lessonQuery = useTeacherLesson(classId, lessonId);
  const lesson = lessonQuery.data ?? null;

  const taskType = useMemo<TaskType | null>(() => {
    if (taskTypeParam && isValidTaskType(taskTypeParam)) {
      return taskTypeParam;
    }
    return null;
  }, [taskTypeParam]);

  const goBack = () => {
    if (lessonId) {
      navigate(`/class/${classId}/lessons/${lessonId}/edit`);
    } else {
      navigate(`/class/${classId}`);
    }
  };

  useEffect(() => {
    if (!taskType) {
      goBack();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskType]);

  if (!taskType) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-xl gap-1.5"
            onClick={goBack}
          >
            <ArrowLeft className="h-4 w-4" /> Back to lesson
          </Button>
          <div className="ml-auto text-xs text-muted-foreground truncate">
            {lesson ? `Lesson · ${lesson.title}` : null}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 md:px-6 py-6">
        <CreateAssignmentDialog
          open
          isPage
          onOpenChange={(next) => {
            if (!next) goBack();
          }}
          classId={classId}
          lessonId={lessonId}
          initialTaskType={taskType}
          onCreated={goBack}
        />
      </main>
    </div>
  );
}
