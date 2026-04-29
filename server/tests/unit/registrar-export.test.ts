/**
 * Registrar workbook layout test.
 *
 * Asserts that the generated `.xlsx` matches the structure of TTH 1-2_30PM.xlsx:
 *   • 5 sheets in the right order
 *   • School/course header rows in the right cells
 *   • Three-row column header with the correct merges and labels
 *   • Row 14 maxes (100) and weights (0.45, 0.15, 0.15, 0.20, 0.05)
 *   • Per-row formulas point at the right cells (rating, weighted, sum, VLOOKUP)
 *   • OVERALL RATING sheet pulls from each period sheet's column O.
 */

import ExcelJS from 'exceljs'
import { vi } from 'vitest'

const fakeAdminUserId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const courseId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const studentAId = 'sssssss1-1111-1111-1111-111111111111'
const studentBId = 'sssssss2-2222-2222-2222-222222222222'

// ---- Test data ----
const fakeCourse = {
  id: courseId,
  title: 'PROF ED 3 - The Teaching Profession',
  description: 'PROF ED 3',
  teacher_id: 'tttttttt-tttt-tttt-tttt-tttttttttttt',
  schedule: 'TTH 1-2:30PM',
  room: 'Room 201',
}
const fakeTeacher = { first_name: 'Venancio', last_name: 'Diano' }

const enrollmentRows = [
  {
    student_id: studentAId,
    profile: { id: studentAId, first_name: 'Nicole Kate', last_name: 'Abarca', email: 'a@m.edu' },
  },
  {
    student_id: studentBId,
    profile: { id: studentBId, first_name: 'Lovely Mae', last_name: 'Campo', email: 'b@m.edu' },
  },
]

// Pre-Mid period only — covers all 5 component types for student A,
// and a partial period for student B (only exam + quiz).
const gradeRows = [
  // Student A: exam=81, quiz=85, recit=90, attend=100, project=80 (matches workbook row 15)
  {
    points_earned: 81,
    submission: {
      student_id: studentAId,
      assignment: {
        id: 'a1', max_points: 100, course_id: courseId,
        assignment_type: 'exam', grading_period: 'pre_mid',
      },
    },
  },
  {
    points_earned: 85,
    submission: {
      student_id: studentAId,
      assignment: {
        id: 'a2', max_points: 100, course_id: courseId,
        assignment_type: 'quiz', grading_period: 'pre_mid',
      },
    },
  },
  {
    points_earned: 90,
    submission: {
      student_id: studentAId,
      assignment: {
        id: 'a3', max_points: 100, course_id: courseId,
        assignment_type: 'recitation', grading_period: 'pre_mid',
      },
    },
  },
  {
    points_earned: 100,
    submission: {
      student_id: studentAId,
      assignment: {
        id: 'a4', max_points: 100, course_id: courseId,
        assignment_type: 'attendance', grading_period: 'pre_mid',
      },
    },
  },
  {
    points_earned: 80,
    submission: {
      student_id: studentAId,
      assignment: {
        id: 'a5', max_points: 100, course_id: courseId,
        assignment_type: 'project', grading_period: 'pre_mid',
      },
    },
  },
  // Student B: only exam graded so far
  {
    points_earned: 86,
    submission: {
      student_id: studentBId,
      assignment: {
        id: 'b1', max_points: 100, course_id: courseId,
        assignment_type: 'exam', grading_period: 'pre_mid',
      },
    },
  },
]

// ---- Mocks ----

vi.mock('../../src/lib/supabase.js', () => {
  const fakeQuery = (rows: any) => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      limit: () => Promise.resolve({ data: rows, error: null }),
      then: (resolve: any) => Promise.resolve({ data: rows, error: null }).then(resolve),
    }
    return builder
  }

  return {
    supabaseAdmin: {
      from: (table: string) => {
        if (table === 'courses') return fakeQuery([fakeCourse])
        if (table === 'profiles') return fakeQuery([fakeTeacher])
        if (table === 'enrollments') return fakeQuery(enrollmentRows)
        if (table === 'grades') return fakeQuery(gradeRows)
        if (table === 'assignments') return fakeQuery([{ id: 'probe', grading_period: 'pre_mid' }])
        return fakeQuery([])
      },
    },
  }
})

vi.mock('../../src/utils/assignmentType.js', () => ({
  normalizeAssignmentType: (t: any) => t,
  supportsAssignmentTypeColumn: async () => true,
}))

// ---- Test ----

import { buildRegistrarWorkbook } from '../../src/services/registrar-export.js'
import { UserRole } from '../../src/types/index.js'

describe('Registrar workbook (TTH 1-2_30PM.xlsx layout)', () => {
  let wb: ExcelJS.Workbook

  beforeAll(async () => {
    const { buffer } = await buildRegistrarWorkbook(courseId, fakeAdminUserId, UserRole.ADMIN)
    wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as any)
  })

  it('contains 5 sheets in the canonical order', () => {
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Pre-Mid (25%)',
      'Midterm (25%)',
      'Pre-Final (25%)',
      'Final (25%)',
      'OVERALL RATING',
    ])
  })

  describe('Pre-Mid (25%) sheet', () => {
    let ws: ExcelJS.Worksheet
    beforeAll(() => { ws = wb.getWorksheet('Pre-Mid (25%)')! })

    it('reproduces the school header block', () => {
      expect(ws.getCell('A2').value).toBe('MABINI COLLEGES')
      expect(ws.getCell('A3').value).toBe('Daet, Camarines Norte')
      expect(ws.getCell('A4').value).toBe('College of Education')
    })

    it('shows the course metadata in the right rows', () => {
      expect(ws.getCell('A7').value).toBe('Course and Block:')
      expect(ws.getCell('A8').value).toBe('Subject Code and Description:')
      expect(ws.getCell('A9').value).toBe('Class Schedule:')
      expect(ws.getCell('A10').value).toBe('Instructor:')
      expect(ws.getCell('C9').value).toBe('TTH 1-2:30PM')
      expect(ws.getCell('C10').value).toBe('Venancio Diano')
    })

    it('uses the canonical column header labels', () => {
      expect(ws.getCell('A12').value).toBe('No.')
      expect(ws.getCell('C12').value).toBe('MAJOR EXAMS (45%)')
      expect(ws.getCell('F12').value).toBe('CLASS PARTICIPATION (50%)')
      expect(ws.getCell('M12').value).toBe('PROJECT (5%)')
      expect(ws.getCell('O12').value).toBe('WEIGHTED GRADE')
      expect(ws.getCell('P12').value).toBe('FINAL GRADE')
      expect(ws.getCell('Q12').value).toBe('REMARKS')
      expect(ws.getCell('F13').value).toBe('Quizzes')
      expect(ws.getCell('I13').value).toBe('Recitation')
      expect(ws.getCell('K13').value).toBe('Attendance')
    })

    it('writes row 14 with maxes (100) and the canonical weights', () => {
      expect(ws.getCell('C14').value).toBe(100)
      expect(ws.getCell('E14').value).toBe(0.45)
      expect(ws.getCell('H14').value).toBe(0.15)
      expect(ws.getCell('J14').value).toBe(0.15)
      expect(ws.getCell('L14').value).toBe(0.20)
      expect(ws.getCell('N14').value).toBe(0.05)
    })

    it('writes student A in row 15 with the workbook-row-15 raw scores', () => {
      expect(ws.getCell('A15').value).toBe(1)
      expect(ws.getCell('B15').value).toBe('Abarca, Nicole Kate')
      expect(ws.getCell('C15').value).toBe(81)
      expect(ws.getCell('F15').value).toBe(85)
      expect(ws.getCell('I15').value).toBe(90)
      expect(ws.getCell('K15').value).toBe(100)
      expect(ws.getCell('M15').value).toBe(80)
    })

    it('uses live formulas so a teacher edit re-calculates downstream cells', () => {
      // Rating formulas
      const d15 = ws.getCell('D15').value as { formula?: string }
      const g15 = ws.getCell('G15').value as { formula?: string }
      expect(d15.formula).toContain('C15/$C$14*40+60')
      expect(g15.formula).toContain('F15/$F$14*40+60')

      // Weighted = source * weight constant on row 14
      const e15 = ws.getCell('E15').value as { formula?: string }
      const j15 = ws.getCell('J15').value as { formula?: string }
      expect(e15.formula).toContain('D15*$E$14')
      expect(j15.formula).toContain('I15*$J$14')

      // Period weighted grade is the sum of the five weighted contributions
      const o15 = ws.getCell('O15').value as { formula?: string }
      expect(o15.formula).toContain('SUM(E15,H15,J15,L15,N15)')

      // Final grade VLOOKUPs into the lookup table at T:U
      const p15 = ws.getCell('P15').value as { formula?: string }
      expect(p15.formula).toContain('VLOOKUP(O15,$T$13:$U$22,2,TRUE)')

      // Remarks: ≤3.00 Passed, else Failed, missing → INC
      const q15 = ws.getCell('Q15').value as { formula?: string }
      expect(q15.formula).toContain('Passed')
      expect(q15.formula).toContain('Failed')
      expect(q15.formula).toContain('INC')
    })

    it('writes the lookup table sorted ascending so VLOOKUP TRUE works', () => {
      // We seed at T13/U13 = (0, 5) and finish at T22/U22 = (97.5, 1.0)
      expect(ws.getCell('T13').value).toBe(0)
      expect(ws.getCell('U13').value).toBe(5.0)
      expect(ws.getCell('T22').value).toBe(97.5)
      expect(ws.getCell('U22').value).toBe(1.0)

      // Spot-check the boundaries that matter most
      expect(ws.getCell('T14').value).toBe(74.5)   // → 3.00 (passing line)
      expect(ws.getCell('U14').value).toBe(3.0)
      expect(ws.getCell('T20').value).toBe(91.5)  // → 1.50
      expect(ws.getCell('U20').value).toBe(1.5)
    })
  })

  describe('OVERALL RATING sheet', () => {
    let ws: ExcelJS.Worksheet
    beforeAll(() => { ws = wb.getWorksheet('OVERALL RATING')! })

    it('reuses the same school header block', () => {
      expect(ws.getCell('A2').value).toBe('MABINI COLLEGES')
      expect(ws.getCell('A3').value).toBe('Daet, Camarines Norte')
      expect(ws.getCell('A4').value).toBe('College of Education')
    })

    it('uses the four-period column header', () => {
      expect(ws.getCell('C12').value).toBe('PRE-MID')
      expect(ws.getCell('E12').value).toBe('MIDTERM')
      expect(ws.getCell('G12').value).toBe('PRE-FINAL')
      expect(ws.getCell('I12').value).toBe('FINALS')
      expect(ws.getCell('K12').value).toBe('WEIGHTED GRADE')
      expect(ws.getCell('L12').value).toBe('FINAL GRADE')
      expect(ws.getCell('M12').value).toBe('REMARKS')
    })

    it('writes 0.25 weight constants in row 13 for each period', () => {
      expect(ws.getCell('D13').value).toBe(0.25)
      expect(ws.getCell('F13').value).toBe(0.25)
      expect(ws.getCell('H13').value).toBe(0.25)
      expect(ws.getCell('J13').value).toBe(0.25)
    })

    it('pulls each period rating from the corresponding period sheet column O', () => {
      const c14 = ws.getCell('C14').value as { formula?: string }
      const e14 = ws.getCell('E14').value as { formula?: string }
      const g14 = ws.getCell('G14').value as { formula?: string }
      const i14 = ws.getCell('I14').value as { formula?: string }

      expect(c14.formula).toContain("'Pre-Mid (25%)'!O15")
      expect(e14.formula).toContain("'Midterm (25%)'!O15")
      expect(g14.formula).toContain("'Pre-Final (25%)'!O15")
      expect(i14.formula).toContain("'Final (25%)'!O15")
    })

    it('marks weighted grade INC unless all four periods have ratings', () => {
      const k14 = ws.getCell('K14').value as { formula?: string }
      expect(k14.formula).toContain('AND(ISNUMBER(D14),ISNUMBER(F14),ISNUMBER(H14),ISNUMBER(J14))')
      expect(k14.formula).toContain('"INC"')
    })
  })
})
