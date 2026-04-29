/**
 * Mabini Colleges grade-point conversion (Philippine CHED scale).
 * Mirrors `convertToMabiniGradePoint` on the server so the UI can display
 * per-period and overall standings in the registrar's 1.00–5.00 format.
 */
export function convertPercentageToMabiniGradePoint(weightedGrade: number): number {
  if (weightedGrade >= 97.5) return 1.0;
  if (weightedGrade >= 94.5) return 1.25;
  if (weightedGrade >= 91.5) return 1.5;
  if (weightedGrade >= 88.5) return 1.75;
  if (weightedGrade >= 85.5) return 2.0;
  if (weightedGrade >= 82.5) return 2.25;
  if (weightedGrade >= 79.5) return 2.5;
  if (weightedGrade >= 76.5) return 2.75;
  if (weightedGrade >= 74.5) return 3.0;
  return 5.0;
}

export function formatMabiniGradePoint(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'INC';
  return value.toFixed(2);
}

export function describeMabiniRemarks(gradePoint: number | null | undefined): 'Passed' | 'Failed' | 'INC' {
  if (typeof gradePoint !== 'number' || Number.isNaN(gradePoint)) return 'INC';
  return gradePoint <= 3.0 ? 'Passed' : 'Failed';
}
