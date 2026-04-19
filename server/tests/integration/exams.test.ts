import {
  createExamQuestionSchema,
  updateExamQuestionSchema,
} from '../../src/types/exams.js'

describe('Exam Schemas', () => {
  describe('createExamQuestionSchema', () => {
    it('accepts multiple choice questions', () => {
      const result = createExamQuestionSchema.safeParse({
        prompt: 'What is 2 + 2?',
        item_type: 'multiple_choice',
        choices: ['3', '4', '5'],
        correct_choice_index: 1,
        points: 1,
      })

      expect(result.success).toBe(true)
    })

    it('accepts short answer questions with answer payload', () => {
      const result = createExamQuestionSchema.safeParse({
        prompt: 'State Newton\'s second law',
        item_type: 'short_answer',
        answer_payload: {
          accepted_answers: ['force equals mass times acceleration', 'f=ma'],
          case_sensitive: false,
        },
        points: 5,
        chapter_tag: 'Physics Chapter 2',
      })

      expect(result.success).toBe(true)
    })

    it('rejects short answer without accepted answers', () => {
      const result = createExamQuestionSchema.safeParse({
        prompt: 'Name the process',
        item_type: 'short_answer',
        points: 2,
      })

      expect(result.success).toBe(false)
    })
  })

  describe('updateExamQuestionSchema', () => {
    it('accepts partial updates for item type metadata', () => {
      const result = updateExamQuestionSchema.safeParse({
        item_type: 'short_answer',
        answer_payload: {
          accepted_answers: ['photosynthesis'],
        },
        chapter_tag: 'Biology 1',
      })

      expect(result.success).toBe(true)
    })
  })
})
