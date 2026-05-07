import InteractiveCalendar from '@/components/InteractiveCalendar';

export default function TeacherCalendarPage() {
  return (
    <div className="w-full h-full overflow-auto animate-fade-in">
      <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
        <InteractiveCalendar />
      </div>
    </div>
  );
}
