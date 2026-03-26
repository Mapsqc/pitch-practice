export default defineEventHandler((event) => {
  const query = getQuery(event)
  const userId = query.user_id as string

  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'user_id required' })
  }

  const db = useDb()

  const sessions = db.prepare(`
    SELECT * FROM sessions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(userId)

  return sessions
})
