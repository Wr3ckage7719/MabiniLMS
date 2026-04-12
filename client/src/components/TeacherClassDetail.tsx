import { ArrowLeft } from 'lucide-react';
import { ClassItem } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { TeacherClassStream } from './TeacherClassStream';

interface TeacherClassDetailProps {
  classId?: string;
  classItem?: ClassItem | null;
  onBack?: () => void;
}

export function TeacherClassDetail(props: TeacherClassDetailProps) {
  const { classId: propClassId, classItem, onBack } = props;
  const cls = classItem ?? null;

  if (!cls) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Class not found</h1>
          <Button onClick={onBack} className="mt-4">
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto">
      <div className="p-4 md:p-6 lg:p-8">
        <Button
          variant="ghost"
          onClick={onBack}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="max-w-7xl mx-auto space-y-6">
          <TeacherClassStream
            classId={propClassId || cls.id}
            className={cls.name}
            classColor={cls.color}
            classCoverImage={cls.coverImage}
            block={cls.block}
            level={cls.level}
            room={cls.room}
            schedule={cls.schedule}
          />
        </div>
      </div>
    </div>
  );
}
