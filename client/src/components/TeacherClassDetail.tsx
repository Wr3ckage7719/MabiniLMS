import { ArrowLeft } from 'lucide-react';
import { mockClasses } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { TeacherClassStream } from './TeacherClassStream';

interface TeacherClassDetailProps {
  classId?: string;
  onBack?: () => void;
}

export function TeacherClassDetail(props: TeacherClassDetailProps) {
  const { classId: propClassId, onBack } = props;
  const id = propClassId;

  const cls = id ? mockClasses.find((c) => c.id === id) : null;

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
            classId={cls.id}
            className={cls.name}
            classColor="blue"
            section={cls.section}
            room={cls.room}
            schedule={cls.schedule}
          />
        </div>
      </div>
    </div>
  );
}
