import { TeacherPanel } from '@/components/TeacherPanel';
import { RoleProvider } from '@/contexts/RoleContext';
import { ClassesProvider } from '@/contexts/ClassesContext';

export default function TeacherDemoPage() {
  return (
    <RoleProvider>
      <ClassesProvider>
        <TeacherPanel />
      </ClassesProvider>
    </RoleProvider>
  );
}
