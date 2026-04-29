import { apiClient } from './api-client';

export type WeightedGradeCategory = 'exam' | 'quiz' | 'activity' | 'recitation' | 'attendance' | 'project';

export interface WeightedCategoryBreakdown {
  category: WeightedGradeCategory;
  weight: number;
  assignment_total: number;
  graded_count: number;
  points_earned: number;
  points_possible: number;
  raw_percentage: number | null;
  weighted_contribution: number;
}

export type MabiniGradingPeriodKey = 'pre_mid' | 'midterm' | 'pre_final' | 'final';

export interface MabiniWeightedSummary {
  period_weight: number;
  period_grades: Record<MabiniGradingPeriodKey, number | null>;
  period_grade_points: Record<MabiniGradingPeriodKey, number | null>;
  overall_weighted_grade: number | null;
  overall_grade_point: number | null;
  remarks: 'Passed' | 'Failed' | 'INC';
}

export interface WeightedCourseGradeBreakdown {
  course_id: string;
  student_id: string;
  policy: 'missing_categories_count_as_zero';
  final_percentage: number;
  letter_grade: string;
  weights: Record<WeightedGradeCategory, number>;
  categories: Record<WeightedGradeCategory, WeightedCategoryBreakdown>;
  mabini?: MabiniWeightedSummary;
}

const extractArray = (response: any) => {
  if (Array.isArray(response?.data)) {
    return response.data;
  }
  if (Array.isArray(response)) {
    return response;
  }
  return [];
};

export const gradesService = {
  async getMyGrades(courseId?: string) {
    const response = await apiClient.get('/grades/my-grades');
    const grades = (response?.data || []).filter((entry: any) => {
      if (!courseId) return true;
      return entry?.course?.id === courseId;
    });

    return {
      ...response,
      data: {
        grades,
      },
    };
  },

  async getCourseGrades(courseId: string) {
    const assignmentsResponse = await apiClient.get(
      `/assignments?course_id=${courseId}&include_past=true&limit=100`
    );
    const assignments = extractArray(assignmentsResponse);

    const gradeResponses = await Promise.all(
      assignments.map(async (assignment: { id: string }) => {
        try {
          const response = await apiClient.get(`/grades/assignment/${assignment.id}`);
          return extractArray(response);
        } catch {
          return [];
        }
      })
    );

    return {
      data: {
        grades: gradeResponses.flat(),
      },
    };
  },

  async getStudentGrades(courseId: string, studentId: string) {
    const response = await this.getCourseGrades(courseId);
    const grades = (response.data?.grades || []).filter((grade: any) => {
      return grade?.student?.id === studentId || grade?.submission?.student_id === studentId;
    });

    return {
      data: {
        grades,
      },
    };
  },

  async getWeightedCourseGrade(courseId: string, studentId?: string) {
    const query = studentId
      ? `?student_id=${encodeURIComponent(studentId)}`
      : '';

    const response = await apiClient.get<{ success: boolean; data: WeightedCourseGradeBreakdown }>(
      `/grades/course/${courseId}/weighted${query}`
    );
    return {
      ...response,
      data: response?.data,
    };
  },

  async updateGrade(gradeId: string, data: { score?: number; feedback?: string }) {
    return apiClient.patch(`/grades/${gradeId}`, {
      points_earned: data.score,
      feedback: data.feedback,
    });
  },

  async getGradeStatistics(courseId: string, assignmentId?: string) {
    if (assignmentId) {
      return apiClient.get(`/grades/assignment/${assignmentId}/stats`);
    }

    const assignmentsResponse = await apiClient.get(
      `/assignments?course_id=${courseId}&include_past=true&limit=100`
    );
    const assignments = extractArray(assignmentsResponse);

    const statsResponses = await Promise.all(
      assignments.map(async (assignment: { id: string }) => {
        try {
          const response = await apiClient.get(`/grades/assignment/${assignment.id}/stats`);
          return response?.data;
        } catch {
          return null;
        }
      })
    );

    const stats = statsResponses.filter(Boolean);

    if (stats.length === 0) {
      return {
        data: {
          total_submissions: 0,
          graded_count: 0,
          ungraded_count: 0,
          average_percentage: null,
        },
      };
    }

    const total_submissions = stats.reduce((sum: number, item: any) => sum + (item.total_submissions || 0), 0);
    const graded_count = stats.reduce((sum: number, item: any) => sum + (item.graded_count || 0), 0);
    const ungraded_count = stats.reduce((sum: number, item: any) => sum + (item.ungraded_count || 0), 0);
    const average_percentage_values = stats
      .map((item: any) => item.average_percentage)
      .filter((value: number | null) => typeof value === 'number');

    const average_percentage =
      average_percentage_values.length > 0
        ? average_percentage_values.reduce((sum: number, value: number) => sum + value, 0) /
          average_percentage_values.length
        : null;

    return {
      data: {
        total_submissions,
        graded_count,
        ungraded_count,
        average_percentage,
      },
    };
  },
};
