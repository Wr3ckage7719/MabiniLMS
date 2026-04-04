import { describe, it, expect } from 'vitest'
import * as search from '../../src/services/search.js'

describe('Search Utilities', () => {
  describe('sanitizeSearchQuery', () => {
    it('should trim whitespace', () => {
      expect(search.sanitizeSearchQuery('  test  ')).toBe('test')
    })

    it('should escape SQL wildcards', () => {
      expect(search.sanitizeSearchQuery('test%value')).toBe('test\\%value')
      expect(search.sanitizeSearchQuery('test_value')).toBe('test\\_value')
    })
  })

  describe('buildSearchPattern', () => {
    it('should build exact pattern', () => {
      expect(search.buildSearchPattern('test', 'exact')).toBe('test')
    })

    it('should build prefix pattern', () => {
      expect(search.buildSearchPattern('test', 'prefix')).toBe('test%')
    })

    it('should build contains pattern', () => {
      expect(search.buildSearchPattern('test', 'contains')).toBe('%test%')
    })

    it('should default to contains pattern', () => {
      expect(search.buildSearchPattern('test')).toBe('%test%')
    })
  })

  describe('buildTextSearchQuery', () => {
    it('should convert spaces to AND operator', () => {
      expect(search.buildTextSearchQuery('database design')).toBe('database & design')
    })

    it('should handle multiple spaces', () => {
      expect(search.buildTextSearchQuery('test   value   search')).toBe('test & value & search')
    })

    it('should trim whitespace', () => {
      expect(search.buildTextSearchQuery('  test  ')).toBe('test')
    })

    it('should handle single word', () => {
      expect(search.buildTextSearchQuery('test')).toBe('test')
    })
  })

  describe('levenshteinDistance', () => {
    it('should calculate distance for identical strings', () => {
      expect(search.levenshteinDistance('test', 'test')).toBe(0)
    })

    it('should calculate distance for completely different strings', () => {
      expect(search.levenshteinDistance('abc', 'xyz')).toBe(3)
    })

    it('should calculate distance for one insertion', () => {
      expect(search.levenshteinDistance('test', 'tests')).toBe(1)
    })

    it('should calculate distance for one deletion', () => {
      expect(search.levenshteinDistance('tests', 'test')).toBe(1)
    })

    it('should calculate distance for one substitution', () => {
      expect(search.levenshteinDistance('test', 'best')).toBe(1)
    })

    it('should handle empty strings', () => {
      expect(search.levenshteinDistance('', 'test')).toBe(4)
      expect(search.levenshteinDistance('test', '')).toBe(4)
    })
  })

  describe('calculateSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(search.calculateSimilarity('test', 'test')).toBe(1)
    })

    it('should return 0 for completely different strings', () => {
      expect(search.calculateSimilarity('abc', 'xyz')).toBe(0)
    })

    it('should calculate similarity for similar strings', () => {
      const similarity = search.calculateSimilarity('database', 'datbase')
      expect(similarity).toBeGreaterThan(0.8)
    })

    it('should be case insensitive', () => {
      const sim1 = search.calculateSimilarity('Test', 'test')
      const sim2 = search.calculateSimilarity('TEST', 'test')
      expect(sim1).toBe(1)
      expect(sim2).toBe(1)
    })
  })

  describe('findFuzzyMatches', () => {
    const items = [
      { name: 'database' },
      { name: 'datbase' },
      { name: 'data' },
      { name: 'completely different' },
    ]

    it('should find fuzzy matches above threshold', () => {
      const matches = search.findFuzzyMatches(
        items,
        'database',
        (item) => item.name,
        0.7
      )

      expect(matches.length).toBeGreaterThan(0)
      expect(matches[0].name).toBe('database')
      expect(matches[0].score).toBe(1)
    })

    it('should filter out low similarity matches', () => {
      const matches = search.findFuzzyMatches(
        items,
        'database',
        (item) => item.name,
        0.9
      )

      const hasLowScore = matches.some((m) => m.score < 0.9)
      expect(hasLowScore).toBe(false)
    })

    it('should sort by score descending', () => {
      const matches = search.findFuzzyMatches(
        items,
        'database',
        (item) => item.name,
        0.3
      )

      for (let i = 1; i < matches.length; i++) {
        expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score)
      }
    })
  })

  describe('highlightSearchTerms', () => {
    it('should highlight search terms', () => {
      const result = search.highlightSearchTerms(
        'This is a test string',
        'test'
      )

      expect(result).toContain('<mark>test</mark>')
    })

    it('should be case insensitive by default', () => {
      const result = search.highlightSearchTerms(
        'This is a TEST string',
        'test'
      )

      expect(result).toContain('<mark>TEST</mark>')
    })

    it('should handle multiple occurrences', () => {
      const result = search.highlightSearchTerms(
        'test test test',
        'test'
      )

      const matches = result.match(/<mark>test<\/mark>/gi)
      expect(matches).toHaveLength(3)
    })

    it('should use custom highlight tags', () => {
      const result = search.highlightSearchTerms(
        'This is a test',
        'test',
        '<b>',
        '</b>'
      )

      expect(result).toContain('<b>test</b>')
    })

    it('should handle empty search term', () => {
      const text = 'This is a test'
      const result = search.highlightSearchTerms(text, '')

      expect(result).toBe(text)
    })
  })

  describe('extractSnippet', () => {
    const longText = 'The quick brown fox jumps over the lazy dog. This is a test of the emergency broadcast system. If this had been an actual emergency, you would have been instructed where to tune for news and information.'

    it('should extract snippet around search term', () => {
      const snippet = search.extractSnippet(longText, 'emergency', 20)

      expect(snippet).toContain('emergency')
      expect(snippet.length).toBeLessThan(longText.length)
    })

    it('should add ellipsis at start if needed', () => {
      const snippet = search.extractSnippet(longText, 'emergency', 20)

      expect(snippet).toMatch(/^\.\.\./)
    })

    it('should add ellipsis at end if needed', () => {
      const snippet = search.extractSnippet(longText, 'quick', 20)

      expect(snippet).toMatch(/\.\.\.$/)
    })

    it('should handle search term not found', () => {
      const snippet = search.extractSnippet(longText, 'nonexistent', 50)

      expect(snippet.length).toBeGreaterThan(0)
    })

    it('should handle empty search term', () => {
      const snippet = search.extractSnippet(longText, '', 50)

      expect(snippet.length).toBeGreaterThan(0)
    })
  })

  describe('isValidSearchQuery', () => {
    it('should validate minimum length', () => {
      expect(search.isValidSearchQuery('ab', 2)).toBe(true)
      expect(search.isValidSearchQuery('a', 2)).toBe(false)
      expect(search.isValidSearchQuery('', 2)).toBe(false)
    })

    it('should trim whitespace before checking', () => {
      expect(search.isValidSearchQuery('  ab  ', 2)).toBe(true)
      expect(search.isValidSearchQuery('  a  ', 2)).toBe(false)
    })

    it('should use default minimum length', () => {
      expect(search.isValidSearchQuery('ab')).toBe(true)
      expect(search.isValidSearchQuery('a')).toBe(false)
    })
  })

  describe('validateSearchParams', () => {
    it('should validate required query', () => {
      const result = search.validateSearchParams({ query: '' })

      expect(result).toContain('required')
    })

    it('should validate minimum length', () => {
      const result = search.validateSearchParams({ query: 'a' })

      expect(result).toContain('at least')
    })

    it('should validate columns', () => {
      const result = search.validateSearchParams({
        query: 'test',
        columns: [],
      })

      expect(result).toContain('column')
    })

    it('should return null for valid params', () => {
      const result = search.validateSearchParams({
        query: 'test',
        columns: ['name', 'title'],
      })

      expect(result).toBeNull()
    })

    it('should accept params without columns', () => {
      const result = search.validateSearchParams({
        query: 'test',
      })

      expect(result).toBeNull()
    })
  })

  describe('Search Pattern Edge Cases', () => {
    it('should handle special SQL characters', () => {
      const pattern = search.buildSearchPattern("test'value", 'contains')
      expect(pattern).toBe("%test'value%")
    })

    it('should handle unicode characters', () => {
      const pattern = search.buildSearchPattern('café', 'contains')
      expect(pattern).toBe('%café%')
    })

    it('should handle numbers', () => {
      const pattern = search.buildSearchPattern('12345', 'contains')
      expect(pattern).toBe('%12345%')
    })
  })

  describe('Fuzzy Matching Edge Cases', () => {
    it('should handle very short strings', () => {
      const similarity = search.calculateSimilarity('a', 'b')
      expect(similarity).toBeGreaterThanOrEqual(0)
      expect(similarity).toBeLessThanOrEqual(1)
    })

    it('should handle very long strings', () => {
      const long1 = 'a'.repeat(1000)
      const long2 = 'a'.repeat(999) + 'b'
      const similarity = search.calculateSimilarity(long1, long2)
      expect(similarity).toBeGreaterThan(0.99)
    })

    it('should handle unicode in fuzzy matching', () => {
      const similarity = search.calculateSimilarity('café', 'cafe')
      expect(similarity).toBeGreaterThan(0.5)
    })
  })
})
