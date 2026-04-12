import { useState } from 'react';
import {
  BookOpen,
  Search,
  Grid2X2,
  List,
  ArrowUpDown,
  Pencil,
  MoreVertical,
  Archive,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { ClassItem } from '@/lib/data';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EditClassDialog } from '@/components/EditClassDialog';
import { coursesService } from '@/services/courses.service';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface TeacherClassesSectionProps {
  onSelectClass: (classId: string) => void;
  classes: ClassItem[];
  onClassesChange: (classes: ClassItem[]) => void;
}

export function TeacherClassesSection({ onSelectClass, classes, onClassesChange }: TeacherClassesSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'students' | 'pending'>('name-asc');
  const [editOpen, setEditOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [confirmAction, setConfirmAction] = useState<'archive' | 'delete' | 'restore' | null>(null);
  const [actionClass, setActionClass] = useState<ClassItem | null>(null);
  const { toast } = useToast();

  // Filter classes
  const activeClasses = classes.filter((cls) => !cls.archived);
  const archivedClasses = classes.filter((cls) => cls.archived);

  const sortClassItems = (items: ClassItem[]) => {
    return [...items].sort((a, b) => {
      if (sortBy === 'name-desc') {
        return b.name.localeCompare(a.name);
      }

      if (sortBy === 'students') {
        return b.students - a.students || a.name.localeCompare(b.name);
      }

      if (sortBy === 'pending') {
        return b.pendingAssignments - a.pendingAssignments || a.name.localeCompare(b.name);
      }

      return a.name.localeCompare(b.name);
    });
  };
  
  const filteredClasses = sortClassItems(activeClasses.filter((cls) => {
    const block = cls.block || '';
    const level = cls.level || '';
    const matchesSearch =
      cls.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      block.toLowerCase().includes(searchQuery.toLowerCase()) ||
      level.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.room.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  }));

  const filteredArchivedClasses = sortClassItems(archivedClasses.filter((cls) => {
    const block = cls.block || '';
    const level = cls.level || '';
    const matchesSearch =
      cls.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      block.toLowerCase().includes(searchQuery.toLowerCase()) ||
      level.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cls.room.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  }));

  const handleEditClass = (classItem: ClassItem) => {
    setSelectedClass(classItem);
    setEditOpen(true);
  };

  const handleEditSave = (updatedClass: Partial<ClassItem>) => {
    if (!selectedClass) return;
    const updatedClasses = classes.map((cls) =>
      cls.id === selectedClass.id ? { ...cls, ...updatedClass } : cls
    );
    onClassesChange(updatedClasses);
    setEditOpen(false);
  };

  const handleArchive = (classItem: ClassItem) => {
    setActionClass(classItem);
    setConfirmAction('archive');
  };

  const handleDelete = (classItem: ClassItem) => {
    setActionClass(classItem);
    setConfirmAction('delete');
  };

  const handleRestore = (classItem: ClassItem) => {
    setActionClass(classItem);
    setConfirmAction('restore');
  };

  const confirmArchive = async () => {
    if (!actionClass) return;

    try {
      await coursesService.archiveCourse(actionClass.id);
      const updatedClasses = classes.map((cls) =>
        cls.id === actionClass.id ? { ...cls, archived: true } : cls
      );
      onClassesChange(updatedClasses);
      toast({
        title: 'Class archived',
        description: 'The class has been moved to archived.',
      });
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Failed to archive class';
      toast({
        title: 'Archive failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setConfirmAction(null);
      setActionClass(null);
    }
  };

  const confirmDelete = async () => {
    if (!actionClass) return;

    try {
      await coursesService.deleteCourse(actionClass.id);
      const updatedClasses = classes.filter((cls) => cls.id !== actionClass.id);
      onClassesChange(updatedClasses);
      toast({
        title: 'Class deleted',
        description: 'The class has been permanently deleted.',
      });
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Failed to delete class';
      toast({
        title: 'Delete failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setConfirmAction(null);
      setActionClass(null);
    }
  };

  const confirmRestore = async () => {
    if (!actionClass) return;

    try {
      await coursesService.unarchiveCourse(actionClass.id);
      const updatedClasses = classes.map((cls) =>
        cls.id === actionClass.id ? { ...cls, archived: false } : cls
      );
      onClassesChange(updatedClasses);
      toast({
        title: 'Class restored',
        description: 'The class is active again.',
      });
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Failed to restore class';
      toast({
        title: 'Restore failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setConfirmAction(null);
      setActionClass(null);
    }
  };

  const formatSchedule = (schedule: string) => {
    // Just extract the day part and time, keeping it compact
    // e.g., "MWF 9:00 AM - 10:30 AM" stays as is
    return schedule;
  };

  const formatSectionLine = (cls: ClassItem) => {
    const block = (cls.block || '').trim();
    const level = (cls.level || '').trim();
    const section = (cls.section || '').trim();

    if (block && level) {
      return `Block ${block} • ${level}`;
    }

    if (section) {
      return section;
    }

    if (block) {
      return `Block ${block}`;
    }

    if (level) {
      return level;
    }

    return 'Section TBA';
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

          {/* Sort */}
          <div className="w-full md:w-56 md:ml-4">
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
              <SelectTrigger className="rounded-lg">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Sort classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name-asc">Name (A to Z)</SelectItem>
                <SelectItem value="name-desc">Name (Z to A)</SelectItem>
                <SelectItem value="students">Most Students</SelectItem>
                <SelectItem value="pending">Most Pending Work</SelectItem>
              </SelectContent>
            </Select>
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
              Showing {filteredClasses.length} of {activeClasses.length} active classes
            </div>

            {/* Grid View */}
            {viewMode === 'grid' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-stagger">
                {filteredClasses.map((cls, idx) => (
                  <Card
                    key={cls.id}
                    className="border-0 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group relative"
                    style={{
                      animation: `fade-in 0.5s ease-out ${idx * 50}ms both`,
                    }}
                  >
                    {/* Edit Button */}
                    <div 
                      className="absolute top-3 right-3 z-20 opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 md:h-8 md:w-8 rounded-lg bg-white/90 hover:bg-white shadow-sm hover:shadow-md transition-all active:bg-white/80"
                            title="Class options"
                          >
                            <MoreVertical className="h-5 md:h-4 w-5 md:w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-lg">
                          <DropdownMenuItem
                            onClick={() => handleEditClass(cls)}
                            className="rounded-md cursor-pointer"
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit Class
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleArchive(cls)}
                            className="rounded-md cursor-pointer"
                          >
                            <Archive className="h-4 w-4 mr-2" />
                            Archive
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(cls)}
                            className="rounded-md cursor-pointer text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Class
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Clickable Card Area */}
                    <div 
                      className="cursor-pointer"
                      onClick={() => onSelectClass(cls.id)}
                    >
                      {/* Class Header Image */}
                      <div
                        className={`h-32 relative overflow-hidden group-hover:opacity-90 transition-opacity ${
                          !cls.coverImage ? `bg-gradient-to-br ${getClassColorGradient(cls.color)}` : ''
                        }`}
                        style={
                          cls.coverImage
                            ? {
                                backgroundImage: `url(${cls.coverImage})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                              }
                            : undefined
                        }
                      >
                        {cls.coverImage ? <div className="absolute inset-0 bg-black/45" /> : null}
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
                          <p className="text-sm text-muted-foreground">{formatSectionLine(cls)}</p>
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
                      </CardContent>
                    </div>
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
                    className="border-0 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group"
                    style={{
                      animation: `fade-in 0.5s ease-out ${idx * 40}ms both`,
                    }}
                  >
                    <CardContent className="p-4 md:p-5">
                      <div className="flex items-center gap-4">
                        {/* Color Badge */}
                        <div
                          className={`h-12 w-12 rounded-lg flex-shrink-0 cursor-pointer ${
                            !cls.coverImage ? `bg-gradient-to-br ${getClassColorGradient(cls.color)}` : ''
                          }`}
                          style={
                            cls.coverImage
                              ? {
                                  backgroundImage: `url(${cls.coverImage})`,
                                  backgroundSize: 'cover',
                                  backgroundPosition: 'center',
                                }
                              : undefined
                          }
                          onClick={() => onSelectClass(cls.id)}
                        />

                        {/* Class Info */}
                        <div 
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => onSelectClass(cls.id)}
                        >
                          <h3 className="font-semibold group-hover:text-primary transition-colors line-clamp-1">
                            {cls.name}
                          </h3>
                          <p className="text-sm text-muted-foreground">{formatSectionLine(cls)}</p>
                          <div className="text-xs text-muted-foreground mt-1">
                            {cls.room} • {formatSchedule(cls.schedule)}
                          </div>
                        </div>

                        {/* Edit Button */}
                        <div onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 md:h-8 md:w-8 rounded-lg hover:bg-secondary/50 transition-all active:bg-secondary/70"
                                title="Class options"
                              >
                                <MoreVertical className="h-5 md:h-4 w-5 md:w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-lg">
                              <DropdownMenuItem
                                onClick={() => handleEditClass(cls)}
                                className="rounded-md cursor-pointer"
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit Class
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleArchive(cls)}
                                className="rounded-md cursor-pointer"
                              >
                                <Archive className="h-4 w-4 mr-2" />
                                Archive
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(cls)}
                                className="rounded-md cursor-pointer text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Class
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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

        {/* Archived Classes Section */}
        {filteredArchivedClasses.length > 0 && (
          <div className="mt-12 pt-8 border-t border-border">
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Archived Classes</h2>
              <p className="text-muted-foreground">
                {filteredArchivedClasses.length} archived {filteredArchivedClasses.length === 1 ? 'class' : 'classes'}
              </p>

              {/* Grid View - Archived */}
              {viewMode === 'grid' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-stagger">
                  {filteredArchivedClasses.map((cls, idx) => (
                    <Card
                      key={cls.id}
                      className="border-0 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group relative opacity-60"
                      style={{
                        animation: `fade-in 0.5s ease-out ${idx * 50}ms both`,
                      }}
                    >
                      {/* Restore Button */}
                      <div className="absolute top-3 right-3 z-20 flex gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          className="rounded-lg"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestore(cls);
                          }}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Restore
                        </Button>
                      </div>

                      {/* Class Header Image */}
                      <div
                        className={`h-32 relative overflow-hidden group-hover:opacity-90 transition-opacity ${
                          !cls.coverImage ? `bg-gradient-to-br ${getClassColorGradient(cls.color)}` : ''
                        }`}
                        style={
                          cls.coverImage
                            ? {
                                backgroundImage: `url(${cls.coverImage})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                              }
                            : undefined
                        }
                      >
                        {cls.coverImage ? <div className="absolute inset-0 bg-black/45" /> : null}
                        {/* Decorative elements */}
                        <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-white/10" />
                        <div className="absolute -left-8 -bottom-8 w-32 h-32 rounded-full bg-white/5" />
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
                        <div className="absolute inset-0 bg-black/40" />
                      </div>

                      {/* Content */}
                      <CardContent className="p-5 space-y-4">
                        {/* Class Information */}
                        <div className="space-y-1">
                          <h3 className="text-lg font-semibold line-clamp-2">
                            {cls.name}
                          </h3>
                          <p className="text-sm text-muted-foreground">{formatSectionLine(cls)}</p>
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
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* List View - Archived */}
              {viewMode === 'list' && (
                <div className="space-y-3 animate-stagger">
                  {filteredArchivedClasses.map((cls, idx) => (
                    <Card
                      key={cls.id}
                      className="border-0 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group opacity-60"
                      style={{
                        animation: `fade-in 0.5s ease-out ${idx * 40}ms both`,
                      }}
                    >
                      <CardContent className="p-4 md:p-5">
                        <div className="flex items-center gap-4">
                          {/* Color Badge */}
                          <div
                              className={`h-12 w-12 rounded-lg flex-shrink-0 ${
                                !cls.coverImage ? `bg-gradient-to-br ${getClassColorGradient(cls.color)}` : ''
                              }`}
                              style={
                                cls.coverImage
                                  ? {
                                      backgroundImage: `url(${cls.coverImage})`,
                                      backgroundSize: 'cover',
                                      backgroundPosition: 'center',
                                    }
                                  : undefined
                              }
                          />

                          {/* Class Info */}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold line-clamp-1">
                              {cls.name}
                            </h3>
                            <p className="text-sm text-muted-foreground">{formatSectionLine(cls)}</p>
                            <div className="text-xs text-muted-foreground mt-1">
                              {cls.room} • {formatSchedule(cls.schedule)}
                            </div>
                          </div>

                          {/* Restore Button */}
                          <Button
                            size="sm"
                            variant="default"
                            className="rounded-lg"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRestore(cls);
                            }}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Restore
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Edit Class Dialog */}
      {selectedClass && (
        <EditClassDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          classItem={selectedClass}
          onSave={handleEditSave}
        />
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'archive' && 'Archive Class?'}
              {confirmAction === 'delete' && 'Delete Class Permanently?'}
              {confirmAction === 'restore' && 'Restore Class?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'archive' &&
                `Are you sure you want to archive "${actionClass?.name}"? You can restore it later.`}
              {confirmAction === 'delete' &&
                `Are you sure you want to permanently delete "${actionClass?.name}"? This action cannot be undone.`}
              {confirmAction === 'restore' &&
                `Are you sure you want to restore "${actionClass?.name}"? It will appear in your active classes.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (confirmAction === 'archive') confirmArchive();
              else if (confirmAction === 'delete') confirmDelete();
              else if (confirmAction === 'restore') confirmRestore();
            }}
            className={`rounded-lg ${(confirmAction === 'delete') ? 'bg-destructive hover:bg-destructive/90' : ''}`}
          >
            {confirmAction === 'archive' && 'Archive'}
            {confirmAction === 'delete' && 'Delete'}
            {confirmAction === 'restore' && 'Restore'}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
