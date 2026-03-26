export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const db = useDb()

  const result = db.prepare(`
    INSERT INTO sessions (user_id, client_type, transcript, feedback, duration_seconds)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    body.user_id,
    body.client_type,
    JSON.stringify(body.transcript || []),
    body.feedback || '',
    body.duration_seconds || 0,
  )

  return { id: result.lastInsertRowid }
})
