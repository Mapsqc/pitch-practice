import { generateFeedback } from '../utils/llm'
import { buildFeedbackPrompt } from '../utils/prompts'
import { useDb } from '../utils/db'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  const { session_id, client_type, transcript } = body

  if (!session_id || !client_type || !transcript) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields' })
  }

  // Format transcript for the prompt
  const transcriptText = transcript
    .map((msg: any) => `${msg.role === 'user' ? 'VENDEUR' : 'CLIENT'}: ${msg.text}`)
    .join('\n')

  const prompt = buildFeedbackPrompt(transcriptText, client_type)

  const feedbackRaw = await generateFeedback(config.openaiApiKey, prompt)

  let feedback: any
  try {
    feedback = JSON.parse(feedbackRaw)
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Failed to parse feedback JSON' })
  }

  // Save feedback to DB
  const db = useDb()

  db.prepare(`
    UPDATE sessions SET feedback_json = ?, score_global = ? WHERE id = ?
  `).run(feedbackRaw, feedback.score_global || 0, session_id)

  // Save individual competence scores
  const insertScore = db.prepare(`
    INSERT INTO session_scores (session_id, competence, score, commentaire)
    VALUES (?, ?, ?, ?)
  `)

  if (feedback.competences) {
    for (const [key, value] of Object.entries(feedback.competences) as [string, any][]) {
      if (value && value.score !== null && value.score !== undefined) {
        insertScore.run(session_id, key, value.score, value.commentaire || '')
      }
    }
  }

  return feedback
})
