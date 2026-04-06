import { useRole } from '@/contexts/RoleContext';
import { GraduationCap, User } from 'lucide-react';

export function RoleToggle() {
  const { role, setRole } = useRole();

  return (
    <div className="flex items-center gap-1 bg-secondary/60 rounded-xl p-1">
      <button
        onClick={() => setRole('teacher')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          role === 'teacher'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <GraduationCap className="h-3.5 w-3.5" />
        Teacher
      </button>
      <button
        onClick={() => setRole('student')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
          role === 'student'
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <User className="h-3.5 w-3.5" />
        Student
      </button>
    </div>
  );
}
