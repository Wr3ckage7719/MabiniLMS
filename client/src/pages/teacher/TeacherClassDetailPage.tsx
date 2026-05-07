import { useParams, useNavigate } from 'react-router-dom';
import { useClasses } from '@/hooks-api/useClasses';
import { TeacherClassDetail } from '@/components/TeacherClassDetail';

export default function TeacherClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { data: classes = [] } = useClasses();
  const classItem = classes.find((c) => c.id === classId) ?? null;

  return (
    <TeacherClassDetail
      classId={classId}
      classItem={classItem}
      onBack={() => navigate('/teacher/classes')}
    />
  );
}
