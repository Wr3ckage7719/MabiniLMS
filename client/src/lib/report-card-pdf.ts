import type { MabiniWeightedSummary, MabiniGradingPeriodKey } from '@/services/grades.service';
import { formatMabiniGradePoint, describeMabiniRemarks } from '@/lib/grade-points';
import { GRADING_PERIOD_LABELS } from '@/lib/task-types';

const ALL_PERIODS: MabiniGradingPeriodKey[] = ['pre_mid', 'midterm', 'pre_final', 'final'];

export interface ReportCardInput {
  studentName: string;
  studentEmail?: string;
  courseName: string;
  courseSection?: string;
  instructorName: string;
  schedule?: string;
  semester?: string;
  generatedAt: Date;
  mabini: MabiniWeightedSummary | null | undefined;
  /** Fallback overall percentage when mabini block is missing. */
  fallbackPercent: number | null;
}

export const generateReportCardPdf = async (input: ReportCardInput): Promise<Blob> => {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  // jspdf-autotable registers itself as a plugin on jsPDF
  const autoTable = (autoTableMod as { default?: unknown }).default ?? autoTableMod;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // ── Header band ──────────────────────────────────────────────────────────
  doc.setFillColor(0, 51, 102);
  doc.rect(0, 0, pageWidth, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('MABINI COLLEGES', pageWidth / 2, 12, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Daet, Camarines Norte', pageWidth / 2, 19, { align: 'center' });
  doc.text('College of Education', pageWidth / 2, 25, { align: 'center' });

  // ── Title ────────────────────────────────────────────────────────────────
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Student Grade Report', pageWidth / 2, 44, { align: 'center' });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(
    `Generated ${input.generatedAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })}`,
    pageWidth / 2,
    50,
    { align: 'center' }
  );

  // ── Meta block ───────────────────────────────────────────────────────────
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(10);
  let cursorY = 62;
  const labelX = 18;
  const valueX = 62;

  const metaRows: Array<[string, string]> = [
    ['Student', input.studentName || '—'],
    ['Course', input.courseName || '—'],
  ];
  if (input.courseSection) metaRows.push(['Section / Block', input.courseSection]);
  if (input.schedule) metaRows.push(['Schedule', input.schedule]);
  metaRows.push(['Instructor', input.instructorName || '—']);
  if (input.semester) metaRows.push(['Semester', input.semester]);
  if (input.studentEmail) metaRows.push(['Email', input.studentEmail]);

  for (const [label, value] of metaRows) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, labelX, cursorY);
    doc.setFont('helvetica', 'normal');
    doc.text(value, valueX, cursorY);
    cursorY += 6.5;
  }

  cursorY += 4;

  // ── Period grades table ──────────────────────────────────────────────────
  const periodRows = ALL_PERIODS.map((period) => {
    const gp = input.mabini?.period_grade_points[period] ?? null;
    const grade = input.mabini?.period_grades[period] ?? null;
    return [
      GRADING_PERIOD_LABELS[period] ?? period,
      grade !== null ? `${grade.toFixed(2)}%` : 'INC',
      gp !== null ? formatMabiniGradePoint(gp) : 'INC',
    ];
  });

  (autoTable as (doc: unknown, opts: unknown) => void)(doc, {
    startY: cursorY,
    head: [['Grading Period', 'Rating (%)', 'Grade Point']],
    body: periodRows,
    styles: { font: 'helvetica', fontSize: 11, halign: 'center', cellPadding: 3.5 },
    headStyles: { fillColor: [0, 51, 102], textColor: 255, fontStyle: 'bold', fontSize: 11 },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 80 } },
    margin: { left: 18, right: 18 },
    tableLineColor: [200, 200, 200],
    tableLineWidth: 0.2,
  });

  const afterTable =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? cursorY + 40;

  // ── Final grade band ─────────────────────────────────────────────────────
  const overallGp = input.mabini?.overall_grade_point ?? null;
  const overallRemarks =
    input.mabini?.remarks ?? describeMabiniRemarks(null);
  const overallDisplay =
    overallGp !== null
      ? formatMabiniGradePoint(overallGp)
      : input.fallbackPercent !== null
        ? `${Math.round(input.fallbackPercent)}%`
        : 'INC';

  const bandY = afterTable + 10;
  doc.setFillColor(240, 244, 250);
  doc.rect(18, bandY, pageWidth - 36, 26, 'F');
  doc.setDrawColor(0, 51, 102);
  doc.setLineWidth(0.4);
  doc.rect(18, bandY, pageWidth - 36, 26, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text('FINAL GRADE', 24, bandY + 10);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(0, 51, 102);
  doc.text(overallDisplay, pageWidth - 22, bandY + 14, { align: 'right' });

  const remarkColor: [number, number, number] =
    overallRemarks === 'Passed'
      ? [22, 163, 74]
      : overallRemarks === 'Failed'
        ? [220, 38, 38]
        : [100, 100, 100];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...remarkColor);
  doc.text(`Remarks: ${overallRemarks}`, 24, bandY + 20);

  // ── Signature lines ──────────────────────────────────────────────────────
  const sigY = bandY + 46;
  doc.setDrawColor(140, 140, 140);
  doc.setLineWidth(0.3);
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  doc.line(24, sigY, 90, sigY);
  doc.text(input.instructorName || 'Instructor', 57, sigY + 5, { align: 'center' });
  doc.text('Instructor / Subject Teacher', 57, sigY + 10, { align: 'center' });

  doc.line(pageWidth - 90, sigY, pageWidth - 24, sigY);
  doc.text("Parent / Guardian's Signature", pageWidth - 57, sigY + 5, { align: 'center' });
  doc.text('Date: ___________________', pageWidth - 57, sigY + 10, { align: 'center' });

  // ── Footer ───────────────────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    'This report is generated from Mabini LMS. For the official transcript, contact the Office of the Registrar.',
    pageWidth / 2,
    287,
    { align: 'center' }
  );

  return doc.output('blob');
};
