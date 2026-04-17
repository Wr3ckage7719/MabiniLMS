import express from 'express'
import request from 'supertest'
import { errorHandler } from '../../src/middleware/errorHandler.js'

describe('errorHandler middleware', () => {
  it('preserves payload-too-large status codes from body parsing', async () => {
    const app = express()

    app.use(express.json({ limit: '100b' }))
    app.post('/api/test', (_req, res) => {
      res.status(200).json({ success: true })
    })
    app.use(errorHandler)

    const response = await request(app)
      .post('/api/test')
      .set('Content-Type', 'application/json')
      .send({ payload: 'x'.repeat(1024) })

    expect(response.status).toBe(413)
    expect(response.body?.success).toBe(false)
    expect(response.body?.error?.code).toBe('PAYLOAD_TOO_LARGE')
    expect(response.body?.error?.message).toContain('payload is too large')
  })
})
