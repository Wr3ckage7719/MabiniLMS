export interface ClassItem {
  id: string;
  name: string;
  section: string;
  teacher: string;
  color: 'blue' | 'teal' | 'purple' | 'orange' | 'pink' | 'green';
  students: number;
  pendingAssignments: number;
  room: string;
  schedule: string;
  coverImage?: string;
  archived?: boolean;
}

export interface Assignment {
  id: string;
  classId: string;
  title: string;
  description: string;
  dueDate: string;
  points: number;
  status: 'assigned' | 'submitted' | 'graded' | 'late';
  type: 'assignment' | 'quiz' | 'project' | 'discussion';
  attachments?: number;
}

export interface Announcement {
  id: string;
  classId: string;
  author: string;
  avatar: string;
  content: string;
  timestamp: string;
  comments: number;
}

export interface StudentSubmission {
  id: string;
  classId: string;
  assignmentId: string;
  studentName: string;
  studentAvatar: string;
  assignmentTitle: string;
  submittedDate: string;
  grade?: string;
  status: 'submitted' | 'reviewed' | 'graded';
}

export interface StudentComment {
  id: string;
  classId: string;
  postId: string;
  studentName: string;
  studentAvatar: string;
  content: string;
  timestamp: string;
  postTitle?: string;
}

export interface StudentPost {
  id: string;
  classId: string;
  studentName: string;
  studentAvatar: string;
  content: string;
  timestamp: string;
  likes: number;
  comments: number;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  avatar: string;
  grade?: string;
}

export interface LearningMaterial {
  id: string;
  classId: string;
  title: string;
  description: string;
  fileType: 'pdf' | 'doc' | 'image' | 'video' | 'presentation' | 'spreadsheet' | 'archive';
  fileSize: string;
  uploadedBy: string;
  uploadedDate: string;
  downloads: number;
  url?: string;
}

export const CLASS_COLORS: Record<string, string> = {
  blue: 'bg-class-blue',
  teal: 'bg-class-teal',
  purple: 'bg-class-purple',
  orange: 'bg-class-orange',
  pink: 'bg-class-pink',
  green: 'bg-class-green',
};

export const CLASS_COLORS_TEXT: Record<string, string> = {
  blue: 'text-class-blue',
  teal: 'text-class-teal',
  purple: 'text-class-purple',
  orange: 'text-class-orange',
  pink: 'text-class-pink',
  green: 'text-class-green',
};

export const mockClasses: ClassItem[] = [
  { id: '1', name: 'Advanced Mathematics', section: 'Section A - Period 1', teacher: 'Dr. Sarah Chen', color: 'blue', students: 32, pendingAssignments: 3, room: 'Room 204', schedule: 'MWF 9:00 AM - 10:30 AM' },
  { id: '2', name: 'Computer Science 101', section: 'Section B - Period 2', teacher: 'Prof. James Wilson', color: 'teal', students: 28, pendingAssignments: 1, room: 'Lab 315', schedule: 'TTh 10:00 AM - 11:30 AM' },
  { id: '3', name: 'English Literature', section: 'Section A - Period 3', teacher: 'Ms. Emily Parker', color: 'purple', students: 25, pendingAssignments: 2, room: 'Room 102', schedule: 'MWF 11:00 AM - 12:30 PM' },
  { id: '4', name: 'Physics Lab', section: 'Section C - Period 4', teacher: 'Dr. Michael Torres', color: 'orange', students: 30, pendingAssignments: 0, room: 'Lab 220', schedule: 'TTh 1:00 PM - 3:30 PM' },
  { id: '5', name: 'Art & Design', section: 'Section A - Period 5', teacher: 'Ms. Lisa Kim', color: 'pink', students: 22, pendingAssignments: 4, room: 'Studio 401', schedule: 'MWF 2:00 PM - 4:00 PM' },
  { id: '6', name: 'Biology', section: 'Section B - Period 6', teacher: 'Dr. Robert Singh', color: 'green', students: 35, pendingAssignments: 1, room: 'Room 305', schedule: 'TTh 2:00 PM - 3:30 PM' },
];

export const mockAssignments: Assignment[] = [
  { id: '1', classId: '1', title: 'Calculus Problem Set #5', description: 'Complete problems 1-20 from Chapter 7. Show all work.', dueDate: '2026-04-05', points: 100, status: 'assigned', type: 'assignment', attachments: 2 },
  { id: '2', classId: '1', title: 'Midterm Exam Review', description: 'Review quiz covering chapters 1-7.', dueDate: '2026-04-08', points: 50, status: 'assigned', type: 'quiz' },
  { id: '3', classId: '2', title: 'Build a React App', description: 'Create a simple todo app using React and TypeScript.', dueDate: '2026-04-10', points: 200, status: 'assigned', type: 'project', attachments: 1 },
  { id: '4', classId: '3', title: 'Essay: Shakespeare Analysis', description: 'Write a 1500-word analysis of themes in Hamlet.', dueDate: '2026-04-03', points: 150, status: 'late', type: 'assignment' },
  { id: '5', classId: '5', title: 'Digital Illustration Portfolio', description: 'Submit 5 original digital illustrations.', dueDate: '2026-04-12', points: 300, status: 'assigned', type: 'project', attachments: 3 },
  { id: '6', classId: '1', title: 'Linear Algebra Quiz', description: 'Online quiz on matrix operations.', dueDate: '2026-04-02', points: 30, status: 'submitted', type: 'quiz' },
  { id: '7', classId: '6', title: 'Lab Report: Cell Division', description: 'Document observations from the mitosis lab.', dueDate: '2026-04-07', points: 100, status: 'assigned', type: 'assignment', attachments: 1 },
];

export const mockAnnouncements: Announcement[] = [
  { id: '1', classId: '1', author: 'Dr. Sarah Chen', avatar: 'SC', content: 'Class will be held in Room 204 tomorrow due to maintenance. Please bring your graphing calculators.', timestamp: '2 hours ago', comments: 5 },
  { id: '2', classId: '2', author: 'Prof. James Wilson', avatar: 'JW', content: 'Great work on the last project everyone! I\'ve posted the grades. Office hours this Thursday are extended to 5pm.', timestamp: '5 hours ago', comments: 12 },
  { id: '3', classId: '1', author: 'Dr. Sarah Chen', avatar: 'SC', content: 'Reminder: The midterm review session is this Friday at 3pm in the lecture hall.', timestamp: '1 day ago', comments: 8 },
];

export const mockStudentSubmissions: StudentSubmission[] = [
  // Class 1 - Advanced Mathematics submissions
  { id: 'sub1', classId: '1', assignmentId: '1', studentName: 'Emma Wilson', studentAvatar: 'EW', assignmentTitle: 'Calculus Problem Set #5', submittedDate: 'just now', status: 'submitted' },
  { id: 'sub2', classId: '1', assignmentId: '1', studentName: 'Kaide Olfindo', studentAvatar: 'KO', assignmentTitle: 'Calculus Problem Set #5', submittedDate: '2 hours ago', grade: '92', status: 'graded' },
  { id: 'sub3', classId: '1', assignmentId: '1', studentName: 'Carol Davis', studentAvatar: 'CD', assignmentTitle: 'Calculus Problem Set #5', submittedDate: '1 day ago', grade: '88', status: 'graded' },
  { id: 'sub4', classId: '1', assignmentId: '6', studentName: 'David Lee', studentAvatar: 'DL', assignmentTitle: 'Linear Algebra Quiz', submittedDate: '2 days ago', grade: '87', status: 'graded' },
  { id: 'sub5', classId: '1', assignmentId: '6', studentName: 'Frank Brown', studentAvatar: 'FB', assignmentTitle: 'Linear Algebra Quiz', submittedDate: '3 days ago', grade: '76', status: 'graded' },
  { id: 'sub6', classId: '1', assignmentId: '6', studentName: 'Grace Taylor', studentAvatar: 'GT', assignmentTitle: 'Linear Algebra Quiz', submittedDate: '3 days ago', grade: '94', status: 'graded' },

  // Class 2 - Computer Science submissions
  { id: 'sub7', classId: '2', assignmentId: '3', studentName: 'Bob Smith', studentAvatar: 'BS', assignmentTitle: 'Build a React App', submittedDate: '3 hours ago', grade: '95', status: 'graded' },
  { id: 'sub8', classId: '2', assignmentId: '3', studentName: 'Henry Martinez', studentAvatar: 'HM', assignmentTitle: 'Build a React App', submittedDate: '1 day ago', grade: '89', status: 'graded' },
  { id: 'sub9', classId: '2', assignmentId: '3', studentName: 'Carol Davis', studentAvatar: 'CD', assignmentTitle: 'Build a React App', submittedDate: '2 hours ago', status: 'submitted' },

  // Class 3 - English Literature submissions
  { id: 'sub10', classId: '3', assignmentId: '4', studentName: 'Emma Wilson', studentAvatar: 'EW', assignmentTitle: 'Essay: Shakespeare Analysis', submittedDate: '5 hours ago', grade: '91', status: 'graded' },
  { id: 'sub11', classId: '3', assignmentId: '4', studentName: 'Kaide Olfindo', studentAvatar: 'KO', assignmentTitle: 'Essay: Shakespeare Analysis', submittedDate: '1 day ago', grade: '85', status: 'graded' },

  // Class 5 - Art & Design submissions
  { id: 'sub12', classId: '5', assignmentId: '5', studentName: 'Grace Taylor', studentAvatar: 'GT', assignmentTitle: 'Digital Illustration Portfolio', submittedDate: '4 hours ago', status: 'submitted' },
  { id: 'sub13', classId: '5', assignmentId: '5', studentName: 'David Lee', studentAvatar: 'DL', assignmentTitle: 'Digital Illustration Portfolio', submittedDate: '2 days ago', grade: '93', status: 'graded' },

  // Class 6 - Biology submissions
  { id: 'sub14', classId: '6', assignmentId: '7', studentName: 'Frank Brown', studentAvatar: 'FB', assignmentTitle: 'Lab Report: Cell Division', submittedDate: '6 hours ago', status: 'submitted' },
  { id: 'sub15', classId: '6', assignmentId: '7', studentName: 'Henry Martinez', studentAvatar: 'HM', assignmentTitle: 'Lab Report: Cell Division', submittedDate: '1 day ago', grade: '88', status: 'graded' },
];

export const mockStudentComments: StudentComment[] = [
  { id: 'cmt1', classId: '1', postId: 'post1', studentName: 'Kaide Olfindo', studentAvatar: 'KO', content: 'I found a helpful resource that explains derivatives better!', timestamp: '30 minutes ago', postTitle: 'Calculus Tips' },
  { id: 'cmt2', classId: '2', postId: 'post2', studentName: 'Grace Taylor', studentAvatar: 'GT', content: 'Does anyone want to form a study group for the midterm?', timestamp: '1 hour ago', postTitle: 'Study Group' },
  { id: 'cmt3', classId: '3', postId: 'post3', studentName: 'Carol Davis', studentAvatar: 'CD', content: 'Great analysis! I liked how you connected the themes.', timestamp: '2 hours ago', postTitle: 'Hamlet Discussion' },
];

export const mockStudentPosts: StudentPost[] = [
  { id: 'post1', classId: '1', studentName: 'Frank Brown', studentAvatar: 'FB', content: 'Anyone else struggling with Chapter 7? Let me know your questions!', timestamp: '2 hours ago', likes: 5, comments: 3 },
  { id: 'post2', classId: '2', studentName: 'Henry Martinez', studentAvatar: 'HM', content: 'Just finished the React project! Really enjoyed building with TypeScript.', timestamp: '4 hours ago', likes: 12, comments: 2 },
  { id: 'post3', classId: '3', studentName: 'Emma Wilson', studentAvatar: 'EW', content: 'My essay is finally complete! Shakespeare is incredible.', timestamp: '5 hours ago', likes: 8, comments: 4 },
];

export const mockStudents: Student[] = [
  { id: '1', name: 'Kaide Olfindo', email: 'KaideOlfindo@school.edu', avatar: 'KO', grade: 'A' },
  { id: '2', name: 'Bob Smith', email: 'BobSmith@school.edu', avatar: 'BS', grade: 'B+' },
  { id: '3', name: 'Carol Davis', email: 'CarolDavis@school.edu', avatar: 'CD', grade: 'A-' },
  { id: '4', name: 'David Lee', email: 'DavidLee@school.edu', avatar: 'DL', grade: 'B' },
  { id: '5', name: 'Emma Wilson', email: 'EmmaWilson@school.edu', avatar: 'EW', grade: 'A+' },
  { id: '6', name: 'Frank Brown', email: 'FrankBrown@school.edu', avatar: 'FB', grade: 'C+' },
  { id: '7', name: 'Grace Taylor', email: 'GraceTaylor@school.edu', avatar: 'GT', grade: 'A' },
  { id: '8', name: 'Henry Martinez', email: 'HenryMartinez@school.edu', avatar: 'HM', grade: 'B-' },
];

export const mockMaterials: LearningMaterial[] = [
  // Advanced Mathematics
  { id: 'm1', classId: '1', title: 'Chapter 7: Calculus Fundamentals', description: 'Comprehensive lecture notes covering derivatives, limits, and continuity.', fileType: 'pdf', fileSize: '3.2 MB', uploadedBy: 'Dr. Sarah Chen', uploadedDate: '2026-03-28', downloads: 45 },
  { id: 'm2', classId: '1', title: 'Calculus Video Lectures', description: 'Video series explaining key calculus concepts with real-world examples.', fileType: 'video', fileSize: '450 MB', uploadedBy: 'Dr. Sarah Chen', uploadedDate: '2026-03-25', downloads: 78 },
  { id: 'm3', classId: '1', title: 'Practice Problem Solutions', description: 'Step-by-step solutions to chapters 1-6 practice problems.', fileType: 'pdf', fileSize: '2.8 MB', uploadedBy: 'Dr. Sarah Chen', uploadedDate: '2026-03-20', downloads: 62 },

  // Computer Science 101
  { id: 'm4', classId: '2', title: 'React Advanced Patterns', description: 'Slides covering hooks, context API, and performance optimization.', fileType: 'presentation', fileSize: '5.4 MB', uploadedBy: 'Prof. James Wilson', uploadedDate: '2026-03-26', downloads: 34 },
  { id: 'm5', classId: '2', title: 'TypeScript Style Guide', description: 'Best practices and coding standards for the course.', fileType: 'doc', fileSize: '1.1 MB', uploadedBy: 'Prof. James Wilson', uploadedDate: '2026-03-22', downloads: 55 },
  { id: 'm6', classId: '2', title: 'Project Starter Template', description: 'Boilerplate code and configuration for semester projects.', fileType: 'archive', fileSize: '12.3 MB', uploadedBy: 'Prof. James Wilson', uploadedDate: '2026-03-15', downloads: 128 },

  // English Literature
  { id: 'm7', classId: '3', title: 'Shakespeare Context Guide', description: 'Historical background and literary analysis framework for Shakespeare plays.', fileType: 'pdf', fileSize: '4.6 MB', uploadedBy: 'Ms. Emily Parker', uploadedDate: '2026-03-24', downloads: 41 },
  { id: 'm8', classId: '3', title: 'Essay Writing Rubric', description: 'Detailed criteria for evaluating analytical essays.', fileType: 'doc', fileSize: '0.8 MB', uploadedBy: 'Ms. Emily Parker', uploadedDate: '2026-03-18', downloads: 67 },

  // Physics Lab
  { id: 'm9', classId: '4', title: 'Lab Safety Manual', description: 'Essential safety procedures and equipment usage guidelines.', fileType: 'pdf', fileSize: '2.5 MB', uploadedBy: 'Dr. Michael Torres', uploadedDate: '2026-03-27', downloads: 89 },
  { id: 'm10', classId: '4', title: 'Physics Equations Reference', description: 'Comprehensive formula sheet with explanations and applications.', fileType: 'doc', fileSize: '1.3 MB', uploadedBy: 'Dr. Michael Torres', uploadedDate: '2026-03-20', downloads: 156 },

  // Art & Design
  { id: 'm11', classId: '5', title: 'Design Principles Presentation', description: 'Slides on color theory, composition, and visual hierarchy.', fileType: 'presentation', fileSize: '8.7 MB', uploadedBy: 'Ms. Lisa Kim', uploadedDate: '2026-03-26', downloads: 29 },
  { id: 'm12', classId: '5', title: 'Digital Art Inspiration Gallery', description: 'Curated collection of reference images and professional work.', fileType: 'image', fileSize: '95.2 MB', uploadedBy: 'Ms. Lisa Kim', uploadedDate: '2026-03-21', downloads: 72 },
  { id: 'm13', classId: '5', title: 'Illustrator Quick Start', description: 'Tutorial guide for Adobe Illustrator basics and advanced tools.', fileType: 'pdf', fileSize: '6.1 MB', uploadedBy: 'Ms. Lisa Kim', uploadedDate: '2026-03-19', downloads: 103 },

  // Biology
  { id: 'm14', classId: '6', title: 'Cell Biology Lecture Notes', description: 'Detailed notes on cell structure, function, and division.', fileType: 'pdf', fileSize: '3.9 MB', uploadedBy: 'Dr. Robert Singh', uploadedDate: '2026-03-27', downloads: 51 },
  { id: 'm15', classId: '6', title: 'Mitosis Animation Videos', description: 'Interactive videos showing cellular processes in detail.', fileType: 'video', fileSize: '380 MB', uploadedBy: 'Dr. Robert Singh', uploadedDate: '2026-03-23', downloads: 94 },
  { id: 'm16', classId: '6', title: 'Lab Data Analysis Template', description: 'Excel spreadsheet for recording and analyzing lab observations.', fileType: 'spreadsheet', fileSize: '0.5 MB', uploadedBy: 'Dr. Robert Singh', uploadedDate: '2026-03-20', downloads: 73 },
];
