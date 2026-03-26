export default defineEventHandler((event) => {
  const query = getQuery(event)
  const userId = query.user_id as string

  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'user_id required' })
  }

  const db = useDb()

  const sessions = db.prepare(`
    SELECT id, user_id, client_type, transcript, feedback_json, score_global, duration_seconds, created_at
    FROM sessions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(userId) as any[]

  // Get scores for each session
  const getScores = db.prepare(`
    SELECT competence, score, commentaire FROM session_scores WHERE session_id = ?
  `)

  for (const session of sessions) {
    session.scores = getScores.all(session.id)
  }

  return sessions
})
