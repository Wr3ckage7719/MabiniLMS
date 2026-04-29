/**
 * Registrar Export — Mabini Colleges 4-period grade workbook (.xlsx).
 *
 * The output mirrors the layout of `TTH 1-2_30PM.xlsx`
 * (instructor: VENANCIO C. DIANO, MAEd) which is the official registrar
 * format used by Mabini Colleges. We preserve every visible element:
 *
 *   • School header block (rows 2-4): MABINI COLLEGES / Daet, Camarines Norte /
 *     College of Education, all merged across A:Q.
 *   • Course metadata (rows 7-10): "Course and Block:", "Subject Code and
 *     Description:", "Class Schedule:", "Instructor:" with values merged
 *     across the right side.
 *   • Period banner (row 11): e.g. "PREMID PERIOD".
 *   • Three-row column header (rows 12-14) with the same merges:
 *       A=No., B=NAME, C-E="MAJOR EXAMS (35%)" sub-divided into raw/Rating/weight,
 *       F-L="CLASS PARTICIPATION (45%)" → Quizzes(F-H) / Recitation(I-J) /
 *       Attendance(K-L), M-N="PROJECT (20%)" raw/weight,
 *       O=WEIGHTED GRADE, P=FINAL GRADE, Q=REMARKS.
 *   • Row 14 holds the maxes (100) and weight constants
 *     (0.45 / 0.15 / 0.15 / 0.20 / 0.05) — formulas reference these so a
 *     teacher editing raw scores recalculates everything live.
 *   • Per-row formulas (Excel will recalculate on edit):
 *       Rating (D, G)  = raw/100*40+60
 *       Weighted (E,H,J,L,N) = source * weight
 *       Period weighted (O) = sum of all weighted contributions
 *       Final grade (P) = VLOOKUP into the table at T:U
 *       Remarks (Q) = Passed if FG ≤ 3.00, Failed otherwise, INC if missing.
 *   • Hidden lookup table at columns T:U sorted ascending so VLOOKUP TRUE works.
 *   • OVERALL RATING sheet pulls each period's column O with the period
 *     weighted as 0.25 each, then VLOOKUPs into its own copy of the table.
 */

import ExcelJS from 'exceljs'
import { supabaseAdmin } from '../lib/supabase.js'
import { ApiError, ErrorCode, UserRole } from '../types/index.js'
import {
  MabiniGradingPeriod,
  normalizeAssignmentCategory,
} from '../types/grades.js'
import { normalizeAssignmentType, supportsAssignmentTypeColumn } from '../utils/assignmentType.js'
import { ACTIVE_ENROLLMENT_STATUSES } from '../utils/enrollmentStatus.js'
import logger from '../utils/logger.js'

// ============================================
// Types
// ============================================

interface StudentRow {
  studentId: string
  no: number
  fullName: string
  periods: Record<MabiniGradingPeriod, PeriodAggregate>
}

interface PeriodAggregate {
  exam: { earned: number; possible: number }
  quiz: { earned: number; possible: number }
  recitation: { earned: number; possible: number }
  attendance: { earned: number; possible: number }
  project: { earned: number; possible: number }
  activity: { earned: number; possible: number }
}

interface CourseMeta {
  title: string
  description: string
  schedule: string
  instructor: string
  block: string
  semester: string
}

const ALL_PERIODS: MabiniGradingPeriod[] = ['pre_mid', 'midterm', 'pre_final', 'final']

const PERIOD_SHEET_NAME: Record<MabiniGradingPeriod, string> = {
  pre_mid: 'Pre-Mid (25%)',
  midterm: 'Midterm (25%)',
  pre_final: 'Pre-Final (25%)',
  final: 'Final (25%)',
}

const PERIOD_BANNER: Record<MabiniGradingPeriod, string> = {
  pre_mid: 'PREMID PERIOD',
  midterm: 'MIDTERM PERIOD',
  pre_final: 'PRE-FINAL PERIOD',
  final: 'FINAL PERIOD',
}

const emptyPeriodAggregate = (): PeriodAggregate => ({
  exam: { earned: 0, possible: 0 },
  quiz: { earned: 0, possible: 0 },
  recitation: { earned: 0, possible: 0 },
  attendance: { earned: 0, possible: 0 },
  project: { earned: 0, possible: 0 },
  activity: { earned: 0, possible: 0 },
})

const formatFullName = (
  lastName: string | null,
  firstName: string | null,
  middleInitial?: string | null
): string => {
  const last = (lastName || '').trim()
  const first = (firstName || '').trim()
  const middle = (middleInitial || '').trim()
  if (!last && !first) return ''
  const middlePart = middle ? ` ${middle}.` : ''
  return last && first ? `${last}, ${first}${middlePart}` : (last || first)
}

// ============================================
// Public API
// ============================================

export interface RegistrarWorkbookOptions {
  scopeStudentId?: string
}

export const buildRegistrarWorkbook = async (
  courseId: string,
  userId: string,
  userRole: UserRole,
  options: RegistrarWorkbookOptions = {}
): Promise<{ buffer: Buffer; filename: string }> => {
  const { scopeStudentId } = options

  // ---- Authorization mirrors the CSV exporter ----
  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .select('id, title, description, teacher_id, schedule, room')
    .eq('id', courseId)
    .single()

  if (courseError || !course) {
    throw new ApiError(ErrorCode.NOT_FOUND, 'Course not found', 404)
  }

  const isStudentScope = Boolean(scopeStudentId)
  if (isStudentScope) {
    if (scopeStudentId !== userId) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Students can only export their own grade', 403)
    }
    const { data: enrollment, error: enrollErr } = await supabaseAdmin
      .from('enrollments')
      .select('student_id, status')
      .eq('course_id', courseId)
      .eq('student_id', scopeStudentId)
      .maybeSingle()
    if (enrollErr || !enrollment || !ACTIVE_ENROLLMENT_STATUSES.includes(enrollment.status as any)) {
      throw new ApiError(ErrorCode.FORBIDDEN, 'You are not enrolled in this course', 403)
    }
  } else if (userRole !== UserRole.ADMIN && (course as any).teacher_id !== userId) {
    throw new ApiError(ErrorCode.FORBIDDEN, 'Not authorized', 403)
  }

  // ---- Resolve teacher display name for instructor row ----
  let instructorName = ''
  if ((course as any).teacher_id) {
    const { data: teacher } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', (course as any).teacher_id)
      .maybeSingle()
    if (teacher) {
      instructorName = `${(teacher.first_name || '').trim()} ${(teacher.last_name || '').trim()}`.trim()
    }
  }

  // ---- Load enrolled students ----
  const enrollmentsQuery = supabaseAdmin
    .from('enrollments')
    .select(`
      student_id,
      profile:profiles!enrollments_student_id_fkey(id, first_name, last_name, email)
    `)
    .eq('course_id', courseId)
    .in('status', ACTIVE_ENROLLMENT_STATUSES)

  if (scopeStudentId) {
    enrollmentsQuery.eq('student_id', scopeStudentId)
  }

  const { data: enrollments, error: enrollErr } = await enrollmentsQuery
  if (enrollErr) {
    logger.error('Registrar workbook: failed to fetch enrollments', { error: enrollErr.message })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to build registrar export', 500)
  }

  // ---- Load grades joined to assignments ----
  const hasTypeColumn = await supportsAssignmentTypeColumn()
  const typeField = hasTypeColumn ? ', assignment_type' : ''

  let hasPeriodColumn = false
  let periodField = ''
  try {
    const { error: probeErr } = await supabaseAdmin
      .from('assignments')
      .select('id, grading_period')
      .limit(1)
    if (!probeErr) {
      hasPeriodColumn = true
      periodField = ', grading_period'
    }
  } catch {
    /* missing column — treat all assignments as unpinned */
  }

  const gradesQuery = supabaseAdmin
    .from('grades')
    .select(`
      points_earned,
      submission:submissions!inner(
        student_id,
        assignment:assignments!inner(
          id, max_points, course_id${typeField}${periodField}
        )
      )
    `)
    .eq('submission.assignment.course_id', courseId)

  if (scopeStudentId) {
    gradesQuery.eq('submission.student_id', scopeStudentId)
  }

  const { data: gradesRows, error: gradesError } = await gradesQuery
  if (gradesError) {
    logger.error('Registrar workbook: failed to fetch grades', { error: gradesError.message })
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Failed to build registrar export', 500)
  }

  // ---- Build per-student aggregates ----
  const studentMap = new Map<string, StudentRow>()
  let unpinnedCount = 0

  // Seed from enrollments so students with no grades still appear
  for (const enrollment of enrollments || []) {
    const profile = Array.isArray((enrollment as any).profile)
      ? (enrollment as any).profile[0]
      : (enrollment as any).profile
    if (!profile?.id) continue
    studentMap.set(profile.id, {
      studentId: profile.id,
      no: 0,
      fullName: formatFullName(profile.last_name, profile.first_name),
      periods: {
        pre_mid: emptyPeriodAggregate(),
        midterm: emptyPeriodAggregate(),
        pre_final: emptyPeriodAggregate(),
        final: emptyPeriodAggregate(),
      },
    })
  }

  for (const row of gradesRows || []) {
    const submission = Array.isArray((row as any).submission)
      ? (row as any).submission[0]
      : (row as any).submission
    const assignment = Array.isArray(submission?.assignment)
      ? submission.assignment[0]
      : submission?.assignment

    if (!assignment || !submission?.student_id) continue
    const student = studentMap.get(submission.student_id)
    if (!student) continue

    const period = hasPeriodColumn
      ? ((assignment as any).grading_period as MabiniGradingPeriod | null)
      : null
    if (!period || !ALL_PERIODS.includes(period)) {
      unpinnedCount += 1
      continue
    }

    const rawType = normalizeAssignmentType((assignment as any).assignment_type)
    const category = normalizeAssignmentCategory(rawType) as keyof PeriodAggregate
    const earned = Number((row as any).points_earned || 0)
    const possible = Number(assignment.max_points || 0)

    const bucket = student.periods[period][category]
    bucket.earned += earned
    bucket.possible += possible
  }

  if (unpinnedCount > 0) {
    logger.warn('Registrar workbook: unpinned assignments excluded from period totals', {
      courseId,
      unpinnedCount,
    })
  }

  // Sort students by Last, First and assign sequential numbers
  const students = Array.from(studentMap.values())
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .map((s, i) => ({ ...s, no: i + 1 }))

  // ---- Build the workbook ----
  const meta: CourseMeta = {
    title: (course as any).title || '',
    description: (course as any).description || (course as any).title || '',
    schedule: (course as any).schedule || '',
    instructor: instructorName,
    block: '',
    semester: '',
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Mabini LMS'
  workbook.created = new Date()

  for (const period of ALL_PERIODS) {
    buildPeriodSheet(workbook, period, meta, students)
  }
  buildOverallSheet(workbook, meta, students)

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  const buffer = Buffer.from(arrayBuffer as ArrayBuffer)

  const safeTitle = (meta.title || 'course').replace(/[^A-Za-z0-9-_]+/g, '_').slice(0, 32) || 'course'
  const filenameBase = scopeStudentId ? 'my-grade' : 'registrar-grades'
  const filename = `${filenameBase}-${safeTitle}-${courseId.slice(0, 8)}.xlsx`

  return { buffer, filename }
}

// ============================================
// Per-period sheet (Pre-Mid / Midterm / Pre-Final / Final)
// ============================================

const HEADER_ROWS = {
  schoolName: 2,
  schoolCity: 3,
  schoolDept: 4,
  courseLabel: 7,
  subjectLabel: 8,
  scheduleLabel: 9,
  instructorLabel: 10,
  periodBanner: 11,
  headerStart: 12, // rows 12-14
  maxRow: 14,
  firstStudentRow: 15,
}

const HEADER_FILL = 'FFFFFF99' // light yellow tint to match the workbook header band

function applyBox(cell: ExcelJS.Cell, style: 'thin' | 'medium' = 'thin') {
  cell.border = {
    top: { style },
    left: { style },
    bottom: { style },
    right: { style },
  }
}

function buildPeriodSheet(
  workbook: ExcelJS.Workbook,
  period: MabiniGradingPeriod,
  meta: CourseMeta,
  students: StudentRow[]
): void {
  const ws = workbook.addWorksheet(PERIOD_SHEET_NAME[period], {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
  })

  // Column widths matching the reference file
  ws.getColumn('A').width = 4
  ws.getColumn('B').width = 31
  ws.getColumn('C').width = 7
  ws.getColumn('D').width = 8
  ws.getColumn('E').width = 8
  ws.getColumn('F').width = 7
  ws.getColumn('G').width = 8
  ws.getColumn('H').width = 8
  ws.getColumn('I').width = 7
  ws.getColumn('J').width = 8
  ws.getColumn('K').width = 7
  ws.getColumn('L').width = 8
  ws.getColumn('M').width = 7
  ws.getColumn('N').width = 8
  ws.getColumn('O').width = 11
  ws.getColumn('P').width = 9
  ws.getColumn('Q').width = 8
  ws.getColumn('T').hidden = true
  ws.getColumn('U').hidden = true

  writeHeaderBlock(ws, meta, PERIOD_BANNER[period])
  writeColumnHeader(ws)
  writeMaxRow(ws)
  writeStudentRows(ws, students, period)
  writeLookupTable(ws)
}

function writeHeaderBlock(ws: ExcelJS.Worksheet, meta: CourseMeta, banner: string): void {
  ws.mergeCells(`A${HEADER_ROWS.schoolName}:Q${HEADER_ROWS.schoolName}`)
  ws.getCell(`A${HEADER_ROWS.schoolName}`).value = 'MABINI COLLEGES'
  ws.getCell(`A${HEADER_ROWS.schoolName}`).font = { name: 'Arial Narrow', size: 16, bold: true }
  ws.getCell(`A${HEADER_ROWS.schoolName}`).alignment = { horizontal: 'center' }

  ws.mergeCells(`A${HEADER_ROWS.schoolCity}:Q${HEADER_ROWS.schoolCity}`)
  ws.getCell(`A${HEADER_ROWS.schoolCity}`).value = 'Daet, Camarines Norte'
  ws.getCell(`A${HEADER_ROWS.schoolCity}`).font = { name: 'Arial Narrow', size: 11 }
  ws.getCell(`A${HEADER_ROWS.schoolCity}`).alignment = { horizontal: 'center' }

  ws.mergeCells(`A${HEADER_ROWS.schoolDept}:Q${HEADER_ROWS.schoolDept}`)
  ws.getCell(`A${HEADER_ROWS.schoolDept}`).value = 'College of Education'
  ws.getCell(`A${HEADER_ROWS.schoolDept}`).font = { name: 'Arial Narrow', size: 11, italic: true }
  ws.getCell(`A${HEADER_ROWS.schoolDept}`).alignment = { horizontal: 'center' }

  const labelRows = [
    { row: HEADER_ROWS.courseLabel, label: 'Course and Block:', value: meta.block || meta.description },
    { row: HEADER_ROWS.subjectLabel, label: 'Subject Code and Description:', value: meta.description },
    { row: HEADER_ROWS.scheduleLabel, label: 'Class Schedule:', value: meta.schedule },
    { row: HEADER_ROWS.instructorLabel, label: 'Instructor:', value: meta.instructor },
  ]
  for (const { row, label, value } of labelRows) {
    ws.mergeCells(`A${row}:B${row}`)
    ws.getCell(`A${row}`).value = label
    ws.getCell(`A${row}`).font = { name: 'Arial Narrow', size: 11, bold: true }
    ws.mergeCells(`C${row}:Q${row}`)
    ws.getCell(`C${row}`).value = value
    ws.getCell(`C${row}`).font = { name: 'Arial Narrow', size: 11 }
  }

  ws.mergeCells(`A${HEADER_ROWS.periodBanner}:Q${HEADER_ROWS.periodBanner}`)
  ws.getCell(`A${HEADER_ROWS.periodBanner}`).value = banner
  ws.getCell(`A${HEADER_ROWS.periodBanner}`).font = { name: 'Arial Narrow', size: 14, bold: true }
  ws.getCell(`A${HEADER_ROWS.periodBanner}`).alignment = { horizontal: 'center' }
  ws.getCell(`A${HEADER_ROWS.periodBanner}`).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HEADER_FILL },
  }
}

function writeColumnHeader(ws: ExcelJS.Worksheet): void {
  // Three-row group headers (rows 12-14)
  ws.mergeCells('A12:A14')
  ws.getCell('A12').value = 'No.'

  ws.mergeCells('B12:B14')
  ws.getCell('B12').value = 'NAME\n(Surname, First Name, M.I.)'
  ws.getCell('B12').alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' }

  ws.mergeCells('C12:E13')
  ws.getCell('C12').value = 'MAJOR EXAMS (45%)'

  ws.mergeCells('F12:L12')
  ws.getCell('F12').value = 'CLASS PARTICIPATION (50%)'

  ws.mergeCells('F13:H13')
  ws.getCell('F13').value = 'Quizzes'
  ws.mergeCells('I13:J13')
  ws.getCell('I13').value = 'Recitation'
  ws.mergeCells('K13:L13')
  ws.getCell('K13').value = 'Attendance'

  ws.mergeCells('M12:N13')
  ws.getCell('M12').value = 'PROJECT (5%)'

  ws.mergeCells('O12:O14')
  ws.getCell('O12').value = 'WEIGHTED GRADE'
  ws.mergeCells('P12:P14')
  ws.getCell('P12').value = 'FINAL GRADE'
  ws.mergeCells('Q12:Q14')
  ws.getCell('Q12').value = 'REMARKS'

  // Apply header styling to the entire 12-14 banner range A:Q
  for (let r = 12; r <= 14; r++) {
    for (let c = 1; c <= 17; c++) {
      const cell = ws.getCell(r, c)
      cell.font = { name: 'Arial Narrow', size: 10, bold: r !== 14 }
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: HEADER_FILL },
      }
      applyBox(cell, 'thin')
    }
  }
  ws.getRow(12).height = 18
  ws.getRow(13).height = 14
  ws.getRow(14).height = 14
}

function writeMaxRow(ws: ExcelJS.Worksheet): void {
  // Row 14 — maxes (100) and weights. Formulas reference these so a teacher
  // editing raw scores recalculates everything live.
  ws.getCell('C14').value = 100
  ws.getCell('D14').value = 'Rating'
  ws.getCell('E14').value = 0.45
  ws.getCell('E14').numFmt = '0%'

  ws.getCell('F14').value = 100
  ws.getCell('G14').value = 'Rating'
  ws.getCell('H14').value = 0.15
  ws.getCell('H14').numFmt = '0%'

  ws.getCell('I14').value = 100
  ws.getCell('J14').value = 0.15
  ws.getCell('J14').numFmt = '0%'

  ws.getCell('K14').value = 100
  ws.getCell('L14').value = 0.20
  ws.getCell('L14').numFmt = '0%'

  ws.getCell('M14').value = 100
  ws.getCell('N14').value = 0.05
  ws.getCell('N14').numFmt = '0%'
}

function pickRaw(bucket: { earned: number; possible: number }): number | null {
  if (bucket.possible <= 0) return null
  // Convert to a 0-100 scale (this is how the workbook expects raw values).
  return Math.round((bucket.earned / bucket.possible) * 10000) / 100
}

function writeStudentRows(
  ws: ExcelJS.Worksheet,
  students: StudentRow[],
  period: MabiniGradingPeriod
): void {
  const lookupRange = '$T$13:$U$22' // 10-row lookup table written by writeLookupTable

  students.forEach((student, idx) => {
    const r = HEADER_ROWS.firstStudentRow + idx
    const agg = student.periods[period]

    ws.getCell(`A${r}`).value = student.no
    ws.getCell(`B${r}`).value = student.fullName

    // Component raw values (0-100 scale)
    const examRaw = pickRaw(agg.exam)
    const quizRaw = pickRaw(agg.quiz)
    const recitRaw = pickRaw(agg.recitation.possible > 0 ? agg.recitation : agg.activity)
    const attendRaw = pickRaw(agg.attendance)
    const projectRaw = pickRaw(agg.project)

    ws.getCell(`C${r}`).value = examRaw
    ws.getCell(`D${r}`).value = { formula: `IF(C${r}="","",C${r}/$C$14*40+60)` }
    ws.getCell(`E${r}`).value = { formula: `IF(ISNUMBER(D${r}),D${r}*$E$14,"")` }

    ws.getCell(`F${r}`).value = quizRaw
    ws.getCell(`G${r}`).value = { formula: `IF(F${r}="","",F${r}/$F$14*40+60)` }
    ws.getCell(`H${r}`).value = { formula: `IF(ISNUMBER(G${r}),G${r}*$H$14,"")` }

    ws.getCell(`I${r}`).value = recitRaw
    ws.getCell(`J${r}`).value = { formula: `IF(ISNUMBER(I${r}),I${r}*$J$14,"")` }

    ws.getCell(`K${r}`).value = attendRaw
    ws.getCell(`L${r}`).value = { formula: `IF(ISNUMBER(K${r}),K${r}*$L$14,"")` }

    ws.getCell(`M${r}`).value = projectRaw
    ws.getCell(`N${r}`).value = { formula: `IF(ISNUMBER(M${r}),M${r}*$N$14,"")` }

    ws.getCell(`O${r}`).value = {
      formula: `IFERROR(IF(SUM(E${r},H${r},J${r},L${r},N${r})=0,"",SUM(E${r},H${r},J${r},L${r},N${r})),"")`,
    }
    ws.getCell(`O${r}`).numFmt = '0.00'

    ws.getCell(`P${r}`).value = {
      formula: `IF(ISNUMBER(O${r}),VLOOKUP(O${r},${lookupRange},2,TRUE),"INC")`,
    }
    ws.getCell(`P${r}`).numFmt = '0.00'

    ws.getCell(`Q${r}`).value = {
      formula: `IF(NOT(ISNUMBER(P${r})),"INC",IF(P${r}<=3,"Passed","Failed"))`,
    }

    // Apply box border + alignment to the row's data area
    for (let c = 1; c <= 17; c++) {
      const cell = ws.getCell(r, c)
      cell.font = { name: 'Arial Narrow', size: 10 }
      cell.alignment = { horizontal: c === 2 ? 'left' : 'center', vertical: 'middle' }
      applyBox(cell, 'thin')
    }
    // Data cells that are numeric → 2-decimal display
    for (const col of ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N']) {
      const cell = ws.getCell(`${col}${r}`)
      if (cell.numFmt === undefined || cell.numFmt === 'General') {
        cell.numFmt = '0.00'
      }
    }
    ws.getCell(`P${r}`).font = { name: 'Arial Narrow', size: 10, bold: true }
  })
}

const LOOKUP_TABLE: ReadonlyArray<readonly [number, number]> = [
  [0, 5.0],
  [74.5, 3.0],
  [76.5, 2.75],
  [79.5, 2.5],
  [82.5, 2.25],
  [85.5, 2.0],
  [88.5, 1.75],
  [91.5, 1.5],
  [94.5, 1.25],
  [97.5, 1.0],
]

function writeLookupTable(ws: ExcelJS.Worksheet): void {
  // Sorted-ascending lookup table for VLOOKUP TRUE — placed off-screen at T:U
  ws.getCell('T12').value = 'Pct'
  ws.getCell('U12').value = 'GP'
  LOOKUP_TABLE.forEach(([pct, gp], i) => {
    ws.getCell(`T${13 + i}`).value = pct
    ws.getCell(`U${13 + i}`).value = gp
    ws.getCell(`T${13 + i}`).numFmt = '0.00'
    ws.getCell(`U${13 + i}`).numFmt = '0.00'
  })
}

// ============================================
// OVERALL RATING sheet
// ============================================

function buildOverallSheet(
  workbook: ExcelJS.Workbook,
  meta: CourseMeta,
  students: StudentRow[]
): void {
  const ws = workbook.addWorksheet('OVERALL RATING')

  ws.getColumn('A').width = 5
  ws.getColumn('B').width = 35
  for (const c of ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) ws.getColumn(c).width = 8
  ws.getColumn('K').width = 11
  ws.getColumn('L').width = 9
  ws.getColumn('M').width = 9
  ws.getColumn('P').hidden = true
  ws.getColumn('Q').hidden = true

  // School header (rows 2-4)
  ws.mergeCells('A2:M2')
  ws.getCell('A2').value = 'MABINI COLLEGES'
  ws.getCell('A2').font = { name: 'Arial Narrow', size: 16, bold: true }
  ws.getCell('A2').alignment = { horizontal: 'center' }

  ws.mergeCells('A3:M3')
  ws.getCell('A3').value = 'Daet, Camarines Norte'
  ws.getCell('A3').alignment = { horizontal: 'center' }

  ws.mergeCells('A4:M4')
  ws.getCell('A4').value = 'College of Education'
  ws.getCell('A4').font = { italic: true }
  ws.getCell('A4').alignment = { horizontal: 'center' }

  // Course metadata
  const labelRows = [
    { row: 7, label: 'Course and Block:', value: meta.block || meta.description },
    { row: 8, label: 'Subject Code and Description:', value: meta.description },
    { row: 9, label: 'Class Schedule:', value: meta.schedule },
    { row: 10, label: 'Instructor:', value: meta.instructor },
  ]
  for (const { row, label, value } of labelRows) {
    ws.mergeCells(`A${row}:B${row}`)
    ws.getCell(`A${row}`).value = label
    ws.getCell(`A${row}`).font = { bold: true }
    ws.mergeCells(`C${row}:M${row}`)
    ws.getCell(`C${row}`).value = value
  }

  ws.mergeCells('A11:M11')
  ws.getCell('A11').value = meta.semester || '1ST SEMESTER'
  ws.getCell('A11').font = { bold: true }
  ws.getCell('A11').alignment = { horizontal: 'center' }
  ws.getCell('A11').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HEADER_FILL },
  }

  // Two-row column header (rows 12-13)
  ws.mergeCells('A12:A13')
  ws.getCell('A12').value = 'No.'

  ws.mergeCells('B12:B13')
  ws.getCell('B12').value = 'NAME\n(Surname, First Name, M.I.)'
  ws.getCell('B12').alignment = { wrapText: true, horizontal: 'center', vertical: 'middle' }

  ws.mergeCells('C12:D12')
  ws.getCell('C12').value = 'PRE-MID'
  ws.mergeCells('E12:F12')
  ws.getCell('E12').value = 'MIDTERM'
  ws.mergeCells('G12:H12')
  ws.getCell('G12').value = 'PRE-FINAL'
  ws.mergeCells('I12:J12')
  ws.getCell('I12').value = 'FINALS'

  ws.mergeCells('K12:K13')
  ws.getCell('K12').value = 'WEIGHTED GRADE'
  ws.mergeCells('L12:L13')
  ws.getCell('L12').value = 'FINAL GRADE'
  ws.mergeCells('M12:M13')
  ws.getCell('M12').value = 'REMARKS'

  // Sub-headers row 13: Rating | 0.25 for each period column pair
  ws.getCell('C13').value = 'Rating'
  ws.getCell('D13').value = 0.25
  ws.getCell('D13').numFmt = '0%'
  ws.getCell('E13').value = 'Rating'
  ws.getCell('F13').value = 0.25
  ws.getCell('F13').numFmt = '0%'
  ws.getCell('G13').value = 'Rating'
  ws.getCell('H13').value = 0.25
  ws.getCell('H13').numFmt = '0%'
  ws.getCell('I13').value = 'Rating'
  ws.getCell('J13').value = 0.25
  ws.getCell('J13').numFmt = '0%'

  for (let r = 12; r <= 13; r++) {
    for (let c = 1; c <= 13; c++) {
      const cell = ws.getCell(r, c)
      cell.font = { name: 'Arial Narrow', size: 10, bold: r === 12 }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: HEADER_FILL },
      }
      applyBox(cell, 'thin')
    }
  }

  // Student rows starting at row 14 (matches reference)
  const overallLookup = '$P$13:$Q$22'
  students.forEach((student, idx) => {
    const r = 14 + idx
    const periodSheets = ALL_PERIODS.map((p) => `'${PERIOD_SHEET_NAME[p]}'`)

    ws.getCell(`A${r}`).value = student.no
    ws.getCell(`B${r}`).value = student.fullName

    // Pull each period's column O for this student (same row offset on the per-period sheet).
    // On per-period sheets, students start at row 15 — we map idx 0 → row 15.
    const sourceRow = HEADER_ROWS.firstStudentRow + idx

    ws.getCell(`C${r}`).value = { formula: `${periodSheets[0]}!O${sourceRow}` }
    ws.getCell(`D${r}`).value = { formula: `IF(ISNUMBER(C${r}),C${r}*$D$13,"")` }
    ws.getCell(`E${r}`).value = { formula: `${periodSheets[1]}!O${sourceRow}` }
    ws.getCell(`F${r}`).value = { formula: `IF(ISNUMBER(E${r}),E${r}*$F$13,"")` }
    ws.getCell(`G${r}`).value = { formula: `${periodSheets[2]}!O${sourceRow}` }
    ws.getCell(`H${r}`).value = { formula: `IF(ISNUMBER(G${r}),G${r}*$H$13,"")` }
    ws.getCell(`I${r}`).value = { formula: `${periodSheets[3]}!O${sourceRow}` }
    ws.getCell(`J${r}`).value = { formula: `IF(ISNUMBER(I${r}),I${r}*$J$13,"")` }

    // Weighted (K) — only valid when all four periods have grades; otherwise INC
    ws.getCell(`K${r}`).value = {
      formula: `IF(AND(ISNUMBER(D${r}),ISNUMBER(F${r}),ISNUMBER(H${r}),ISNUMBER(J${r})),D${r}+F${r}+H${r}+J${r},"INC")`,
    }
    ws.getCell(`K${r}`).numFmt = '0.00'

    ws.getCell(`L${r}`).value = {
      formula: `IF(ISNUMBER(K${r}),VLOOKUP(K${r},${overallLookup},2,TRUE),"INC")`,
    }
    ws.getCell(`L${r}`).numFmt = '0.00'

    ws.getCell(`M${r}`).value = {
      formula: `IF(NOT(ISNUMBER(L${r})),"INC",IF(L${r}<=3,"Passed","Failed"))`,
    }

    for (let c = 1; c <= 13; c++) {
      const cell = ws.getCell(r, c)
      cell.font = { name: 'Arial Narrow', size: 10, bold: c === 12 }
      cell.alignment = { horizontal: c === 2 ? 'left' : 'center', vertical: 'middle' }
      applyBox(cell, 'thin')
    }
    for (const col of ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']) {
      ws.getCell(`${col}${r}`).numFmt = '0.00'
    }
  })

  // Lookup table for the OVERALL sheet
  ws.getCell('P12').value = 'Pct'
  ws.getCell('Q12').value = 'GP'
  LOOKUP_TABLE.forEach(([pct, gp], i) => {
    ws.getCell(`P${13 + i}`).value = pct
    ws.getCell(`Q${13 + i}`).value = gp
    ws.getCell(`P${13 + i}`).numFmt = '0.00'
    ws.getCell(`Q${13 + i}`).numFmt = '0.00'
  })
}
