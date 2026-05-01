import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Tag, BookOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStudentLessons } from '@/hooks-api/useLessons';
import { LessonCard } from './LessonCard';

interface LessonsTabProps {
  classId: string;
}

export function LessonsTab({ classId }: LessonsTabProps) {
  const navigate = useNavigate();
  const lessonsQuery = useStudentLessons(classId);
  const [topicFilter, setTopicFilter] = useState<string>('all');

  const lessons = useMemo(() => lessonsQuery.data ?? [], [lessonsQuery.data]);

  const availableTopics = useMemo(() => {
    const set = new Set<string>();
    for (const lesson of lessons) {
      for (const topic of lesson.topics) set.add(topic);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [lessons]);

  const filtered = useMemo(() => {
    if (topicFilter === 'all') return lessons;
    return lessons.filter((lesson) => lesson.topics.includes(topicFilter));
  }, [lessons, topicFilter]);

  const totalCount = lessons.length;
  const doneCount = lessons.filter((lesson) => lesson.status === 'done').length;
  const percent = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  const handleOpen = (lessonId: string) => {
    navigate(`/class/${classId}/lessons/${lessonId}`);
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

  if (totalCount === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center text-muted-foreground">
          <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Your teacher hasn't posted any lessons yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm bg-gradient-to-br from-primary/5 to-primary/0">
        <CardContent className="p-4 md:p-5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-xs md:text-sm font-semibold">Lesson progress</p>
            <p className="text-xs md:text-sm font-medium text-primary">
              {doneCount}/{totalCount} done · {percent}%
            </p>
          </div>
          <Progress value={percent} className="h-2" />
          <p className="text-[11px] md:text-xs text-muted-foreground mt-2">
            Lessons unlock in order. Finish each one's reading and assessment to advance.
          </p>
        </CardContent>
      </Card>

      {availableTopics.length > 0 && (
        <div className="flex justify-end">
          <Select value={topicFilter} onValueChange={setTopicFilter}>
            <SelectTrigger
              className="w-full md:w-56 rounded-lg h-9 text-xs md:text-sm"
              aria-label="Filter lessons by topic"
            >
              <Tag className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All topics</SelectItem>
              {availableTopics.map((topic) => (
                <SelectItem key={topic} value={topic}>
                  {topic}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2 md:space-y-3">
        {filtered.map((lesson) => (
          <LessonCard key={lesson.id} lesson={lesson} onOpen={handleOpen} />
        ))}
        {filtered.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No lessons tagged "{topicFilter}".{' '}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => setTopicFilter('all')}
              >
                Clear filter
              </button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default LessonsTab;
