import { useState } from 'react';
import { TeacherClassesSection } from './TeacherClassesSection';
import { TeacherClassDetail } from './TeacherClassDetail';

export function TeacherClassesView() {
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  if (selectedClassId) {
    return <TeacherClassDetailWrapper classId={selectedClassId} onBack={() => setSelectedClassId(null)} />;
  }

  return <TeacherClassesSection onSelectClass={setSelectedClassId} />;
}

interface TeacherClassDetailWrapperProps {
  classId: string;
  onBack: () => void;
}

function TeacherClassDetailWrapper({ classId, onBack }: TeacherClassDetailWrapperProps) {
  return (
    <div>
      <TeacherClassDetail classId={classId} onBack={onBack} />
    </div>
  );
}
