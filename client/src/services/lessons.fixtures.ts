import type { Lesson } from '@/lib/data';

// Frontend-only mock data for the LM-centric lesson flow. The real backend
// has not landed yet; these fixtures let us design and review the UX end to
// end before the schema/routes ship. Once the backend lands, replace these
// with real fetches in `lessons.service.ts`.

const buildLesson = (overrides: Partial<Lesson> & Pick<Lesson, 'id' | 'classId' | 'ordering' | 'title'>): Lesson => ({
  description: null,
  topics: [],
  isPublished: true,
  createdAt: new Date().toISOString(),
  completionRule: { type: 'mark_as_done' },
  materials: [],
  assessments: [],
  chain: {
    next_lesson_id: null,
    unlock_on_submit: true,
    unlock_on_pass: false,
    pass_threshold_percent: null,
  },
  status: 'active',
  unlockBlocker: null,
  doneAt: null,
  ...overrides,
});

export const buildStudentLessonFixture = (classId: string): Lesson[] => {
  return [
    buildLesson({
      id: `${classId}-lesson-01`,
      classId,
      ordering: 1,
      title: 'Introduction to PC Components',
      description:
        'A walkthrough of the major hardware components inside a desktop computer.',
      topics: ['Hardware', 'Foundations'],
      completionRule: { type: 'mark_as_done' },
      materials: [
        {
          material_id: `${classId}-mat-01-1`,
          title: 'PC Components Overview.pdf',
          file_type: 'pdf',
          file_size: '2.1 MB',
          url: '#',
          viewed: true,
          view_seconds: 1320,
        },
      ],
      assessments: [
        {
          assignment_id: `${classId}-quiz-01`,
          title: 'Quiz: PC Components',
          raw_type: 'quiz',
          points: 10,
          submitted: true,
          graded: true,
          score_percent: 92,
        },
      ],
      chain: {
        next_lesson_id: `${classId}-lesson-02`,
        unlock_on_submit: true,
        unlock_on_pass: false,
        pass_threshold_percent: null,
      },
      status: 'done',
      doneAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    }),
    buildLesson({
      id: `${classId}-lesson-02`,
      classId,
      ordering: 2,
      title: 'Power Supply Units',
      description:
        'Voltage, wattage, and how PSUs deliver clean power to the rest of the build.',
      topics: ['Hardware'],
      completionRule: { type: 'mark_as_done' },
      materials: [
        {
          material_id: `${classId}-mat-02-1`,
          title: 'PSU Basics.pdf',
          file_type: 'pdf',
          file_size: '3.2 MB',
          url: '#',
          viewed: true,
          view_seconds: 510,
        },
        {
          material_id: `${classId}-mat-02-2`,
          title: 'Voltage Standards.docx',
          file_type: 'docx',
          file_size: '0.8 MB',
          url: '#',
          viewed: false,
          view_seconds: 0,
        },
      ],
      assessments: [
        {
          assignment_id: `${classId}-quiz-02`,
          title: 'Quiz: PSU Concepts',
          raw_type: 'quiz',
          points: 8,
          submitted: false,
          graded: false,
          score_percent: null,
        },
        {
          assignment_id: `${classId}-act-02`,
          title: 'Activity: Wattage Worksheet',
          raw_type: 'activity',
          points: 15,
          submitted: false,
          graded: false,
          is_optional: false,
        },
      ],
      chain: {
        next_lesson_id: `${classId}-lesson-03`,
        unlock_on_submit: true,
        unlock_on_pass: false,
        pass_threshold_percent: null,
      },
      status: 'active',
    }),
    buildLesson({
      id: `${classId}-lesson-03`,
      classId,
      ordering: 3,
      title: 'Motherboard Architecture',
      description:
        'Chipsets, sockets, lanes, and how the motherboard ties everything together.',
      topics: ['Hardware', 'Architecture'],
      completionRule: { type: 'view_all_files' },
      materials: [
        {
          material_id: `${classId}-mat-03-1`,
          title: 'Motherboard Layouts.pptx',
          file_type: 'pptx',
          file_size: '5.4 MB',
          url: '#',
          viewed: false,
          view_seconds: 0,
        },
      ],
      assessments: [
        {
          assignment_id: `${classId}-exam-03`,
          title: 'Exam: Motherboards',
          raw_type: 'exam',
          points: 30,
          submitted: false,
          graded: false,
        },
      ],
      chain: {
        next_lesson_id: `${classId}-lesson-04`,
        unlock_on_submit: true,
        unlock_on_pass: true,
        pass_threshold_percent: 75,
      },
      status: 'locked',
      unlockBlocker: {
        lesson_id: `${classId}-lesson-02`,
        lesson_title: 'Power Supply Units',
        reason: 'predecessor_assessment_pending',
      },
    }),
    buildLesson({
      id: `${classId}-lesson-04`,
      classId,
      ordering: 4,
      title: 'Storage: HDDs, SSDs, and NVMe',
      description: null,
      topics: ['Hardware'],
      completionRule: { type: 'mark_as_done' },
      materials: [
        {
          material_id: `${classId}-mat-04-1`,
          title: 'Storage Comparison.pdf',
          file_type: 'pdf',
          file_size: '1.7 MB',
          url: '#',
        },
      ],
      assessments: [],
      chain: {
        next_lesson_id: null,
        unlock_on_submit: true,
        unlock_on_pass: false,
      },
      status: 'locked',
      unlockBlocker: {
        lesson_id: `${classId}-lesson-03`,
        lesson_title: 'Motherboard Architecture',
        reason: 'predecessor_not_done',
      },
    }),
  ];
};

export const buildTeacherLessonFixture = (classId: string): Lesson[] => {
  // Teacher view shares the same shape but every lesson is treated as
  // 'active' (so the teacher list shows every lesson without lock states),
  // and includes the rollup stats. Draft lesson at the end demonstrates the
  // unpublished pill.
  const studentFixture = buildStudentLessonFixture(classId);
  return [
    ...studentFixture.map((lesson, index) => ({
      ...lesson,
      status: 'active' as const,
      unlockBlocker: null,
      stats: {
        completed_students: Math.max(0, 23 - index * 6),
        total_students: 23,
      },
    })),
    buildLesson({
      id: `${classId}-lesson-05-draft`,
      classId,
      ordering: 5,
      title: 'CPU Cooling Strategies',
      isPublished: false,
      completionRule: { type: 'mark_as_done' },
      materials: [],
      assessments: [],
      chain: {
        next_lesson_id: null,
        unlock_on_submit: true,
        unlock_on_pass: false,
      },
      status: 'draft',
      stats: { completed_students: 0, total_students: 23 },
    }),
  ];
};

export const findLessonInFixture = (
  lessons: Lesson[],
  lessonId: string
): Lesson | undefined => {
  return lessons.find((lesson) => lesson.id === lessonId);
};
