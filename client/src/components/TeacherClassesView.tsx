import { useEffect, useState } from 'react';
import { TeacherClassesSection } from './TeacherClassesSection';
import { TeacherClassDetail } from './TeacherClassDetail';
import { ClassItem } from '@/lib/data';
import { useSearchParams } from 'react-router-dom';

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
  const [searchParams, setSearchParams] = useSearchParams();

  const handleSelectClass = (classId: string) => {
    setSelectedClassId(classId);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('view', 'classes');
    nextParams.set('classId', classId);
    nextParams.set('tab', 'classwork');
    nextParams.delete('builder');
    setSearchParams(nextParams, { replace: false });
  };

  const handleBackToClasses = () => {
    setSelectedClassId(null);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('view', 'classes');
    nextParams.delete('classId');
    nextParams.delete('tab');
    nextParams.delete('builder');
    setSearchParams(nextParams, { replace: true });
  };

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
        onBack={handleBackToClasses}
      />
    );
  }

  return (
    <TeacherClassesSection 
      onSelectClass={handleSelectClass} 
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
