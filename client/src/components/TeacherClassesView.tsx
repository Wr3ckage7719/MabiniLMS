import { useEffect, useState } from 'react';
import { TeacherClassesSection } from './TeacherClassesSection';
import { TeacherClassDetail } from './TeacherClassDetail';
import { ClassItem } from '@/lib/data';

interface TeacherClassesViewProps {
  classes: ClassItem[];
  onClassesChange: (classes: ClassItem[]) => void;
  searchQuery?: string;
  onSearchQueryChange?: (value: string) => void;
}

export function TeacherClassesView({
  classes,
  onClassesChange,
  searchQuery,
  onSearchQueryChange,
}: TeacherClassesViewProps) {
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  useEffect(() => {
    if ((searchQuery || '').trim().length > 0) {
      setSelectedClassId(null);
    }
  }, [searchQuery]);

  if (selectedClassId) {
    const selectedClass = classes.find((item) => item.id === selectedClassId) || null;
    return (
      <TeacherClassDetailWrapper
        classId={selectedClassId}
        classItem={selectedClass}
        onBack={() => setSelectedClassId(null)}
      />
    );
  }

  return (
    <TeacherClassesSection 
      onSelectClass={setSelectedClassId} 
      classes={classes}
      onClassesChange={onClassesChange}
      searchQuery={searchQuery}
      onSearchQueryChange={onSearchQueryChange}
    />
  );
}

interface TeacherClassDetailWrapperProps {
  classId: string;
  classItem: ClassItem | null;
  onBack: () => void;
}

function TeacherClassDetailWrapper({ classId, classItem, onBack }: TeacherClassDetailWrapperProps) {
  return (
    <div>
      <TeacherClassDetail classId={classId} classItem={classItem} onBack={onBack} />
    </div>
  );
}
