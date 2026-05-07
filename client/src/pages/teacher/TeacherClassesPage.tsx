import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClasses } from '@/hooks-api/useClasses';
import { TeacherClassesSection } from '@/components/TeacherClassesSection';
import type { ClassItem } from '@/lib/data';

export default function TeacherClassesPage() {
  const navigate = useNavigate();
  const { data: classesData = [] } = useClasses();
  const [classes, setClasses] = useState<ClassItem[]>([]);

  useEffect(() => {
    setClasses(classesData);
  }, [classesData]);

  return (
    <TeacherClassesSection
      classes={classes}
      onClassesChange={setClasses}
      onSelectClass={(classId) => navigate(`/teacher/classes/${classId}`)}
    />
  );
}
