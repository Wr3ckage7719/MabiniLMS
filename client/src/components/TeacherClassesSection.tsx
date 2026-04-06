import { useState } from 'react';
import {
  BookOpen,
  Search,
  Grid2X2,
  List,
} from 'lucide-react';
import { mockClasses } from '@/lib/data';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TeacherClassesSectionProps {
  onSelectClass: (classId: string) => void;
}

export function TeacherClassesSection({ onSelectClass }: TeacherClassesSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Filter classes
  const filteredClasses = mockClasses.filter((cls) => {
    const matchesSearch =
      cls.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.section.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch && !cls.archived;
  });

  const formatSchedule = (schedule: string) => {
    // Just extract the day part and time, keeping it compact
    // e.g., "MWF 9:00 AM - 10:30 AM" stays as is
    return schedule;
  };

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
              Showing {filteredClasses.length} of {mockClasses.filter(c => !c.archived).length} classes
            </div>

            {/* Grid View */}
            {viewMode === 'grid' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-stagger">
                {filteredClasses.map((cls, idx) => (
                  <Card
                    key={cls.id}
                    className="border-0 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group cursor-pointer"
                    style={{
                      animation: `fade-in 0.5s ease-out ${idx * 50}ms both`,
                    }}
                    onClick={() => onSelectClass(cls.id)}
                  >
                    {/* Class Header Image */}
                    <div
                      className={`h-32 bg-gradient-to-br ${getClassColorGradient(
                        cls.color
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
                          {cls.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">{cls.section}</p>
                      </div>

                      {/* Room and Schedule */}
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div>
                          <span className="font-medium text-gray-900">{cls.room}</span>
                        </div>
                        <div>
                          {formatSchedule(cls.schedule)}
                        </div>
                      </div>

                      {/* Student Count at Bottom */}
                      <div className="pt-3 border-t border-border/50">
                        <p className="text-xs text-muted-foreground">
                          {cls.students} {cls.students === 1 ? 'student' : 'students'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* List View */}
            {viewMode === 'list' && (
              <div className="space-y-3 animate-stagger">
                {filteredClasses.map((cls, idx) => (
                  <Card
                    key={cls.id}
                    className="border-0 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden cursor-pointer"
                    style={{
                      animation: `fade-in 0.5s ease-out ${idx * 40}ms both`,
                    }}
                    onClick={() => onSelectClass(cls.id)}
                  >
                    <CardContent className="p-4 md:p-5">
                      <div className="flex items-center gap-4">
                        {/* Color Badge */}
                        <div
                          className={`h-12 w-12 rounded-lg bg-gradient-to-br ${getClassColorGradient(
                            cls.color
                          )} flex-shrink-0`}
                        />

                        {/* Class Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold group-hover:text-primary transition-colors line-clamp-1">
                            {cls.name}
                          </h3>
                          <p className="text-sm text-muted-foreground">{cls.section}</p>
                          <div className="text-xs text-muted-foreground mt-1">
                            {cls.room} • {formatSchedule(cls.schedule)}
                          </div>
                        </div>

                        {/* Student Count */}
                        <div className="hidden md:flex items-center flex-col gap-1 text-sm">
                          <span className="font-medium">{cls.students}</span>
                          <span className="text-xs text-muted-foreground">
                            {cls.students === 1 ? 'student' : 'students'}
                          </span>
                        </div>

                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-2xl flex items-center justify-center">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No classes found</h3>
            <p className="text-muted-foreground max-w-sm">
              Try adjusting your search filters or create a new class to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
