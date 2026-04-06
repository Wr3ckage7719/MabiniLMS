import { TeacherPanel } from '@/components/TeacherPanel';
import { RoleProvider } from '@/contexts/RoleContext';

export default function TeacherDemoPage() {
  return (
    <RoleProvider>
      <TeacherPanel />
    </RoleProvider>
  );
}
