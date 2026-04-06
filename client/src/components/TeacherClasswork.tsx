import { useState } from 'react';
import {
  Plus,
  FileText,
  Book,
  ClipboardList,
  Download,
  Trash2,
  MoreVertical,
  Zap,
  Calendar,
  MessageSquare,
  Search,
  Folder,
  Upload,
  ListPlus,
} from 'lucide-react';
import { mockAssignments, mockMaterials } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const TYPE_ICONS: Record<string, typeof FileText> = {
  assignment: FileText,
  quiz: Zap,
  project: Calendar,
  discussion: MessageSquare,
};

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
  const [createType, setCreateType] = useState<'assignment' | 'material' | 'topic'>('assignment');
  const [activeTab, setActiveTab] = useState('assignments');

  const classAssignments = mockAssignments.filter((a) => a.classId === classId);
  const classMaterials = mockMaterials.filter((m) => m.classId === classId);

  // Extract unique topics from materials
  const topics = Array.from(
    new Set(
      classMaterials.map((m) => {
        const titleParts = m.title.split(':');
        return titleParts[0].trim();
      })
    )
  );

  const filteredAssignments = classAssignments.filter((a) =>
    a.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredMaterials =
    selectedTopic === 'all'
      ? classMaterials.filter((m) =>
          m.title.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : classMaterials.filter(
          (m) =>
            m.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
            m.title.startsWith(selectedTopic)
        );

  const getAssignmentIcon = (type: string) => {
    const IconComponent = TYPE_ICONS[type] || FileText;
    return IconComponent;
  };

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
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search assignments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-lg"
            />
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
                const IconComponent = getAssignmentIcon(assignment.type);
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
                          <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0 mt-1">
                            <IconComponent className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-semibold text-sm md:text-base line-clamp-1">
                              {assignment.title}
                            </h4>
                            <p className="text-xs md:text-sm text-muted-foreground line-clamp-2 mt-1">
                              {assignment.description}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
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
                            <DropdownMenuItem className="cursor-pointer gap-2">
                              <Download className="h-4 w-4" />
                              Download
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer">
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer text-destructive gap-2">
                              <Trash2 className="h-4 w-4" />
                              Delete
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
      <CreateItemDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        type={createType}
        onTypeChange={setCreateType}
      />
    </div>
  );
}

interface CreateItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'assignment' | 'material' | 'topic';
  onTypeChange: (type: 'assignment' | 'material' | 'topic') => void;
}

function CreateItemDialog({
  open,
  onOpenChange,
  type,
  onTypeChange,
}: CreateItemDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [points, setPoints] = useState('100');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Item</DialogTitle>
          <DialogDescription>
            Add a new assignment, material, or topic to your class.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type Selection */}
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant={type === 'assignment' ? 'default' : 'outline'}
              className="rounded-lg"
              onClick={() => onTypeChange('assignment')}
            >
              <FileText className="h-4 w-4 mr-2" />
              Assignment
            </Button>
            <Button
              variant={type === 'material' ? 'default' : 'outline'}
              className="rounded-lg"
              onClick={() => onTypeChange('material')}
            >
              <Upload className="h-4 w-4 mr-2" />
              Material
            </Button>
            <Button
              variant={type === 'topic' ? 'default' : 'outline'}
              className="rounded-lg"
              onClick={() => onTypeChange('topic')}
            >
              <Folder className="h-4 w-4 mr-2" />
              Topic
            </Button>
          </div>

          {/* Form */}
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium">Title *</label>
              <Input
                placeholder="Enter title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 rounded-lg"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Enter description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 rounded-lg resize-none min-h-20"
              />
            </div>

            {type === 'assignment' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Due Date</label>
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="mt-1 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Points</label>
                    <Input
                      type="number"
                      value={points}
                      onChange={(e) => setPoints(e.target.value)}
                      className="mt-1 rounded-lg"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-lg"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button className="rounded-lg" onClick={() => onOpenChange(false)}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
