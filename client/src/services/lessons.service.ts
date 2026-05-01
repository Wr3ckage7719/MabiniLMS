import type {
  Lesson,
  LessonChain,
  LessonCompletionRule,
} from '@/lib/data';
import {
  buildStudentLessonFixture,
  buildTeacherLessonFixture,
  findLessonInFixture,
} from './lessons.fixtures';

// ============================================
// Frontend-only stub service for the LM-centric flow.
// ============================================
//
// The backend doesn't have a /api/lessons surface yet — that's the next
// phase. For now this service serves the mocks from `lessons.fixtures.ts`
// so we can finalise UX before locking schema. Every method below should
// keep the same signature when the real API lands; the function bodies
// are the only thing that needs swapping.

const STUDENT_FIXTURE_CACHE = new Map<string, Lesson[]>();
const TEACHER_FIXTURE_CACHE = new Map<string, Lesson[]>();

const getStudentFixture = (classId: string): Lesson[] => {
  let lessons = STUDENT_FIXTURE_CACHE.get(classId);
  if (!lessons) {
    lessons = buildStudentLessonFixture(classId);
    STUDENT_FIXTURE_CACHE.set(classId, lessons);
  }
  return lessons;
};

const getTeacherFixture = (classId: string): Lesson[] => {
  let lessons = TEACHER_FIXTURE_CACHE.get(classId);
  if (!lessons) {
    lessons = buildTeacherLessonFixture(classId);
    TEACHER_FIXTURE_CACHE.set(classId, lessons);
  }
  return lessons;
};

const cloneLesson = (lesson: Lesson): Lesson => ({
  ...lesson,
  topics: [...lesson.topics],
  materials: lesson.materials.map((m) => ({ ...m })),
  assessments: lesson.assessments.map((a) => ({ ...a })),
  chain: { ...lesson.chain },
  unlockBlocker: lesson.unlockBlocker ? { ...lesson.unlockBlocker } : null,
  stats: lesson.stats ? { ...lesson.stats } : undefined,
});

const persistStudentFixture = (classId: string, lessons: Lesson[]): void => {
  STUDENT_FIXTURE_CACHE.set(classId, lessons);
};

const persistTeacherFixture = (classId: string, lessons: Lesson[]): void => {
  TEACHER_FIXTURE_CACHE.set(classId, lessons);
};

export interface LessonEditorPayload {
  title: string;
  description: string | null;
  topics: string[];
  completionRule: LessonCompletionRule;
  chain: LessonChain;
  isPublished: boolean;
}

export const lessonsService = {
  // -------- student-side reads --------
  async listForStudent(classId: string): Promise<Lesson[]> {
    if (!classId) return [];
    return getStudentFixture(classId).map(cloneLesson);
  },

  async getForStudent(classId: string, lessonId: string): Promise<Lesson | null> {
    const lesson = findLessonInFixture(getStudentFixture(classId), lessonId);
    return lesson ? cloneLesson(lesson) : null;
  },

  async markAsDone(classId: string, lessonId: string): Promise<Lesson | null> {
    const lessons = getStudentFixture(classId);
    const next = lessons.map((lesson) => {
      if (lesson.id === lessonId) {
        return cloneLesson({
          ...lesson,
          status: 'done',
          doneAt: new Date().toISOString(),
        });
      }
      return cloneLesson(lesson);
    });

    // Cascade: if the chain pointed at this lesson, unlock the next one.
    const completed = next.find((lesson) => lesson.id === lessonId);
    if (completed?.chain.next_lesson_id) {
      const idx = next.findIndex((lesson) => lesson.id === completed.chain.next_lesson_id);
      if (idx >= 0 && next[idx].status === 'locked') {
        // Only auto-unlock when the predecessor blocker pointed back at us;
        // a real backend would also check assessment submission state.
        next[idx] = {
          ...next[idx],
          status: 'active',
          unlockBlocker: null,
        };
      }
    }

    persistStudentFixture(classId, next);
    return next.find((lesson) => lesson.id === lessonId) ?? null;
  },

  // -------- teacher-side reads --------
  async listForTeacher(classId: string): Promise<Lesson[]> {
    if (!classId) return [];
    return getTeacherFixture(classId).map(cloneLesson);
  },

  async getForTeacher(classId: string, lessonId: string): Promise<Lesson | null> {
    const lesson = findLessonInFixture(getTeacherFixture(classId), lessonId);
    return lesson ? cloneLesson(lesson) : null;
  },

  // -------- teacher-side writes (mock) --------
  async createDraft(classId: string): Promise<Lesson> {
    const lessons = getTeacherFixture(classId);
    const nextOrdering = lessons.length > 0
      ? Math.max(...lessons.map((lesson) => lesson.ordering)) + 1
      : 1;
    const draft: Lesson = {
      id: `${classId}-lesson-new-${Date.now()}`,
      classId,
      ordering: nextOrdering,
      title: 'Untitled lesson',
      description: null,
      topics: [],
      isPublished: false,
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
      status: 'draft',
      unlockBlocker: null,
      doneAt: null,
      stats: { completed_students: 0, total_students: lessons[0]?.stats?.total_students ?? 0 },
    };
    persistTeacherFixture(classId, [...lessons, draft]);
    return cloneLesson(draft);
  },

  async update(
    classId: string,
    lessonId: string,
    payload: LessonEditorPayload
  ): Promise<Lesson | null> {
    const lessons = getTeacherFixture(classId);
    const next = lessons.map((lesson) => {
      if (lesson.id !== lessonId) return cloneLesson(lesson);
      return cloneLesson({
        ...lesson,
        title: payload.title,
        description: payload.description,
        topics: [...payload.topics],
        completionRule: payload.completionRule,
        chain: { ...payload.chain },
        isPublished: payload.isPublished,
        status: payload.isPublished ? 'active' : 'draft',
      });
    });
    persistTeacherFixture(classId, next);
    return next.find((lesson) => lesson.id === lessonId) ?? null;
  },

  async reorder(classId: string, orderedIds: string[]): Promise<Lesson[]> {
    const lessons = getTeacherFixture(classId);
    const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
    const reordered: Lesson[] = [];
    orderedIds.forEach((id, index) => {
      const lesson = byId.get(id);
      if (lesson) {
        reordered.push(cloneLesson({ ...lesson, ordering: index + 1 }));
        byId.delete(id);
      }
    });
    // Append any not in the ordered list (defensive).
    for (const lesson of byId.values()) {
      reordered.push(cloneLesson({ ...lesson, ordering: reordered.length + 1 }));
    }
    persistTeacherFixture(classId, reordered);
    return reordered.map(cloneLesson);
  },

  async setChain(
    classId: string,
    lessonId: string,
    chain: LessonChain
  ): Promise<Lesson | null> {
    const lessons = getTeacherFixture(classId);
    const next = lessons.map((lesson) =>
      lesson.id === lessonId
        ? cloneLesson({ ...lesson, chain: { ...chain } })
        : cloneLesson(lesson)
    );
    persistTeacherFixture(classId, next);
    return next.find((lesson) => lesson.id === lessonId) ?? null;
  },

  async deleteLesson(classId: string, lessonId: string): Promise<void> {
    const lessons = getTeacherFixture(classId);
    persistTeacherFixture(
      classId,
      lessons.filter((lesson) => lesson.id !== lessonId)
    );
  },
};
