import { useState } from 'react';
import {
  Plus,
  FileText,
  Book,
  ClipboardList,
  Eye,
  Download,
  Trash2,
  MoreVertical,
  Search,
  Folder,
  Upload,
  ListPlus,
  ArrowUpDown,
} from 'lucide-react';
import { getTaskTypeMeta } from '@/lib/task-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAssignments } from '@/hooks-api/useAssignments';
import { useMaterials } from '@/hooks-api/useMaterials';
import { materialsService } from '@/services/materials.service';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CreateAssignmentDialog } from '@/components/CreateAssignmentDialog';
import { MaterialPreviewDialog } from '@/components/MaterialPreviewDialog';
import type { LearningMaterial } from '@/lib/data';


const FILE_TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  doc: FileText,
  image: FileText,
  video: FileText,
  presentation: Book,
  spreadsheet: FileText,
  archive: FileText,
};

interface TeacherClassworkProps {
  classId: string;
}

export function TeacherClasswork({ classId }: TeacherClassworkProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('assignments');
  const [assignmentSort, setAssignmentSort] = useState<'due-soon' | 'due-latest' | 'title' | 'points'>('due-soon');
  const [materialSort, setMaterialSort] = useState<'title' | 'newest' | 'downloads'>('newest');
  const [deletingMaterialIds, setDeletingMaterialIds] = useState<string[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<LearningMaterial | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: classAssignments = [], isLoading: assignmentsLoading } = useAssignments(classId);
  const {
    data: classMaterials = [],
    isLoading: materialsLoading,
    refetch: refetchMaterials,
  } = useMaterials(classId);

  const handleOpenMaterial = (material: LearningMaterial) => {
    if (!material.url) {
      toast({
        title: 'Material link unavailable',
        description: 'This material does not have a valid file URL yet.',
        variant: 'destructive',
      });
      return;
    }

    setSelectedMaterial(material);
  };

  const handleDownloadMaterial = (material: LearningMaterial) => {
    if (!material.url) {
      toast({
        title: 'Material link unavailable',
        description: 'This material does not have a valid file URL yet.',
        variant: 'destructive',
      });
      return;
    }

    window.open(material.url, '_blank', 'noopener,noreferrer');
  };

  const handleDeleteMaterial = (materialId: string) => {
    if (deletingMaterialIds.includes(materialId)) {
      return;
    }

    void (async () => {
      setDeletingMaterialIds((previous) => [...previous, materialId]);

      try {
        await materialsService.delete(materialId);
        await refetchMaterials();
        await queryClient.invalidateQueries({ queryKey: ['materials', classId] });

        toast({
          title: 'Material deleted',
          description: 'The selected material was removed successfully.',
        });
      } catch (error: any) {
        const message =
          error?.response?.data?.error?.message
          || error?.response?.data?.message
          || error?.message
          || 'Failed to delete material';

        toast({
          title: 'Delete failed',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setDeletingMaterialIds((previous) =>
          previous.filter((id) => id !== materialId)
        );
      }
    })();
  };

  if (assignmentsLoading || materialsLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-8 text-center text-muted-foreground">
            Loading classwork...
          </CardContent>
        </Card>
      </div>
    );
  }

  // Extract unique topics from materials
  const topics = Array.from(
    new Set(
      classMaterials.map((m) => {
        const titleParts = m.title.split(':');
        return titleParts[0].trim();
      })
    )
  );

  const filteredAssignments = classAssignments
    .filter((a) => a.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (assignmentSort === 'title') {
        return a.title.localeCompare(b.title);
      }

      if (assignmentSort === 'points') {
        return b.points - a.points || a.title.localeCompare(b.title);
      }

      const aTime = new Date(a.dueDate || '').getTime();
      const bTime = new Date(b.dueDate || '').getTime();
      const safeATime = Number.isFinite(aTime) ? aTime : Number.MAX_SAFE_INTEGER;
      const safeBTime = Number.isFinite(bTime) ? bTime : Number.MAX_SAFE_INTEGER;

      if (assignmentSort === 'due-latest') {
        return safeBTime - safeATime;
      }

      return safeATime - safeBTime;
    });

  const filteredMaterials = (selectedTopic === 'all'
    ? classMaterials.filter((m) => m.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : classMaterials.filter(
        (m) =>
          m.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
          m.title.startsWith(selectedTopic)
      )
  ).sort((a, b) => {
    if (materialSort === 'title') {
      return a.title.localeCompare(b.title);
    }

    if (materialSort === 'downloads') {
      return b.downloads - a.downloads || a.title.localeCompare(b.title);
    }

    return new Date(b.uploadedDate || '').getTime() - new Date(a.uploadedDate || '').getTime();
  });


  const getAssignmentStatusColor = (status: string) => {
    switch (status) {
      case 'submitted':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'graded':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'late':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getFileTypeColor = (fileType: string) => {
    switch (fileType) {
      case 'pdf':
        return 'bg-red-50 text-red-700';
      case 'video':
        return 'bg-purple-50 text-purple-700';
      case 'presentation':
        return 'bg-orange-50 text-orange-700';
      case 'spreadsheet':
        return 'bg-green-50 text-green-700';
      default:
        return 'bg-blue-50 text-blue-700';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between gap-4">
          <TabsList className="rounded-lg">
            <TabsTrigger value="assignments" className="rounded-md">
              Assignments
            </TabsTrigger>
            <TabsTrigger value="materials" className="rounded-md">
              Materials
            </TabsTrigger>
          </TabsList>

          <Button
            onClick={() => setShowCreateDialog(true)}
            className="rounded-lg gap-2"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Create</span>
          </Button>
        </div>

        {/* Assignments Tab */}
        <TabsContent value="assignments" className="space-y-4 mt-6">
          {/* Search + Sort */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search assignments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 rounded-lg"
              />
            </div>

            <Select value={assignmentSort} onValueChange={(value) => setAssignmentSort(value as typeof assignmentSort)}>
              <SelectTrigger className="w-full sm:w-52 rounded-lg">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="due-soon">Due Date (Soonest)</SelectItem>
                <SelectItem value="due-latest">Due Date (Latest)</SelectItem>
                <SelectItem value="title">Title (A to Z)</SelectItem>
                <SelectItem value="points">Points (Highest)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{classAssignments.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">
                  {classAssignments.filter((a) => a.status === 'submitted').length}
                </p>
                <p className="text-xs text-muted-foreground">Submitted</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">
                  {classAssignments.filter((a) => a.status === 'graded').length}
                </p>
                <p className="text-xs text-muted-foreground">Graded</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">
                  {classAssignments.filter((a) => a.status === 'late').length}
                </p>
                <p className="text-xs text-muted-foreground">Late</p>
              </CardContent>
            </Card>
          </div>

          {/* Assignments List */}
          {filteredAssignments.length > 0 ? (
            <div className="space-y-3 animate-stagger">
              {filteredAssignments.map((assignment, idx) => {
                const meta = getTaskTypeMeta(assignment.rawType || assignment.type);
                const IconComponent = meta.icon;
                return (
                  <Card
                    key={assignment.id}
                    className="border-0 shadow-sm hover:shadow-md transition-all"
                    style={{
                      animation: `fade-in 0.4s ease-out ${idx * 40}ms both`,
                    }}
                  >
                    <CardContent className="p-4 md:p-5">
                      <div className="flex items-start justify-between gap-4">
                        {/* Icon and Details */}
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`p-2 rounded-lg flex-shrink-0 mt-1 ${meta.iconBg}`}>
                            <IconComponent className={`h-4 w-4 ${meta.iconText}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-semibold text-sm md:text-base line-clamp-1">
                              {assignment.title}
                            </h4>
                            <p className="text-xs md:text-sm text-muted-foreground line-clamp-2 mt-1">
                              {assignment.description}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              <Badge variant="outline" className={`rounded-full text-xs border ${meta.badgeClass}`}>
                                {meta.label}
                              </Badge>
                              <Badge variant="outline" className="rounded-full text-xs">
                                {assignment.points} pts
                              </Badge>
                              <Badge
                                variant="outline"
                                className={`rounded-full text-xs ${getAssignmentStatusColor(
                                  assignment.status
                                )}`}
                              >
                                {assignment.status}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Due Date and Actions */}
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {assignment.dueDate}
                          </span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-lg">
                              <DropdownMenuItem className="cursor-pointer">
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer">
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="cursor-pointer text-destructive">
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-8 text-center">
                <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground mb-3 opacity-50" />
                <p className="text-muted-foreground">
                  No assignments found. Create one to get started!
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Materials Tab */}
        <TabsContent value="materials" className="space-y-4 mt-6">
          {/* Search and Topic Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search materials..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 rounded-lg"
              />
            </div>

            <Select value={materialSort} onValueChange={(value) => setMaterialSort(value as typeof materialSort)}>
              <SelectTrigger className="w-full sm:w-48 rounded-lg">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest Upload</SelectItem>
                <SelectItem value="title">Title (A to Z)</SelectItem>
                <SelectItem value="downloads">Most Downloaded</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selectedTopic} onValueChange={setSelectedTopic}>
              <SelectTrigger className="w-full sm:w-40 rounded-lg">
                <Folder className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Topics</SelectItem>
                {topics.map((topic) => (
                  <SelectItem key={topic} value={topic}>
                    {topic}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Materials List */}
          {filteredMaterials.length > 0 ? (
            <div className="space-y-3 animate-stagger">
              {filteredMaterials.map((material, idx) => (
                <Card
                  key={material.id}
                  className="border-0 shadow-sm hover:shadow-md transition-all"
                  style={{
                    animation: `fade-in 0.4s ease-out ${idx * 40}ms both`,
                  }}
                >
                  <CardContent className="p-4 md:p-5">
                    <div className="flex items-start justify-between gap-4">
                      {/* Material Info */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div
                          className={`p-2 rounded-lg flex-shrink-0 mt-1 ${getFileTypeColor(
                            material.fileType
                          )}`}
                        >
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-semibold text-sm md:text-base line-clamp-1">
                            {material.title}
                          </h4>
                          <p className="text-xs md:text-sm text-muted-foreground line-clamp-2 mt-1">
                            {material.description}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge
                              variant="outline"
                              className="rounded-full text-xs"
                            >
                              {material.fileType.toUpperCase()}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="rounded-full text-xs"
                            >
                              {material.fileSize}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="rounded-full text-xs"
                            >
                              {material.downloads} downloads
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {material.uploadedDate}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-lg">
                            <DropdownMenuItem
                              className="cursor-pointer gap-2"
                              disabled={!material.url}
                              onClick={() => handleOpenMaterial(material)}
                            >
                              <Eye className="h-4 w-4" />
                              Open
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer gap-2"
                              disabled={!material.url}
                              onClick={() => handleDownloadMaterial(material)}
                            >
                              <Download className="h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer">
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="cursor-pointer text-destructive gap-2"
                              disabled={deletingMaterialIds.includes(material.id)}
                              onClick={() => handleDeleteMaterial(material.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                              {deletingMaterialIds.includes(material.id) ? 'Deleting...' : 'Delete'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-8 text-center">
                <Book className="h-8 w-8 mx-auto text-muted-foreground mb-3 opacity-50" />
                <p className="text-muted-foreground">
                  No materials found. Upload your first material to get started!
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <CreateAssignmentDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        classId={classId}
      />

      <MaterialPreviewDialog
        open={Boolean(selectedMaterial)}
        material={selectedMaterial}
        isTeacher
        courseId={classId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMaterial(null);
          }
        }}
        onDownload={handleDownloadMaterial}
      />
    </div>
  );
}
