import { useState } from 'react';
import {
  BookOpen,
  Search,
  Grid2X2,
  List,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useTeacherCourses } from '@/hooks/useTeacherData';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TeacherClassesSectionProps {
  onSelectClass: (classId: string) => void;
}

// Color mapping for courses (assign colors based on index or title hash)
const COURSE_COLORS = ['blue', 'teal', 'purple', 'orange', 'pink', 'green'] as const;

function getCourseColor(courseId: string, index: number): string {
  // Use a simple hash of the ID to get consistent colors
  const hash = courseId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return COURSE_COLORS[(hash + index) % COURSE_COLORS.length];
}

export function TeacherClassesSection({ onSelectClass }: TeacherClassesSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Fetch real courses from API
  const { courses, loading, error, refetch } = useTeacherCourses({ 
    status: 'published',
    includeEnrollmentCount: true,
  });

  // Filter classes based on search
  const filteredClasses = courses.filter((course) => {
    const matchesSearch =
      course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (course.section?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const getClassColorGradient = (color: string) => {
    const gradients: Record<string, string> = {
      blue: 'from-blue-400 to-blue-600',
      teal: 'from-teal-400 to-teal-600',
      purple: 'from-purple-400 to-purple-600',
      orange: 'from-orange-400 to-orange-600',
      pink: 'from-pink-400 to-pink-600',
      green: 'from-green-400 to-green-600',
    };
    return gradients[color] || gradients.blue;
  };

  // Loading state
  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading your classes...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
          <p className="text-destructive">{error}</p>
          <Button variant="outline" onClick={() => refetch()}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto animate-fade-in">
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold">My Classes</h1>
          <p className="text-muted-foreground">
            Manage and view all your active classes
          </p>
        </div>

        {/* Controls Bar */}
        <div className="flex flex-col gap-4 md:gap-0 md:flex-row md:items-center md:justify-between">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search classes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-lg border-border"
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="icon"
              className="rounded-lg"
              onClick={() => setViewMode('grid')}
            >
              <Grid2X2 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="icon"
              className="rounded-lg"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Classes Display */}
        {filteredClasses.length > 0 ? (
          <>
            {/* Class Count */}
            <div className="text-sm text-muted-foreground">
              Showing {filteredClasses.length} of {courses.length} classes
            </div>

            {/* Grid View */}
            {viewMode === 'grid' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-stagger">
                {filteredClasses.map((course, idx) => {
                  const color = getCourseColor(course.id, idx);
                  return (
                    <Card
                      key={course.id}
                      className="border-0 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group cursor-pointer"
                      style={{
                        animation: `fade-in 0.5s ease-out ${idx * 50}ms both`,
                      }}
                      onClick={() => onSelectClass(course.id)}
                    >
                      {/* Class Header Image */}
                      <div
                        className={`h-32 bg-gradient-to-br ${getClassColorGradient(
                          color
                        )} relative overflow-hidden group-hover:opacity-90 transition-opacity`}
                      >
                        {/* Decorative elements */}
                        <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-white/10" />
                        <div className="absolute -left-8 -bottom-8 w-32 h-32 rounded-full bg-white/5" />
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
                      </div>

                      {/* Content */}
                      <CardContent className="p-5 space-y-4">
                        {/* Class Information */}
                        <div className="space-y-1">
                          <h3 className="text-lg font-semibold line-clamp-2 group-hover:text-primary transition-colors">
                            {course.title}
                          </h3>
                          <p className="text-sm text-muted-foreground">{course.section || 'No section'}</p>
                        </div>

                        {/* Room and Schedule */}
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <div>
                            <span className="font-medium text-gray-900">{course.room || 'No room assigned'}</span>
                          </div>
                          <div>
                            {course.schedule || 'No schedule set'}
                          </div>
                        </div>

                        {/* Student Count at Bottom */}
                        <div className="pt-3 border-t border-border/50">
                          <p className="text-xs text-muted-foreground">
                            {course.enrollment_count || 0} {(course.enrollment_count || 0) === 1 ? 'student' : 'students'}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* List View */}
            {viewMode === 'list' && (
              <div className="space-y-3 animate-stagger">
                {filteredClasses.map((course, idx) => {
                  const color = getCourseColor(course.id, idx);
                  return (
                    <Card
                      key={course.id}
                      className="border-0 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden cursor-pointer"
                      style={{
                        animation: `fade-in 0.5s ease-out ${idx * 40}ms both`,
                      }}
                      onClick={() => onSelectClass(course.id)}
                    >
                      <CardContent className="p-4 md:p-5">
                        <div className="flex items-center gap-4">
                          {/* Color Badge */}
                          <div
                            className={`h-12 w-12 rounded-lg bg-gradient-to-br ${getClassColorGradient(
                              color
                            )} flex-shrink-0`}
                          />

                          {/* Class Info */}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold group-hover:text-primary transition-colors line-clamp-1">
                              {course.title}
                            </h3>
                            <p className="text-sm text-muted-foreground">{course.section || 'No section'}</p>
                            <div className="text-xs text-muted-foreground mt-1">
                              {course.room || 'No room'} • {course.schedule || 'No schedule'}
                            </div>
                          </div>

                          {/* Student Count */}
                          <div className="hidden md:flex items-center flex-col gap-1 text-sm">
                            <span className="font-medium">{course.enrollment_count || 0}</span>
                            <span className="text-xs text-muted-foreground">
                              {(course.enrollment_count || 0) === 1 ? 'student' : 'students'}
                            </span>
                          </div>

                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-2xl flex items-center justify-center">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">
              {searchQuery ? 'No classes found' : 'No classes yet'}
            </h3>
            <p className="text-muted-foreground max-w-sm">
              {searchQuery 
                ? 'Try adjusting your search query.'
                : 'Create your first class to start teaching and engaging with students.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
