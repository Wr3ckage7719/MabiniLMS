import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Loader2,
  BookOpen,
  Pencil,
  ChartLine,
  Lock,
  Link as LinkIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  useTeacherLessons,
  useCreateLessonDraft,
  useReorderLessons,
  useSetLessonChain,
} from '@/hooks-api/useLessons';
import type { Lesson } from '@/lib/data';

interface LessonListBoardProps {
  classId: string;
}

export function LessonListBoard({ classId }: LessonListBoardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const lessonsQuery = useTeacherLessons(classId);
  const createDraft = useCreateLessonDraft(classId);
  const reorder = useReorderLessons(classId);
  const setChain = useSetLessonChain(classId);

  const remoteLessons = useMemo(() => lessonsQuery.data ?? [], [lessonsQuery.data]);
  const [localOrder, setLocalOrder] = useState<Lesson[]>(remoteLessons);

  useEffect(() => {
    setLocalOrder(remoteLessons);
  }, [remoteLessons]);

  const totalStudents = useMemo(() => {
    return remoteLessons[0]?.stats?.total_students ?? 0;
  }, [remoteLessons]);

  const handleCreate = async () => {
    try {
      const draft = await createDraft.mutateAsync();
      navigate(`/class/${classId}/lessons/${draft.id}/edit`);
    } catch (error) {
      toast({
        title: 'Could not create lesson',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const persistOrder = async (next: Lesson[]) => {
    setLocalOrder(next);
    try {
      await reorder.mutateAsync(next.map((lesson) => lesson.id));
    } catch (error) {
      toast({
        title: 'Could not save order',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const moveLesson = (lessonId: string, direction: 'up' | 'down') => {
    const idx = localOrder.findIndex((lesson) => lesson.id === lessonId);
    if (idx < 0) return;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= localOrder.length) return;
    const next = [...localOrder];
    [next[idx], next[target]] = [next[target], next[idx]];
    void persistOrder(next);
  };

  const handleChainChange = async (lessonId: string, nextId: string) => {
    const lesson = localOrder.find((l) => l.id === lessonId);
    if (!lesson) return;
    try {
      await setChain.mutateAsync({
        lessonId,
        chain: {
          ...lesson.chain,
          next_lesson_id: nextId === '__none__' ? null : nextId,
        },
      });
    } catch (error) {
      toast({
        title: 'Could not update chain',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (lessonsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading lessons…
      </div>
    );
  }

  if (lessonsQuery.error) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="p-5 text-sm text-destructive">
          Could not load lessons. Please try again later.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base md:text-lg font-semibold">Lessons</h2>
          <p className="text-xs md:text-sm text-muted-foreground">
            Reorder with the arrows. Each lesson's chain target unlocks once it's done.
          </p>
        </div>
        <Button
          onClick={handleCreate}
          disabled={createDraft.isPending}
          className="rounded-xl gap-1.5 flex-shrink-0"
        >
          {createDraft.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          New lesson
        </Button>
      </div>

      {reorder.isPending && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Saving new order…
        </div>
      )}

      {localOrder.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No lessons yet. Create your first one to get started.</p>
            <Button onClick={handleCreate} disabled={createDraft.isPending} className="mt-4 rounded-xl gap-1.5">
              {createDraft.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              New lesson
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 md:space-y-3">
          {localOrder.map((lesson, index) => {
            const stats = lesson.stats;
            const fileCount = lesson.materials.length;
            const assessmentCount = lesson.assessments.length;
            const chainTargetId = lesson.chain.next_lesson_id ?? '__none__';
            const chainOptions = localOrder.filter((other) => other.id !== lesson.id);
            const isFirst = index === 0;
            const isLast = index === localOrder.length - 1;

            return (
              <Card
                key={lesson.id}
                className="border shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 animate-in fade-in slide-in-from-bottom-1"
              >
                <CardContent className="p-4 md:p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1 pt-1">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={isFirst || reorder.isPending}
                        onClick={() => moveLesson(lesson.id, 'up')}
                        aria-label="Move lesson up"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={isLast || reorder.isPending}
                        onClick={() => moveLesson(lesson.id, 'down')}
                        aria-label="Move lesson down"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
                          Lesson {lesson.ordering.toString().padStart(2, '0')}
                        </span>
                        {lesson.isPublished ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-emerald-50 text-emerald-700 border-emerald-200">
                            Published
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-amber-50 text-amber-700 border-amber-200">
                            Draft
                          </Badge>
                        )}
                        {lesson.topics.map((topic) => (
                          <Badge
                            key={topic}
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-5 rounded-full border-primary/40 bg-primary/5 text-primary"
                          >
                            {topic}
                          </Badge>
                        ))}
                      </div>

                      <h3 className="text-base md:text-lg font-semibold mt-1 leading-snug truncate">
                        {lesson.title}
                      </h3>

                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span>
                          {fileCount} file{fileCount === 1 ? '' : 's'}
                        </span>
                        <span>·</span>
                        <span>
                          {assessmentCount} assessment{assessmentCount === 1 ? '' : 's'}
                        </span>
                        {stats && totalStudents > 0 && (
                          <>
                            <span>·</span>
                            <span>
                              {stats.completed_students} of {stats.total_students} done
                            </span>
                          </>
                        )}
                      </div>

                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <LinkIcon className="h-3.5 w-3.5" /> Chain to:
                        </span>
                        <Select
                          value={chainTargetId}
                          onValueChange={(value) => handleChainChange(lesson.id, value)}
                          disabled={setChain.isPending}
                        >
                          <SelectTrigger className="h-8 text-xs w-56">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No next lesson</SelectItem>
                            {chainOptions.map((option) => (
                              <SelectItem key={option.id} value={option.id}>
                                {option.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {lesson.chain.unlock_on_pass && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                            <Lock className="h-3 w-3 mr-1" />
                            Pass {lesson.chain.pass_threshold_percent ?? 75}%
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl gap-1.5"
                        onClick={() =>
                          navigate(`/class/${classId}/lessons/${lesson.id}/edit`)
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-xl gap-1.5 text-muted-foreground"
                        onClick={() =>
                          navigate(`/class/${classId}/lessons/${lesson.id}`)
                        }
                      >
                        <ChartLine className="h-3.5 w-3.5" /> Preview
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default LessonListBoard;
