import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError, ErrorCode } from '../types/index.js';
import logger from '../utils/logger.js';

// ============================================
// Types
// ============================================

export type CompetencyStatus = 'competent' | 'in_progress' | 'not_yet_competent';

export interface CompetencyUnit {
  id: string;
  course_id: string;
  code: string;
  title: string;
  description: string | null;
  threshold_percent: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CompetencyEvidenceRow {
  id: string;
  unit_id: string;
  assignment_id: string | null;
  material_id: string | null;
  weight: number;
  created_at: string;
}

export interface UnitEvidenceMeta extends CompetencyEvidenceRow {
  assignment?: {
    id: string;
    title: string;
    max_points: number;
  } | null;
  material?: {
    id: string;
    title: string;
    type: string | null;
  } | null;
}

export interface UnitWithEvidence extends CompetencyUnit {
  evidence: UnitEvidenceMeta[];
}

export interface StudentEvidenceContribution {
  evidence_id: string;
  artifact_kind: 'assignment' | 'material';
  artifact_id: string;
  artifact_title: string;
  weight: number;
  earned_fraction: number; // 0..1 — how much of the weight the student has cleared
  detail: string;
}

export interface StudentUnitStatus {
  unit_id: string;
  code: string;
  title: string;
  threshold_percent: number;
  evidence_count: number;
  weighted_total: number;
  weighted_earned: number;
  percent_complete: number;
  status: CompetencyStatus;
  contributions: StudentEvidenceContribution[];
}

export interface StudentCourseCompetencySummary {
  course_id: string;
  student_id: string;
  units: StudentUnitStatus[];
  competent_count: number;
  in_progress_count: number;
  not_yet_competent_count: number;
}

// ============================================
// Loaders
// ============================================

const loadCourseCompetencyUnits = async (
  courseId: string
): Promise<CompetencyUnit[]> => {
  const { data, error } = await supabaseAdmin
    .from('competency_units')
    .select('id, course_id, code, title, description, threshold_percent, sort_order, created_at, updated_at')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('Failed to list competency units', { courseId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load competency units', 500);
  }

  return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    course_id: row.course_id as string,
    code: row.code as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    threshold_percent: Number(row.threshold_percent ?? 75),
    sort_order: Number(row.sort_order ?? 0),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }));
};

const loadEvidenceForUnits = async (
  unitIds: string[]
): Promise<Map<string, UnitEvidenceMeta[]>> => {
  if (unitIds.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from('competency_evidence')
    .select(
      `id, unit_id, assignment_id, material_id, weight, created_at,
       assignment:assignments(id, title, max_points),
       material:course_materials(id, title, type)`
    )
    .in('unit_id', unitIds);

  if (error) {
    logger.error('Failed to load competency evidence', { error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load competency evidence', 500);
  }

  const byUnit = new Map<string, UnitEvidenceMeta[]>();
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    const assignment = Array.isArray(row.assignment)
      ? (row.assignment[0] as { id: string; title: string; max_points: number } | undefined)
      : (row.assignment as { id: string; title: string; max_points: number } | null | undefined);
    const material = Array.isArray(row.material)
      ? (row.material[0] as { id: string; title: string; type: string | null } | undefined)
      : (row.material as { id: string; title: string; type: string | null } | null | undefined);

    const meta: UnitEvidenceMeta = {
      id: row.id as string,
      unit_id: row.unit_id as string,
      assignment_id: (row.assignment_id as string | null) ?? null,
      material_id: (row.material_id as string | null) ?? null,
      weight: Number(row.weight ?? 1),
      created_at: row.created_at as string,
      assignment: assignment ? {
        id: assignment.id,
        title: assignment.title,
        max_points: Number(assignment.max_points ?? 0),
      } : null,
      material: material ? {
        id: material.id,
        title: material.title,
        type: material.type ?? null,
      } : null,
    };

    const existing = byUnit.get(meta.unit_id);
    if (existing) {
      existing.push(meta);
    } else {
      byUnit.set(meta.unit_id, [meta]);
    }
  }

  return byUnit;
};

interface StudentGradeRow {
  assignment_id: string;
  points_earned: number;
  max_points: number;
}

const loadStudentAssignmentGrades = async (
  studentId: string,
  assignmentIds: string[]
): Promise<Map<string, StudentGradeRow>> => {
  if (assignmentIds.length === 0) return new Map();

  // Pull every grade the student has earned for the requested assignments via
  // their submissions. We trust grades.points_earned + assignments.max_points
  // — there's no need to re-derive percentage here.
  const { data, error } = await supabaseAdmin
    .from('grades')
    .select(
      `points_earned,
       submission:submissions!inner(assignment_id, student_id,
         assignment:assignments!inner(id, max_points))`
    )
    .eq('submission.student_id', studentId)
    .in('submission.assignment_id', assignmentIds);

  if (error) {
    logger.error('Failed to load student grades for competency', {
      studentId,
      error: error.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load student grades', 500);
  }

  const map = new Map<string, StudentGradeRow>();
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    const submission = Array.isArray(row.submission)
      ? (row.submission[0] as { assignment_id: string; assignment: { id: string; max_points: number } | { id: string; max_points: number }[] } | undefined)
      : (row.submission as { assignment_id: string; assignment: { id: string; max_points: number } | { id: string; max_points: number }[] } | undefined);
    if (!submission) continue;
    const assignment = Array.isArray(submission.assignment)
      ? submission.assignment[0]
      : submission.assignment;
    if (!assignment) continue;
    map.set(submission.assignment_id, {
      assignment_id: submission.assignment_id,
      points_earned: Number(row.points_earned ?? 0),
      max_points: Number(assignment.max_points ?? 0),
    });
  }

  return map;
};

interface StudentMaterialProgressRow {
  material_id: string;
  progress_percent: number;
  completed: boolean;
}

const loadStudentMaterialProgress = async (
  studentId: string,
  materialIds: string[]
): Promise<Map<string, StudentMaterialProgressRow>> => {
  if (materialIds.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from('material_progress')
    .select('material_id, progress_percent, completed')
    .eq('user_id', studentId)
    .in('material_id', materialIds);

  if (error) {
    logger.error('Failed to load material progress for competency', {
      studentId,
      error: error.message,
    });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to load student progress', 500);
  }

  const map = new Map<string, StudentMaterialProgressRow>();
  for (const row of (data || []) as StudentMaterialProgressRow[]) {
    map.set(row.material_id, {
      material_id: row.material_id,
      progress_percent: Number(row.progress_percent ?? 0),
      completed: Boolean(row.completed),
    });
  }
  return map;
};

// ============================================
// Public reads
// ============================================

export const listCourseCompetencyUnits = async (
  courseId: string
): Promise<UnitWithEvidence[]> => {
  const units = await loadCourseCompetencyUnits(courseId);
  if (units.length === 0) return [];

  const evidenceByUnit = await loadEvidenceForUnits(units.map((u) => u.id));
  return units.map((unit) => ({
    ...unit,
    evidence: evidenceByUnit.get(unit.id) ?? [],
  }));
};

const computeContribution = (
  evidence: UnitEvidenceMeta,
  grades: Map<string, StudentGradeRow>,
  progress: Map<string, StudentMaterialProgressRow>
): StudentEvidenceContribution => {
  if (evidence.assignment_id) {
    const grade = grades.get(evidence.assignment_id);
    if (!grade || grade.max_points <= 0) {
      return {
        evidence_id: evidence.id,
        artifact_kind: 'assignment',
        artifact_id: evidence.assignment_id,
        artifact_title: evidence.assignment?.title ?? 'Assignment',
        weight: evidence.weight,
        earned_fraction: 0,
        detail: grade ? 'No max points configured' : 'Not yet graded',
      };
    }
    const fraction = Math.max(0, Math.min(1, grade.points_earned / grade.max_points));
    return {
      evidence_id: evidence.id,
      artifact_kind: 'assignment',
      artifact_id: evidence.assignment_id,
      artifact_title: evidence.assignment?.title ?? 'Assignment',
      weight: evidence.weight,
      earned_fraction: fraction,
      detail: `${grade.points_earned} / ${grade.max_points} points`,
    };
  }

  const materialId = evidence.material_id ?? '';
  const row = progress.get(materialId);
  const progressPercent = row?.progress_percent ?? 0;
  const completed = row?.completed ?? false;
  const fraction = completed ? 1 : Math.max(0, Math.min(1, progressPercent / 100));

  return {
    evidence_id: evidence.id,
    artifact_kind: 'material',
    artifact_id: materialId,
    artifact_title: evidence.material?.title ?? 'Learning material',
    weight: evidence.weight,
    earned_fraction: fraction,
    detail: completed ? 'Completed' : `${Math.round(progressPercent)}% viewed`,
  };
};

const deriveStatus = (
  percentComplete: number,
  threshold: number,
  evidenceCount: number
): CompetencyStatus => {
  if (evidenceCount === 0) return 'not_yet_competent';
  if (percentComplete >= threshold) return 'competent';
  if (percentComplete > 0) return 'in_progress';
  return 'not_yet_competent';
};

export const getStudentCourseCompetencySummary = async (
  courseId: string,
  studentId: string
): Promise<StudentCourseCompetencySummary> => {
  const unitsWithEvidence = await listCourseCompetencyUnits(courseId);

  const allAssignmentIds = new Set<string>();
  const allMaterialIds = new Set<string>();
  for (const unit of unitsWithEvidence) {
    for (const evidence of unit.evidence) {
      if (evidence.assignment_id) allAssignmentIds.add(evidence.assignment_id);
      if (evidence.material_id) allMaterialIds.add(evidence.material_id);
    }
  }

  const [grades, progress] = await Promise.all([
    loadStudentAssignmentGrades(studentId, Array.from(allAssignmentIds)),
    loadStudentMaterialProgress(studentId, Array.from(allMaterialIds)),
  ]);

  let competent = 0;
  let inProgress = 0;
  let notYet = 0;

  const units: StudentUnitStatus[] = unitsWithEvidence.map((unit) => {
    const contributions = unit.evidence.map((evidence) =>
      computeContribution(evidence, grades, progress)
    );

    const weightedTotal = contributions.reduce((sum, c) => sum + c.weight, 0);
    const weightedEarned = contributions.reduce(
      (sum, c) => sum + c.weight * c.earned_fraction,
      0
    );
    const percentComplete = weightedTotal > 0 ? (weightedEarned / weightedTotal) * 100 : 0;
    const status = deriveStatus(percentComplete, unit.threshold_percent, contributions.length);

    if (status === 'competent') competent += 1;
    else if (status === 'in_progress') inProgress += 1;
    else notYet += 1;

    return {
      unit_id: unit.id,
      code: unit.code,
      title: unit.title,
      threshold_percent: unit.threshold_percent,
      evidence_count: contributions.length,
      weighted_total: Number(weightedTotal.toFixed(2)),
      weighted_earned: Number(weightedEarned.toFixed(2)),
      percent_complete: Number(percentComplete.toFixed(2)),
      status,
      contributions,
    };
  });

  return {
    course_id: courseId,
    student_id: studentId,
    units,
    competent_count: competent,
    in_progress_count: inProgress,
    not_yet_competent_count: notYet,
  };
};

// ============================================
// Mutations (teacher CRUD)
// ============================================

export interface UpsertCompetencyUnitInput {
  code: string;
  title: string;
  description?: string | null;
  threshold_percent?: number;
  sort_order?: number;
}

export const createCompetencyUnit = async (
  courseId: string,
  input: UpsertCompetencyUnitInput
): Promise<CompetencyUnit> => {
  const { data, error } = await supabaseAdmin
    .from('competency_units')
    .insert({
      course_id: courseId,
      code: input.code,
      title: input.title,
      description: input.description ?? null,
      threshold_percent:
        typeof input.threshold_percent === 'number' ? input.threshold_percent : 75,
      sort_order: typeof input.sort_order === 'number' ? input.sort_order : 0,
    })
    .select('id, course_id, code, title, description, threshold_percent, sort_order, created_at, updated_at')
    .single();

  if (error) {
    logger.error('Failed to create competency unit', { courseId, error: error.message });
    if ((error as { code?: string }).code === '23505') {
      throw new ApiError(
        ErrorCode.VALIDATION_ERROR,
        'A unit with this code already exists for the course',
        400
      );
    }
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to create competency unit', 500);
  }

  return data as unknown as CompetencyUnit;
};

export const updateCompetencyUnit = async (
  unitId: string,
  input: Partial<UpsertCompetencyUnitInput>
): Promise<CompetencyUnit> => {
  const updatePayload: Record<string, unknown> = {};
  if (input.code !== undefined) updatePayload.code = input.code;
  if (input.title !== undefined) updatePayload.title = input.title;
  if (input.description !== undefined) updatePayload.description = input.description;
  if (input.threshold_percent !== undefined) {
    updatePayload.threshold_percent = input.threshold_percent;
  }
  if (input.sort_order !== undefined) updatePayload.sort_order = input.sort_order;
  updatePayload.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('competency_units')
    .update(updatePayload)
    .eq('id', unitId)
    .select('id, course_id, code, title, description, threshold_percent, sort_order, created_at, updated_at')
    .single();

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') {
      throw new ApiError(ErrorCode.NOT_FOUND, 'Competency unit not found', 404);
    }
    logger.error('Failed to update competency unit', { unitId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update competency unit', 500);
  }

  return data as unknown as CompetencyUnit;
};

export const deleteCompetencyUnit = async (unitId: string): Promise<void> => {
  const { error } = await supabaseAdmin
    .from('competency_units')
    .delete()
    .eq('id', unitId);

  if (error) {
    logger.error('Failed to delete competency unit', { unitId, error: error.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to delete competency unit', 500);
  }
};

export interface SetUnitEvidenceInput {
  assignment_ids?: string[];
  material_ids?: string[];
}

export const setUnitEvidence = async (
  unitId: string,
  input: SetUnitEvidenceInput
): Promise<UnitEvidenceMeta[]> => {
  // Replace-strategy: delete existing rows for the unit then insert the
  // requested set. Easier semantics for the teacher UI than diffing.
  const { error: deleteErr } = await supabaseAdmin
    .from('competency_evidence')
    .delete()
    .eq('unit_id', unitId);

  if (deleteErr) {
    logger.error('Failed to clear competency evidence', { unitId, error: deleteErr.message });
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update evidence', 500);
  }

  const rows: Array<{ unit_id: string; assignment_id?: string; material_id?: string }> = [];
  for (const assignmentId of input.assignment_ids ?? []) {
    rows.push({ unit_id: unitId, assignment_id: assignmentId });
  }
  for (const materialId of input.material_ids ?? []) {
    rows.push({ unit_id: unitId, material_id: materialId });
  }

  if (rows.length > 0) {
    const { error: insertErr } = await supabaseAdmin
      .from('competency_evidence')
      .insert(rows);

    if (insertErr) {
      logger.error('Failed to insert competency evidence', { unitId, error: insertErr.message });
      throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to update evidence', 500);
    }
  }

  const evidenceMap = await loadEvidenceForUnits([unitId]);
  return evidenceMap.get(unitId) ?? [];
};
