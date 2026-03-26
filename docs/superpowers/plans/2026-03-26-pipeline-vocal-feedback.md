# Pipeline Vocal + Feedback Intelligent - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace OpenAI Realtime WebRTC with a streaming STT+LLM+TTS pipeline and add structured feedback based on sales theory JSON.

**Architecture:** Browser captures audio via Silero VAD, sends PCM chunks over WebSocket to Nuxt server. Server orchestrates Deepgram STT → OpenAI GPT-4o-mini (chat) → OpenAI TTS in a streaming pipeline. Feedback is generated post-session by GPT-4o analyzing the transcript against sales theory. Scores are stored in SQLite for a progression dashboard.

**Tech Stack:** Nuxt 3, Deepgram Nova-2, OpenAI GPT-4o-mini (text), OpenAI TTS, Silero VAD (@ricky0123/vad-web), SQLite (better-sqlite3), TalkingHead (existing)

---

## File Structure

### New files
- `server/utils/theory-parser.ts` — Parses the sales theory JSON into condensed prompt sections
- `server/utils/prompts.ts` — Builds 3-layer system prompts for client roleplay
- `server/utils/deepgram.ts` — Deepgram STT streaming wrapper
- `server/utils/llm.ts` — OpenAI chat completions streaming wrapper
- `server/utils/tts.ts` — OpenAI TTS streaming wrapper
- `server/routes/_ws.ts` — WebSocket endpoint orchestrating the full pipeline
- `server/api/feedback.post.ts` — POST endpoint generating structured feedback
- `composables/useAudioPipeline.ts` — Client-side composable for mic + VAD + WebSocket
- `components/FeedbackPanel.vue` — Feedback display component (text notes)
- `components/ScoreChart.vue` — Simple progression chart for dashboard
- `data/theory.json` — Copy of the sales theory JSON for server access

### Modified files
- `nuxt.config.ts` — Add nitro websocket experimental flag, add deepgramApiKey to runtimeConfig
- `package.json` — Add new dependencies
- `server/utils/db.ts` — Add feedback_json and score_global columns, session_scores table
- `pages/index.vue` — Replace WebRTC with WebSocket pipeline + VAD + feedback UI
- `pages/profile.vue` — Add score charts, competence breakdown, session detail view
- `components/ClientAvatar.vue` — Adjust sample rate from 24000 to match TTS output

### Removed code
- `server/api/session.post.ts` — No longer needed (was for OpenAI Realtime ephemeral key)

---

### Task 1: Install dependencies and configure environment

**Files:**
- Modify: `package.json`
- Modify: `nuxt.config.ts`
- Modify: `.env.example`
- Create: `data/theory.json`

- [ ] **Step 1: Install new dependencies**

Run:
```bash
cd C:/Users/adama/pitch-practice
npm install @deepgram/sdk openai @ricky0123/vad-web
```

- [ ] **Step 2: Copy theory JSON to project data folder**

```bash
cp C:/Users/adama/Downloads/export-theorie-2026-03-19.json C:/Users/adama/pitch-practice/data/theory.json
```

- [ ] **Step 3: Update .env.example**

Add the new env vars:
```
NUXT_OPENAI_API_KEY=your_openai_api_key
NUXT_DEEPGRAM_API_KEY=your_deepgram_api_key
```

- [ ] **Step 4: Update nuxt.config.ts**

```ts
export default defineNuxtConfig({
  devtools: { enabled: false },
  modules: ['@nuxtjs/supabase'],
  runtimeConfig: {
    openaiApiKey: '',
    deepgramApiKey: '',
  },
  supabase: {
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      exclude: ['/login', '/signup'],
    },
  },
  vite: {
    optimizeDeps: {
      exclude: ['@met4citizen/talkinghead'],
    },
  },
  nitro: {
    experimental: {
      websocket: true,
    },
  },
})
```

- [ ] **Step 5: Add NUXT_DEEPGRAM_API_KEY to .env**

Add your Deepgram API key (from https://console.deepgram.com) to `.env`:
```
NUXT_DEEPGRAM_API_KEY=your_key_here
```

- [ ] **Step 6: Update .gitignore to include data/theory.json but not data/*.db**

Verify `.gitignore` has `data/` — theory.json needs an exception:
```
data/
!data/theory.json
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json nuxt.config.ts .env.example .gitignore data/theory.json
git commit -m "feat: add pipeline dependencies and config (deepgram, openai, vad-web)"
```

---

### Task 2: Theory parser — condense JSON into prompt sections

**Files:**
- Create: `server/utils/theory-parser.ts`

- [ ] **Step 1: Create theory-parser.ts**

```ts
import { readFileSync } from 'fs'
import { join } from 'path'

interface ContentItem {
  id: string
  parent_id: string | null
  content_type: 'sales' | 'service' | 'calls'
  item_type: 'file' | 'folder'
  title: string
  content: {
    blocks?: Array<{
      id: string
      type: string
      text?: string
      url?: string
    }>
  }
}

interface TheoryExport {
  contentItems: ContentItem[]
}

interface TheorySections {
  service: string
  sales: string
  salesByTopic: Record<string, string>
}

let cached: TheorySections | null = null

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|h[1-6]|li|ul|ol|blockquote|hr|div)(\s[^>]*)?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractText(item: ContentItem): string {
  if (!item.content?.blocks) return ''
  return item.content.blocks
    .filter(b => b.type === 'text' && b.text)
    .map(b => stripHtml(b.text!))
    .join('\n\n')
}

export function loadTheory(): TheorySections {
  if (cached) return cached

  const jsonPath = join(process.cwd(), 'data', 'theory.json')
  const raw: TheoryExport = JSON.parse(readFileSync(jsonPath, 'utf-8'))
  const items = raw.contentItems.filter(i => i.item_type === 'file')

  // Build service section
  const serviceItems = items.filter(i => i.content_type === 'service')
  const serviceText = serviceItems
    .map(i => {
      const text = extractText(i)
      return text ? `## ${i.title}\n${text}` : ''
    })
    .filter(Boolean)
    .join('\n\n---\n\n')

  // Build sales section (condensed summary)
  const salesItems = items.filter(i => i.content_type === 'sales')
  const salesText = salesItems
    .map(i => {
      const text = extractText(i)
      return text ? `## ${i.title}\n${text}` : ''
    })
    .filter(Boolean)
    .join('\n\n---\n\n')

  // Build sales by topic for targeted injection
  const salesByTopic: Record<string, string> = {}
  for (const item of salesItems) {
    const text = extractText(item)
    if (text) {
      salesByTopic[item.title.toLowerCase()] = text
    }
  }

  cached = { service: serviceText, sales: salesText, salesByTopic }
  return cached
}
```

- [ ] **Step 2: Verify it loads without error**

Create a quick test by running in the Nuxt server context. Add a temp endpoint:
```bash
# We'll verify this works when we run the dev server in a later task
```

- [ ] **Step 3: Commit**

```bash
git add server/utils/theory-parser.ts
git commit -m "feat: add theory parser to condense sales JSON into prompt sections"
```

---

### Task 3: Prompt builder — 3-layer system prompt

**Files:**
- Create: `server/utils/prompts.ts`

- [ ] **Step 1: Create prompts.ts**

```ts
import { loadTheory } from './theory-parser'

type ClientType = 'technique' | 'facile' | 'difficile' | 'neutre'

const baseRules = `
######## INSTRUCTION CRITIQUE - TON RÔLE ########
Tu es UN RÉSIDENT ORDINAIRE chez toi. Tu as OUVERT TA PORTE parce que quelqu'un a cogné.
La personne devant toi est UN VENDEUR. C'est LUI qui vend, PAS TOI.
Tu ne vends RIEN. Tu ne travailles pour AUCUNE compagnie. Tu ne fais AUCUN pitch.
Tu n'offres AUCUN service. Tu ne te présentes JAMAIS comme représentant de quoi que ce soit.

Si tu te surprends à expliquer un produit, un service, des avantages ou à faire une offre → ARRÊTE. C'est le job du VENDEUR, pas le tien.

Ton seul rôle : RÉAGIR à ce que le vendeur dit. Écouter, répondre, poser des questions si tu veux.
########

RÈGLES DE COMPORTEMENT IMPORTANTES :
- Tu ne sais PAS pourquoi cette personne est à ta porte. Tu ne connais PAS le contrôle antiparasitaire, tu ne connais PAS la compagnie du vendeur. Tu découvres le sujet AU FUR ET À MESURE que le vendeur t'explique. Ne mentionne JAMAIS les parasites, les bibittes ou l'extermination AVANT que le vendeur en parle.
- Tes réponses sont COURTES. En vrai, les gens disent "ok", "ah ouin?", "hmm", "je sais pas". Pas des paragraphes.
- Tu ÉCOUTES plus que tu parles. C'est le vendeur qui doit mener la conversation, pas toi.
- Tu ne poses PAS de questions de toi-même sauf si le vendeur te demande ou si quelque chose t'intrigue vraiment.
- Tu ne facilites PAS la vie du vendeur. Tu ne relances pas la conversation. Si le vendeur arrête de parler, il y a un silence awkward.
- Parle en français québécois naturel. TOUJOURS en français. Varie tes réponses à chaque conversation. Ne révèle jamais que tu es une IA.

IMPORTANT — FORMAT DE RÉPONSE :
- Tu réponds en UNE ou DEUX phrases maximum. Jamais plus.
- Pas de listes, pas de bullet points, pas de paragraphes.
- Tu parles comme un vrai humain à sa porte : court, direct, naturel.

IMPORTANT SUR LA CONCLUSION DE LA VENTE :
- La vente PEUT se conclure. Si le vendeur fait bien sa job (bon pitch, répond aux objections, propose un rendez-vous ou un prix), tu peux dire oui.
- La décision de dire oui dépend de ta personnalité de client ET de la qualité du vendeur. Un bon vendeur ferme la vente.
- Quand le vendeur te demande de prendre rendez-vous ou de signer, ne refuse pas automatiquement. Évalue honnêtement si tu serais convaincu dans la vraie vie basé sur ce qu'il t'a dit.
`

const clientPersonalities: Record<ClientType, string> = {
  technique: `Tu es un client TECHNIQUE. Au début, tu sais même pas de quoi il parle. Mais une fois que tu comprends le sujet, ta nature curieuse embarque et là tu commences à poser des questions pointues :
- Quels produits sont utilisés, leur toxicité
- Les certifications
- Les méthodes
- L'impact environnemental

MAIS tu poses UNE question à la fois, pas une liste. Et seulement quand le vendeur t'a donné assez d'info pour que ça t'intéresse. Au début, tu écoutes juste.

Tu es éduqué. Tu ne signes rien sans comprendre. Commence par ouvrir la porte : "Oui?" ou "C'est pourquoi?"`,

  facile: `Tu es un client FACILE, mais ça veut pas dire que c'est gratuit. Quand tu ouvres la porte, tu sais pas c'est qui. Tu es neutre.

Une fois que le vendeur mentionne les parasites, ça t'interpelle parce que tu as justement vu des bibittes chez vous. Mais tu restes passif — tu dis des trucs comme "ah ouin?", "ok", "combien ça coûte?". Tu poses pas 10 questions. Si le vendeur fait bien sa job, tu finis par dire oui assez vite.

Commence par ouvrir la porte : "Oui?" ou "Allo?"`,

  difficile: `Tu es un client DIFFICILE, mais réaliste. T'es pas content de voir un vendeur, mais t'es quand même un être humain poli au minimum.

Tu es :
- Méfiant et pas intéressé au départ ("je suis correct", "on a pas besoin de ça")
- Tu donnes des objections réalistes : "c'est combien?", "mon beau-frère fait ça", "j'ai pas vu de bibittes", "ça m'intéresse pas vraiment"
- Tu résistes, mais si le vendeur fait un bon point, tu peux dire "ouin... mais quand même..."
- Tu laisses des ouvertures malgré toi — tu fermes pas la porte au nez du vendeur tant qu'il est respectueux
- Tes objections sont des VRAIES objections qu'un vendeur peut adresser, pas des murs impossibles

Le vendeur doit travailler fort, mais c'est PAS impossible. Si le vendeur répond bien à tes objections, tu ramollis graduellement. C'est un défi, pas un rejet automatique.

Commence par ouvrir la porte : "Oui?" ou "C'est quoi?"`,

  neutre: `Tu es un client NEUTRE. Tu es poli, tu ouvres la porte, tu écoutes. Mais tu parles pas beaucoup. Tu dis :
- "ok"
- "ah ouin"
- "hmm"
- "je sais pas"
- "faudrait que j'en parle à ma femme/mon mari"

Tu relances JAMAIS la conversation. Si le vendeur fait une pause, tu attends. Tu poses pas de questions sauf si on te demande "avez-vous des questions?". Tu es pas pressé de signer, pas pressé de le renvoyer non plus. Tu es juste... là.

Commence par ouvrir la porte : "Oui, bonjour?"`,
}

export function buildClientPrompt(clientType: ClientType): string {
  const theory = loadTheory()

  const personality = `Tu es un client résidentiel chez toi. Quelqu'un cogne à ta porte — c'est un vendeur qui fait du porte-à-porte au Québec.\n\n${clientPersonalities[clientType]}`

  // Couche 2: Service knowledge (condensed, max ~2000 chars)
  const serviceContext = `
######## CE QUE TU SAIS SUR LE SERVICE (utilise UNIQUEMENT pour réagir) ########
Le vendeur travaille potentiellement pour une compagnie de gestion antiparasitaire.
Services possibles : application liquide extérieure, granulation, traitement de guêpes, traitement de rongeurs, calfeutrage.
Les produits sont appliqués autour de la maison avec un pulvérisateur.
Le traitement dure plusieurs semaines.
RAPPEL : Tu ne connais PAS ces détails. Tu les découvres quand le vendeur en parle. Ne mentionne JAMAIS ces infos en premier.
########`

  // Couche 3: Sales technique awareness (so the client reacts naturally)
  const salesContext = `
######## COMMENT RÉAGIR AUX TECHNIQUES DE VENTE (NE MENTIONNE JAMAIS CES CONCEPTS) ########
- Si le vendeur mentionne des voisins (third party) : tu peux réagir naturellement ("ah ouin, Jean fait affaire avec vous?") ou ignorer
- Si le vendeur te pose des questions sur qui décide pour la maison : réponds honnêtement, pas comme si c'était un piège
- Si le vendeur te dit "moitié prix" ou parle de rabais : ça peut t'intéresser ou pas selon ta personnalité
- Smokescreens typiques que tu peux utiliser : "j'en ai pas besoin", "mon mari est pas là", "j'ai déjà quelqu'un", "c'est combien?"
- Tu utilises ces smokescreens seulement si c'est naturel pour ton personnage, pas systématiquement
########`

  return `${personality}\n\n${baseRules}\n\n${serviceContext}\n\n${salesContext}`
}

export const FEEDBACK_COMPETENCES = [
  { key: 'premiere_impression', label: 'Première impression', description: 'Body language, position, énergie initiale' },
  { key: 'briser_glace', label: 'Briser la glace', description: 'Salutation, sourire, connexion initiale' },
  { key: 'presentation', label: 'Présentation (Qui?)', description: 'Se présenter, nommer la compagnie' },
  { key: 'third_party', label: 'Third Party (Quoi?)', description: 'Mentionner des voisins, justifier sa présence' },
  { key: 'situation_nuisibles', label: 'Situation des nuisibles (Pourquoi?)', description: 'Partager les problèmes du quartier' },
  { key: 'close_intro', label: 'Close d\'intro', description: 'Proposer le service, sortir un smokescreen' },
  { key: 'smokescreens', label: 'Gestion des smokescreens', description: 'Surmonter les objections automatiques' },
  { key: 'objections_rac', label: 'Résolution d\'objections (RAC)', description: 'Relate, Ask, Close sur les vraies objections' },
  { key: 'name_labeling', label: 'Name Labeling', description: 'Identity-based selling, faire avouer le label' },
  { key: 'rapport', label: 'Rapport / Synchronisation', description: 'Connexion avec le client, mirroring, écoute' },
  { key: 'explication_prix', label: 'Explication du prix', description: 'Comment le prix est présenté et justifié' },
  { key: 'connaissance_service', label: 'Connaissance du service', description: 'Capacité à expliquer les produits et méthodes' },
] as const

export function buildFeedbackPrompt(transcript: string, clientType: ClientType): string {
  const theory = loadTheory()

  const competencesList = FEEDBACK_COMPETENCES
    .map(c => `- ${c.key}: ${c.label} — ${c.description}`)
    .join('\n')

  return `Tu es un coach de vente expert en porte-à-porte pour le contrôle antiparasitaire au Québec.

Analyse la performance du vendeur dans cette session de pratique. Le client était de type "${clientType}".

## TRANSCRIPT DE LA SESSION
${transcript}

## THÉORIE DE VENTE (référence)
${theory.sales.substring(0, 15000)}

## COMPÉTENCES À ÉVALUER
${competencesList}

## INSTRUCTIONS
Évalue chaque compétence sur 10. Certaines compétences ne seront pas observables dans chaque session — donne null si la compétence n'a pas été testée.

Réponds UNIQUEMENT en JSON valide avec cette structure exacte :
{
  "score_global": <number 1-10>,
  "competences": {
    "<competence_key>": { "score": <number 1-10 or null>, "commentaire": "<string>" },
    ...pour chaque compétence
  },
  "points_forts": ["<string>", ...],
  "a_ameliorer": ["<string>", ...],
  "conseil_cle": "<string — un conseil actionable et spécifique basé sur la théorie>"
}`
}
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/prompts.ts
git commit -m "feat: add 3-layer prompt builder and feedback prompt generator"
```

---

### Task 4: Update database schema

**Files:**
- Modify: `server/utils/db.ts`

- [ ] **Step 1: Update db.ts with new columns and table**

Replace the full content of `server/utils/db.ts`:

```ts
import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'

let db: Database.Database | null = null

export function useDb(): Database.Database {
  if (!db) {
    const dbPath = join(process.cwd(), 'data', 'pitch-practice.db')

    mkdirSync(join(process.cwd(), 'data'), { recursive: true })

    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')

    // Create tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        client_type TEXT NOT NULL,
        transcript TEXT DEFAULT '[]',
        feedback TEXT DEFAULT '',
        feedback_json TEXT,
        score_global INTEGER,
        duration_seconds INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS session_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        competence TEXT NOT NULL,
        score INTEGER,
        commentaire TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );
    `)

    // Migration: add columns if they don't exist (for existing DBs)
    try { db.exec('ALTER TABLE sessions ADD COLUMN feedback_json TEXT') } catch {}
    try { db.exec('ALTER TABLE sessions ADD COLUMN score_global INTEGER') } catch {}
  }

  return db
}
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/db.ts
git commit -m "feat: add feedback_json, score_global columns and session_scores table"
```

---

### Task 5: Deepgram STT streaming wrapper

**Files:**
- Create: `server/utils/deepgram.ts`

- [ ] **Step 1: Create deepgram.ts**

```ts
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk'

export interface DeepgramStream {
  send: (audioChunk: Buffer) => void
  close: () => void
  onTranscript: (callback: (text: string, isFinal: boolean) => void) => void
  onError: (callback: (error: Error) => void) => void
}

export function createDeepgramStream(apiKey: string): DeepgramStream {
  const deepgram = createClient(apiKey)
  let transcriptCallback: ((text: string, isFinal: boolean) => void) | null = null
  let errorCallback: ((error: Error) => void) | null = null

  const connection = deepgram.listen.live({
    model: 'nova-2',
    language: 'fr',
    smart_format: true,
    encoding: 'linear16',
    sample_rate: 16000,
    channels: 1,
    interim_results: true,
    utterance_end_ms: 1500,
  })

  connection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const transcript = data.channel?.alternatives?.[0]?.transcript
    if (transcript && transcriptCallback) {
      transcriptCallback(transcript, data.is_final ?? false)
    }
  })

  connection.on(LiveTranscriptionEvents.Error, (error) => {
    if (errorCallback) errorCallback(error)
  })

  return {
    send(audioChunk: Buffer) {
      if (connection.getReadyState() === 1) {
        connection.send(audioChunk)
      }
    },
    close() {
      connection.requestClose()
    },
    onTranscript(callback) {
      transcriptCallback = callback
    },
    onError(callback) {
      errorCallback = callback
    },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/deepgram.ts
git commit -m "feat: add Deepgram STT streaming wrapper"
```

---

### Task 6: OpenAI LLM streaming wrapper

**Files:**
- Create: `server/utils/llm.ts`

- [ ] **Step 1: Create llm.ts**

```ts
import OpenAI from 'openai'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMStreamCallbacks {
  onToken: (token: string) => void
  onDone: (fullText: string) => void
  onError: (error: Error) => void
}

export async function streamChatResponse(
  apiKey: string,
  messages: ChatMessage[],
  callbacks: LLMStreamCallbacks,
): Promise<void> {
  const openai = new OpenAI({ apiKey })

  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      stream: true,
      max_tokens: 150,
      temperature: 0.9,
    })

    let fullText = ''
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content
      if (token) {
        fullText += token
        callbacks.onToken(token)
      }
    }
    callbacks.onDone(fullText)
  } catch (error) {
    callbacks.onError(error as Error)
  }
}

export async function generateFeedback(
  apiKey: string,
  prompt: string,
): Promise<string> {
  const openai = new OpenAI({ apiKey })

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2000,
    temperature: 0.3,
    response_format: { type: 'json_object' },
  })

  return response.choices[0]?.message?.content || '{}'
}
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/llm.ts
git commit -m "feat: add OpenAI LLM streaming wrapper for chat and feedback"
```

---

### Task 7: OpenAI TTS streaming wrapper

**Files:**
- Create: `server/utils/tts.ts`

- [ ] **Step 1: Create tts.ts**

```ts
import OpenAI from 'openai'

export interface TTSStreamCallbacks {
  onAudioChunk: (chunk: Buffer) => void
  onDone: () => void
  onError: (error: Error) => void
}

export async function streamTTS(
  apiKey: string,
  text: string,
  callbacks: TTSStreamCallbacks,
): Promise<void> {
  const openai = new OpenAI({ apiKey })

  try {
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      input: text,
      voice: 'ash',
      response_format: 'pcm',
      speed: 1.0,
    })

    const reader = response.body as unknown as AsyncIterable<Uint8Array>
    for await (const chunk of reader) {
      callbacks.onAudioChunk(Buffer.from(chunk))
    }
    callbacks.onDone()
  } catch (error) {
    callbacks.onError(error as Error)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/tts.ts
git commit -m "feat: add OpenAI TTS streaming wrapper (PCM output)"
```

---

### Task 8: WebSocket pipeline endpoint

**Files:**
- Create: `server/routes/_ws.ts`

- [ ] **Step 1: Create the WebSocket handler**

```ts
import { createDeepgramStream } from '../utils/deepgram'
import { streamChatResponse, type ChatMessage } from '../utils/llm'
import { streamTTS } from '../utils/tts'
import { buildClientPrompt } from '../utils/prompts'

interface SessionState {
  clientType: string
  messages: ChatMessage[]
  deepgramStream: ReturnType<typeof createDeepgramStream> | null
  isProcessing: boolean
  transcript: Array<{ role: 'user' | 'assistant'; text: string }>
}

const sessions = new Map<string, SessionState>()

export default defineWebSocketHandler({
  open(peer) {
    console.log('[ws] Client connected:', peer.id)
  },

  async message(peer, msg) {
    const config = useRuntimeConfig()
    const data = JSON.parse(typeof msg === 'string' ? msg : msg.text())

    switch (data.type) {
      case 'start': {
        const clientType = data.clientType as string
        const systemPrompt = buildClientPrompt(clientType as any)

        const state: SessionState = {
          clientType,
          messages: [{ role: 'system', content: systemPrompt }],
          deepgramStream: null,
          isProcessing: false,
          transcript: [],
        }

        // Setup Deepgram STT
        state.deepgramStream = createDeepgramStream(config.deepgramApiKey)

        let currentUtterance = ''

        state.deepgramStream.onTranscript(async (text, isFinal) => {
          if (isFinal && text.trim()) {
            currentUtterance += ' ' + text
          } else if (!isFinal && text.trim()) {
            // Send interim for display
            peer.send(JSON.stringify({
              type: 'transcript_interim',
              role: 'user',
              text: text.trim(),
            }))
          }
        })

        state.deepgramStream.onError((error) => {
          console.error('[deepgram] Error:', error)
        })

        sessions.set(peer.id, state)
        peer.send(JSON.stringify({ type: 'ready' }))
        break
      }

      case 'audio': {
        const state = sessions.get(peer.id)
        if (!state?.deepgramStream) break
        const audioBuffer = Buffer.from(data.audio, 'base64')
        state.deepgramStream.send(audioBuffer)
        break
      }

      case 'speech_end': {
        // VAD detected end of speech — process the utterance
        const state = sessions.get(peer.id)
        if (!state || state.isProcessing) break

        const userText = data.transcript?.trim()
        if (!userText) break

        state.isProcessing = true
        state.transcript.push({ role: 'user', text: userText })
        state.messages.push({ role: 'user', content: userText })

        peer.send(JSON.stringify({
          type: 'transcript',
          role: 'user',
          text: userText,
        }))

        // LLM streaming → sentence buffer → TTS
        let sentenceBuffer = ''
        let fullResponse = ''

        await streamChatResponse(config.openaiApiKey, state.messages, {
          onToken(token) {
            sentenceBuffer += token
            fullResponse += token

            // Send token for text display
            peer.send(JSON.stringify({ type: 'llm_token', text: token }))
          },
          async onDone(fullText) {
            // Send any remaining text to TTS
            if (sentenceBuffer.trim()) {
              await sendTTS(config.openaiApiKey, sentenceBuffer.trim(), peer)
            }

            state.messages.push({ role: 'assistant', content: fullText })
            state.transcript.push({ role: 'assistant', text: fullText })

            peer.send(JSON.stringify({
              type: 'transcript',
              role: 'assistant',
              text: fullText,
            }))
            peer.send(JSON.stringify({ type: 'turn_done' }))
            state.isProcessing = false
          },
          onError(error) {
            console.error('[llm] Error:', error)
            state.isProcessing = false
            peer.send(JSON.stringify({ type: 'error', message: error.message }))
          },
        })
        break
      }

      case 'stop': {
        const state = sessions.get(peer.id)
        if (state) {
          state.deepgramStream?.close()
          peer.send(JSON.stringify({
            type: 'session_ended',
            transcript: state.transcript,
          }))
          sessions.delete(peer.id)
        }
        break
      }
    }
  },

  close(peer) {
    const state = sessions.get(peer.id)
    if (state) {
      state.deepgramStream?.close()
      sessions.delete(peer.id)
    }
    console.log('[ws] Client disconnected:', peer.id)
  },
})

async function sendTTS(apiKey: string, text: string, peer: any): Promise<void> {
  return new Promise((resolve) => {
    streamTTS(apiKey, text, {
      onAudioChunk(chunk) {
        peer.send(JSON.stringify({
          type: 'audio',
          audio: chunk.toString('base64'),
        }))
      },
      onDone() {
        peer.send(JSON.stringify({ type: 'audio_end' }))
        resolve()
      },
      onError(error) {
        console.error('[tts] Error:', error)
        resolve()
      },
    })
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/_ws.ts
git commit -m "feat: add WebSocket pipeline endpoint (STT -> LLM -> TTS)"
```

---

### Task 9: Client-side audio composable (mic + VAD + WebSocket)

**Files:**
- Create: `composables/useAudioPipeline.ts`

- [ ] **Step 1: Create the composable**

```ts
import { ref } from 'vue'

export interface PipelineMessage {
  role: 'user' | 'assistant'
  text: string
}

export function useAudioPipeline() {
  const isConnecting = ref(false)
  const isConnected = ref(false)
  const transcript = ref<PipelineMessage[]>([])
  const currentAssistantText = ref('')
  const isProcessing = ref(false)

  let ws: WebSocket | null = null
  let myvad: any = null
  let audioContext: AudioContext | null = null

  async function start(clientType: string) {
    isConnecting.value = true
    transcript.value = []
    currentAssistantText.value = ''

    try {
      // Connect WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(`${protocol}//${window.location.host}/_ws`)

      await new Promise<void>((resolve, reject) => {
        ws!.onopen = () => {
          ws!.send(JSON.stringify({ type: 'start', clientType }))
          resolve()
        }
        ws!.onerror = reject
        setTimeout(() => reject(new Error('WebSocket timeout')), 5000)
      })

      // Setup message handling
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        handleMessage(data)
      }

      // Wait for 'ready' from server
      await new Promise<void>((resolve) => {
        const originalHandler = ws!.onmessage
        ws!.onmessage = (event) => {
          const data = JSON.parse(event.data)
          if (data.type === 'ready') {
            ws!.onmessage = originalHandler
            resolve()
          }
        }
      })

      // Start VAD
      const { MicVAD } = await import('@ricky0123/vad-web')
      myvad = await MicVAD.new({
        positiveSpeechThreshold: 0.6,
        negativeSpeechThreshold: 0.3,
        minSpeechFrames: 3,
        preSpeechPadFrames: 10,
        redemptionFrames: 20,
        onSpeechEnd: (audio: Float32Array) => {
          if (!ws || ws.readyState !== WebSocket.OPEN) return

          // Convert Float32 to Int16 PCM
          const pcm16 = float32ToInt16(audio)
          const base64 = bufferToBase64(pcm16.buffer)

          // Send audio to server for STT
          ws.send(JSON.stringify({ type: 'audio', audio: base64 }))

          // Also send through Deepgram and get transcript
          // The VAD gives us the audio — we send it and wait for transcript
          // For now, use a simpler approach: send audio, server does STT
          // Then server sends back the transcript for us to display

          // We need to tell the server "speech ended" so it processes
          // We'll do quick STT client-side for the transcript text
          // Actually, let's send the raw audio and let server handle STT
          ws.send(JSON.stringify({ type: 'speech_end', transcript: '' }))
        },
        onFrameProcessed: (probs: { isSpeech: number }) => {
          // Could visualize speech probability
        },
      })

      myvad.start()
      isConnected.value = true
    } catch (err) {
      console.error('Pipeline start failed:', err)
      throw err
    } finally {
      isConnecting.value = false
    }
  }

  function handleMessage(data: any) {
    switch (data.type) {
      case 'transcript':
        if (data.role === 'assistant') {
          currentAssistantText.value = ''
        }
        transcript.value.push({ role: data.role, text: data.text })
        break

      case 'llm_token':
        currentAssistantText.value += data.text
        break

      case 'audio':
        playAudioChunk(data.audio)
        break

      case 'audio_end':
        // TTS finished for this turn
        break

      case 'turn_done':
        currentAssistantText.value = ''
        isProcessing.value = false
        break

      case 'error':
        console.error('Server error:', data.message)
        isProcessing.value = false
        break
    }
  }

  // Audio playback for TTS chunks
  let playbackQueue: ArrayBuffer[] = []
  let isPlaying = false

  function playAudioChunk(base64Audio: string) {
    const bytes = base64ToBuffer(base64Audio)
    playbackQueue.push(bytes)
    if (!isPlaying) processPlaybackQueue()
  }

  async function processPlaybackQueue() {
    if (!audioContext) {
      audioContext = new AudioContext({ sampleRate: 24000 })
    }
    isPlaying = true

    while (playbackQueue.length > 0) {
      const chunk = playbackQueue.shift()!
      const int16 = new Int16Array(chunk)
      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768
      }

      const buffer = audioContext.createBuffer(1, float32.length, 24000)
      buffer.getChannelData(0).set(float32)

      const source = audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(audioContext.destination)
      source.start()

      // Wait for it to finish
      await new Promise<void>((resolve) => {
        source.onended = () => resolve()
      })
    }

    isPlaying = false
  }

  // Expose a method to get audio data for avatar lip-sync
  function getAudioFeedCallback(): ((data: Float32Array) => void) | null {
    // This will be set by the component using this composable
    return null
  }

  function stop(): Array<{ role: string; text: string }> {
    const result = [...transcript.value]

    if (myvad) {
      myvad.pause()
      myvad.destroy()
      myvad = null
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }))
      ws.close()
    }
    ws = null

    if (audioContext) {
      audioContext.close()
      audioContext = null
    }

    playbackQueue = []
    isPlaying = false
    isConnected.value = false
    currentAssistantText.value = ''

    return result
  }

  return {
    isConnecting,
    isConnected,
    transcript,
    currentAssistantText,
    isProcessing,
    start,
    stop,
  }
}

// Utility functions
function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return int16
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}
```

- [ ] **Step 2: Commit**

```bash
git add composables/useAudioPipeline.ts
git commit -m "feat: add client-side audio pipeline composable (VAD + WebSocket)"
```

---

### Task 10: Rewrite index.vue — replace WebRTC with pipeline

**Files:**
- Modify: `pages/index.vue`

- [ ] **Step 1: Rewrite index.vue**

Replace the entire `<script setup>` and update the template. The full file:

```vue
<script setup lang="ts">
const user = useSupabaseUser()
const { isConnecting, isConnected, transcript, currentAssistantText, start, stop } = useAudioPipeline()

const clientTypes = {
  technique: {
    name: 'Le Technique',
    description: 'Pose beaucoup de questions techniques',
    color: '#3b82f6',
  },
  facile: {
    name: 'Le Facile',
    description: 'Ouvert mais pas gratuit',
    color: '#22c55e',
  },
  difficile: {
    name: 'Le Difficile',
    description: 'Résistant, sceptique, dur à convaincre',
    color: '#ef4444',
  },
  neutre: {
    name: 'Le Neutre',
    description: 'Client standard, écoute mais engage pas',
    color: '#8b5cf6',
  },
} as const

type ClientType = keyof typeof clientTypes

const selectedClient = ref<ClientType | null>(null)
const transcriptEl = ref<HTMLElement | null>(null)
const showFeedback = ref(false)
const feedbackData = ref<any>(null)
const feedbackLoading = ref(false)
let sessionStartTime = 0

function scrollTranscript() {
  nextTick(() => {
    if (transcriptEl.value) {
      transcriptEl.value.scrollTop = transcriptEl.value.scrollHeight
    }
  })
}

watch(transcript, () => scrollTranscript(), { deep: true })
watch(currentAssistantText, () => scrollTranscript())

async function startSession() {
  if (!selectedClient.value) return
  sessionStartTime = Date.now()
  showFeedback.value = false
  feedbackData.value = null

  try {
    await start(selectedClient.value)
  } catch (err: any) {
    alert(`Erreur: ${err.message}`)
  }
}

async function stopSession() {
  const sessionTranscript = stop()
  const duration = Math.round((Date.now() - sessionStartTime) / 1000)

  if (!user.value || !selectedClient.value) return

  // Save session
  try {
    const result = await $fetch('/api/sessions', {
      method: 'POST',
      body: {
        user_id: user.value.id,
        client_type: selectedClient.value,
        transcript: sessionTranscript,
        duration_seconds: duration,
      },
    }) as { id: number }

    // Request feedback
    await requestFeedback(result.id, sessionTranscript, duration)
  } catch (err) {
    console.error('Failed to save session:', err)
  }
}

async function requestFeedback(sessionId: number, sessionTranscript: any[], duration: number) {
  if (!selectedClient.value) return
  feedbackLoading.value = true
  showFeedback.value = true

  try {
    const result = await $fetch('/api/feedback', {
      method: 'POST',
      body: {
        session_id: sessionId,
        client_type: selectedClient.value,
        transcript: sessionTranscript,
      },
    })
    feedbackData.value = result
  } catch (err) {
    console.error('Feedback failed:', err)
    feedbackData.value = { error: 'Impossible de générer le feedback' }
  } finally {
    feedbackLoading.value = false
  }
}

function newSession() {
  stop()
  selectedClient.value = null
  showFeedback.value = false
  feedbackData.value = null
}
</script>

<template>
  <div>
    <!-- Client Selection -->
    <div v-if="!isConnecting && !isConnected && !showFeedback">
      <h2 class="section-title">Choisir un type de client</h2>
      <div class="client-grid">
        <button
          v-for="(client, key) in clientTypes"
          :key="key"
          :class="['client-card', { selected: selectedClient === key }]"
          :style="selectedClient === key ? { borderColor: client.color, background: client.color + '10' } : {}"
          @click="selectedClient = key as ClientType"
        >
          <div class="card-indicator" :style="{ background: client.color }" />
          <h3>{{ client.name }}</h3>
          <p>{{ client.description }}</p>
        </button>
      </div>

      <button
        v-if="selectedClient"
        class="btn-start"
        @click="startSession"
      >
        Commencer le pitch
      </button>
    </div>

    <!-- Active Session -->
    <div v-if="isConnecting || isConnected">
      <div class="session-header">
        <div class="status">
          <span class="status-dot" :class="{ connecting: isConnecting }" />
          <span v-if="isConnecting">Connexion en cours...</span>
          <span v-else>En conversation avec <strong>{{ clientTypes[selectedClient!].name }}</strong></span>
        </div>
      </div>

      <!-- Transcript -->
      <div ref="transcriptEl" class="transcript">
        <div v-if="transcript.length === 0" class="transcript-empty">
          {{ isConnecting ? 'Préparation...' : 'Parle pour commencer...' }}
        </div>
        <div
          v-for="(msg, i) in transcript"
          :key="i"
          :class="['msg', msg.role]"
        >
          <span class="msg-label">{{ msg.role === 'user' ? 'Vous' : 'Client' }}</span>
          <span class="msg-text">{{ msg.text }}</span>
        </div>
        <div v-if="currentAssistantText" class="msg assistant streaming">
          <span class="msg-label">Client</span>
          <span class="msg-text">{{ currentAssistantText }}</span>
        </div>
      </div>

      <div class="controls">
        <button class="btn-stop" @click="stopSession">Arrêter + Feedback</button>
        <button class="btn-new" @click="newSession">Annuler</button>
      </div>
    </div>

    <!-- Feedback Panel -->
    <FeedbackPanel
      v-if="showFeedback"
      :feedback="feedbackData"
      :loading="feedbackLoading"
      :client-type="selectedClient"
      @new-session="newSession"
    />
  </div>
</template>

<style scoped>
.section-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #9ca3af;
  margin-bottom: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.client-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.client-card {
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  padding: 1.25rem;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.client-card:hover {
  border-color: #d1d5db;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.client-card.selected {
  transform: translateY(-1px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.card-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-bottom: 0.75rem;
}

.client-card h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.client-card p {
  font-size: 0.85rem;
  color: #6b7280;
  line-height: 1.4;
}

.btn-start {
  display: block;
  width: 100%;
  margin-top: 1.5rem;
  padding: 1rem;
  font-size: 1.1rem;
  font-weight: 600;
  background: #1a1a2e;
  color: white;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s;
  font-family: inherit;
}

.btn-start:hover:not(:disabled) {
  background: #2d2d4a;
}

.session-header {
  margin-bottom: 1rem;
}

.status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #22c55e;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-dot.connecting {
  background: #f59e0b;
}

.transcript {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem;
  height: 400px;
  overflow-y: auto;
  margin-bottom: 1rem;
}

.transcript-empty {
  color: #9ca3af;
  text-align: center;
  padding: 2rem;
  font-style: italic;
}

.msg {
  margin-bottom: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid #f3f4f6;
}

.msg:last-child {
  border-bottom: none;
}

.msg-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.2rem;
}

.msg.user .msg-label { color: #3b82f6; }
.msg.assistant .msg-label { color: #ef4444; }

.msg-text {
  font-size: 0.95rem;
  line-height: 1.5;
}

.msg.streaming {
  opacity: 0.7;
}

.controls {
  display: flex;
  gap: 0.5rem;
}

.controls button {
  flex: 1;
  padding: 0.75rem;
  font-size: 0.9rem;
  font-weight: 600;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: opacity 0.15s;
  font-family: inherit;
}

.controls button:hover { opacity: 0.85; }

.btn-stop { background: #ef4444; color: white; }
.btn-new { background: #6b7280; color: white; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add pages/index.vue
git commit -m "feat: replace WebRTC with WebSocket pipeline in index.vue"
```

---

### Task 11: Feedback endpoint

**Files:**
- Create: `server/api/feedback.post.ts`

- [ ] **Step 1: Create feedback.post.ts**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add server/api/feedback.post.ts
git commit -m "feat: add feedback endpoint with GPT-4o analysis and DB storage"
```

---

### Task 12: Feedback panel component

**Files:**
- Create: `components/FeedbackPanel.vue`

- [ ] **Step 1: Create FeedbackPanel.vue**

```vue
<script setup lang="ts">
const props = defineProps<{
  feedback: any
  loading: boolean
  clientType: string | null
}>()

const emit = defineEmits<{
  newSession: []
}>()

const clientLabels: Record<string, string> = {
  technique: 'Le Technique',
  facile: 'Le Facile',
  difficile: 'Le Difficile',
  neutre: 'Le Neutre',
}

function scoreColor(score: number): string {
  if (score >= 8) return '#22c55e'
  if (score >= 6) return '#f59e0b'
  if (score >= 4) return '#f97316'
  return '#ef4444'
}
</script>

<template>
  <div class="feedback-panel">
    <h2 class="feedback-title">Feedback de session</h2>
    <p class="feedback-subtitle" v-if="clientType">
      Client : {{ clientLabels[clientType] || clientType }}
    </p>

    <!-- Loading -->
    <div v-if="loading" class="feedback-loading">
      <div class="spinner" />
      <p>Analyse de ta performance en cours...</p>
    </div>

    <!-- Error -->
    <div v-else-if="feedback?.error" class="feedback-error">
      <p>{{ feedback.error }}</p>
    </div>

    <!-- Feedback content -->
    <div v-else-if="feedback" class="feedback-content">
      <!-- Score global -->
      <div class="score-global">
        <span class="score-number" :style="{ color: scoreColor(feedback.score_global) }">
          {{ feedback.score_global }}
        </span>
        <span class="score-label">/10</span>
      </div>

      <!-- Points forts -->
      <div v-if="feedback.points_forts?.length" class="feedback-section">
        <h3 class="section-label positive">Points forts</h3>
        <ul>
          <li v-for="point in feedback.points_forts" :key="point">{{ point }}</li>
        </ul>
      </div>

      <!-- A améliorer -->
      <div v-if="feedback.a_ameliorer?.length" class="feedback-section">
        <h3 class="section-label negative">À améliorer</h3>
        <ul>
          <li v-for="point in feedback.a_ameliorer" :key="point">{{ point }}</li>
        </ul>
      </div>

      <!-- Conseil clé -->
      <div v-if="feedback.conseil_cle" class="feedback-section conseil">
        <h3 class="section-label">Conseil clé</h3>
        <p>{{ feedback.conseil_cle }}</p>
      </div>

      <!-- Compétences détaillées -->
      <div v-if="feedback.competences" class="feedback-section">
        <h3 class="section-label">Compétences</h3>
        <div class="competences-grid">
          <div
            v-for="(value, key) in feedback.competences"
            :key="key"
            class="competence-item"
          >
            <div class="competence-header">
              <span class="competence-name">{{ key }}</span>
              <span
                v-if="value.score !== null"
                class="competence-score"
                :style="{ color: scoreColor(value.score) }"
              >
                {{ value.score }}/10
              </span>
              <span v-else class="competence-na">N/A</span>
            </div>
            <p v-if="value.commentaire" class="competence-comment">{{ value.commentaire }}</p>
          </div>
        </div>
      </div>
    </div>

    <button class="btn-new-session" @click="emit('newSession')">
      Nouveau pitch
    </button>
  </div>
</template>

<style scoped>
.feedback-panel {
  padding: 1rem 0;
}

.feedback-title {
  font-size: 1.3rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.feedback-subtitle {
  font-size: 0.85rem;
  color: #9ca3af;
  margin-bottom: 1.5rem;
}

.feedback-loading {
  text-align: center;
  padding: 3rem 1rem;
  color: #9ca3af;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e5e7eb;
  border-top-color: #1a1a2e;
  border-radius: 50%;
  margin: 0 auto 1rem;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.feedback-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 12px;
  padding: 1rem;
  color: #dc2626;
}

.score-global {
  text-align: center;
  margin-bottom: 1.5rem;
}

.score-number {
  font-size: 3rem;
  font-weight: 800;
}

.score-label {
  font-size: 1.5rem;
  color: #9ca3af;
}

.feedback-section {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 0.75rem;
}

.section-label {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
  color: #6b7280;
}

.section-label.positive { color: #22c55e; }
.section-label.negative { color: #ef4444; }

.feedback-section ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.feedback-section li {
  padding: 0.35rem 0;
  font-size: 0.9rem;
  border-bottom: 1px solid #f3f4f6;
}

.feedback-section li:last-child {
  border-bottom: none;
}

.conseil {
  background: #fffbeb;
  border-color: #fde68a;
}

.conseil p {
  font-size: 0.9rem;
  line-height: 1.5;
}

.competences-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.competence-item {
  padding: 0.5rem 0;
  border-bottom: 1px solid #f3f4f6;
}

.competence-item:last-child {
  border-bottom: none;
}

.competence-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.competence-name {
  font-size: 0.85rem;
  font-weight: 500;
}

.competence-score {
  font-weight: 700;
  font-size: 0.85rem;
}

.competence-na {
  font-size: 0.8rem;
  color: #d1d5db;
}

.competence-comment {
  font-size: 0.8rem;
  color: #6b7280;
  margin-top: 0.2rem;
}

.btn-new-session {
  display: block;
  width: 100%;
  margin-top: 1.5rem;
  padding: 1rem;
  font-size: 1.1rem;
  font-weight: 600;
  background: #1a1a2e;
  color: white;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  font-family: inherit;
}

.btn-new-session:hover {
  background: #2d2d4a;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add components/FeedbackPanel.vue
git commit -m "feat: add FeedbackPanel component for post-session notes"
```

---

### Task 13: Dashboard — enrich profile page

**Files:**
- Modify: `pages/profile.vue`
- Modify: `server/api/sessions.get.ts`

- [ ] **Step 1: Update sessions.get.ts to include scores**

```ts
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
```

- [ ] **Step 2: Rewrite profile.vue with dashboard**

```vue
<script setup lang="ts">
const user = useSupabaseUser()
const sessions = ref<any[]>([])
const loading = ref(true)
const selectedSession = ref<any>(null)

const totalSessions = computed(() => sessions.value.length)
const totalMinutes = computed(() =>
  Math.round(sessions.value.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / 60)
)

const averageScore = computed(() => {
  const scored = sessions.value.filter(s => s.score_global)
  if (!scored.length) return null
  return (scored.reduce((sum, s) => sum + s.score_global, 0) / scored.length).toFixed(1)
})

const recentAverage = computed(() => {
  const recent = sessions.value.filter(s => s.score_global).slice(0, 5)
  if (!recent.length) return null
  return (recent.reduce((sum, s) => sum + s.score_global, 0) / recent.length).toFixed(1)
})

// Competence averages from last 5 scored sessions
const competenceAverages = computed(() => {
  const scored = sessions.value.filter(s => s.scores?.length).slice(0, 5)
  if (!scored.length) return []

  const totals: Record<string, { sum: number; count: number }> = {}
  for (const session of scored) {
    for (const score of session.scores) {
      if (score.score === null) continue
      if (!totals[score.competence]) totals[score.competence] = { sum: 0, count: 0 }
      totals[score.competence].sum += score.score
      totals[score.competence].count++
    }
  }

  return Object.entries(totals)
    .map(([key, val]) => ({
      key,
      average: +(val.sum / val.count).toFixed(1),
    }))
    .sort((a, b) => a.average - b.average)
})

const clientLabels: Record<string, string> = {
  technique: 'Le Technique',
  facile: 'Le Facile',
  difficile: 'Le Difficile',
  neutre: 'Le Neutre',
}

const clientColors: Record<string, string> = {
  technique: '#3b82f6',
  facile: '#22c55e',
  difficile: '#ef4444',
  neutre: '#8b5cf6',
}

onMounted(async () => {
  if (!user.value) return
  try {
    sessions.value = await $fetch('/api/sessions', {
      params: { user_id: user.value.id },
    }) as any[]
  } catch (err) {
    console.error('Failed to load sessions:', err)
  } finally {
    loading.value = false
  }
})

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-CA', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number) {
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function scoreColor(score: number): string {
  if (score >= 8) return '#22c55e'
  if (score >= 6) return '#f59e0b'
  if (score >= 4) return '#f97316'
  return '#ef4444'
}
</script>

<template>
  <div>
    <h2 class="page-title">Mon Profil</h2>

    <!-- Stats Overview -->
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-value">{{ totalSessions }}</span>
        <span class="stat-label">Sessions</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ totalMinutes }}</span>
        <span class="stat-label">Minutes</span>
      </div>
      <div class="stat-card" v-if="averageScore">
        <span class="stat-value" :style="{ color: scoreColor(+averageScore) }">{{ averageScore }}</span>
        <span class="stat-label">Score moyen</span>
      </div>
      <div class="stat-card" v-if="recentAverage">
        <span class="stat-value" :style="{ color: scoreColor(+recentAverage) }">{{ recentAverage }}</span>
        <span class="stat-label">5 dernières</span>
      </div>
    </div>

    <!-- Competences -->
    <div class="section" v-if="competenceAverages.length">
      <h3 class="section-title">Compétences (5 dernières sessions)</h3>
      <div class="competence-list">
        <div v-for="comp in competenceAverages" :key="comp.key" class="competence-bar-item">
          <div class="competence-bar-header">
            <span class="competence-bar-name">{{ comp.key }}</span>
            <span class="competence-bar-score" :style="{ color: scoreColor(comp.average) }">
              {{ comp.average }}
            </span>
          </div>
          <div class="competence-bar-track">
            <div
              class="competence-bar-fill"
              :style="{ width: (comp.average * 10) + '%', background: scoreColor(comp.average) }"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="section" v-else-if="!loading">
      <h3 class="section-title">Compétences</h3>
      <div class="placeholder-card">
        <p>Pas encore de scores.</p>
        <p class="placeholder-sub">Termine une session avec feedback pour voir tes compétences ici.</p>
      </div>
    </div>

    <!-- Score Progression Chart -->
    <div class="section" v-if="sessions.filter(s => s.score_global).length >= 2">
      <h3 class="section-title">Progression</h3>
      <div class="chart-container">
        <div class="chart">
          <div
            v-for="(s, i) in [...sessions].reverse().filter(s => s.score_global)"
            :key="i"
            class="chart-bar-wrapper"
          >
            <div
              class="chart-bar"
              :style="{
                height: (s.score_global * 10) + '%',
                background: scoreColor(s.score_global),
              }"
            >
              <span class="chart-bar-label">{{ s.score_global }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Session History -->
    <div class="section">
      <h3 class="section-title">Historique des sessions</h3>

      <div v-if="loading" class="loading">Chargement...</div>

      <div v-else-if="sessions.length === 0" class="placeholder-card">
        <p>Aucune session enregistrée.</p>
        <p class="placeholder-sub">Commence un pitch pour voir ton historique ici.</p>
      </div>

      <div v-else class="session-list">
        <div
          v-for="session in sessions"
          :key="session.id"
          class="session-item"
          :class="{ expanded: selectedSession?.id === session.id }"
          @click="selectedSession = selectedSession?.id === session.id ? null : session"
        >
          <div class="session-row">
            <div class="session-info">
              <span class="session-type" :style="{ color: clientColors[session.client_type] }">
                {{ clientLabels[session.client_type] || session.client_type }}
              </span>
              <span class="session-date">{{ formatDate(session.created_at) }}</span>
            </div>
            <div class="session-meta">
              <span
                v-if="session.score_global"
                class="session-score"
                :style="{ color: scoreColor(session.score_global) }"
              >
                {{ session.score_global }}/10
              </span>
              <span class="session-duration">{{ formatDuration(session.duration_seconds) }}</span>
            </div>
          </div>

          <!-- Expanded: transcript + feedback -->
          <div v-if="selectedSession?.id === session.id" class="session-detail">
            <div v-if="session.feedback_json" class="detail-feedback">
              <h4>Feedback</h4>
              <div v-for="point in (JSON.parse(session.feedback_json).points_forts || [])" :key="point" class="detail-point positive">
                {{ point }}
              </div>
              <div v-for="point in (JSON.parse(session.feedback_json).a_ameliorer || [])" :key="point" class="detail-point negative">
                {{ point }}
              </div>
              <p v-if="JSON.parse(session.feedback_json).conseil_cle" class="detail-conseil">
                {{ JSON.parse(session.feedback_json).conseil_cle }}
              </p>
            </div>
            <div v-if="session.transcript" class="detail-transcript">
              <h4>Transcript</h4>
              <div v-for="(msg, i) in JSON.parse(session.transcript)" :key="i" class="detail-msg">
                <strong>{{ msg.role === 'user' ? 'Vous' : 'Client' }}:</strong> {{ msg.text }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 0.75rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem;
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
  color: #1a1a2e;
}

.stat-label {
  font-size: 0.8rem;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.section {
  margin-bottom: 2rem;
}

.section-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 0.75rem;
}

.placeholder-card {
  background: white;
  border: 1px dashed #d1d5db;
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  color: #6b7280;
}

.placeholder-sub {
  font-size: 0.85rem;
  color: #9ca3af;
  margin-top: 0.25rem;
}

.loading {
  text-align: center;
  color: #9ca3af;
  padding: 2rem;
}

/* Competence bars */
.competence-list {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem;
}

.competence-bar-item {
  margin-bottom: 0.75rem;
}

.competence-bar-item:last-child {
  margin-bottom: 0;
}

.competence-bar-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}

.competence-bar-name {
  font-size: 0.8rem;
  color: #4b5563;
}

.competence-bar-score {
  font-size: 0.8rem;
  font-weight: 700;
}

.competence-bar-track {
  height: 6px;
  background: #f3f4f6;
  border-radius: 3px;
  overflow: hidden;
}

.competence-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}

/* Chart */
.chart-container {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem;
}

.chart {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 120px;
}

.chart-bar-wrapper {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: flex-end;
}

.chart-bar {
  width: 100%;
  border-radius: 4px 4px 0 0;
  position: relative;
  min-height: 10%;
  transition: height 0.3s;
}

.chart-bar-label {
  position: absolute;
  top: -18px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.7rem;
  font-weight: 600;
  color: #6b7280;
}

/* Session list */
.session-list {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
}

.session-item {
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer;
  transition: background 0.1s;
}

.session-item:hover {
  background: #fafafa;
}

.session-item:last-child {
  border-bottom: none;
}

.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
}

.session-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.session-type {
  font-weight: 600;
  font-size: 0.9rem;
}

.session-date {
  font-size: 0.8rem;
  color: #9ca3af;
}

.session-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.session-score {
  font-weight: 700;
  font-size: 0.85rem;
}

.session-duration {
  font-size: 0.85rem;
  font-weight: 500;
  color: #6b7280;
  background: #f3f4f6;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
}

/* Session detail (expanded) */
.session-detail {
  padding: 0 1rem 1rem;
  border-top: 1px solid #f3f4f6;
}

.session-detail h4 {
  font-size: 0.8rem;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  margin: 0.75rem 0 0.5rem;
}

.detail-point {
  font-size: 0.85rem;
  padding: 0.25rem 0;
}

.detail-point.positive { color: #16a34a; }
.detail-point.negative { color: #dc2626; }

.detail-conseil {
  font-size: 0.85rem;
  color: #92400e;
  background: #fffbeb;
  padding: 0.5rem;
  border-radius: 8px;
  margin-top: 0.5rem;
}

.detail-transcript {
  max-height: 200px;
  overflow-y: auto;
}

.detail-msg {
  font-size: 0.8rem;
  padding: 0.2rem 0;
  color: #4b5563;
}
</style>
```

- [ ] **Step 3: Commit**

```bash
git add pages/profile.vue server/api/sessions.get.ts
git commit -m "feat: add dashboard with scores, competence bars, progression chart"
```

---

### Task 14: Remove old OpenAI Realtime endpoint

**Files:**
- Delete: `server/api/session.post.ts`

- [ ] **Step 1: Delete the old endpoint**

```bash
rm C:/Users/adama/pitch-practice/server/api/session.post.ts
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove old OpenAI Realtime session endpoint"
```

---

### Task 15: Integration test — run the app

- [ ] **Step 1: Verify .env has both keys**

Check that `.env` contains:
```
NUXT_OPENAI_API_KEY=sk-...
NUXT_DEEPGRAM_API_KEY=...
```

- [ ] **Step 2: Start the dev server**

```bash
cd C:/Users/adama/pitch-practice && npm run dev
```

- [ ] **Step 3: Test the flow**

1. Open http://localhost:3000
2. Login
3. Select a client type (Le Facile)
4. Click "Commencer le pitch"
5. Speak into the mic — verify VAD detects speech, STT transcribes, LLM responds, TTS plays audio
6. Click "Arrêter + Feedback" — verify feedback generates and displays
7. Go to Profile — verify scores and session history appear

- [ ] **Step 4: Fix any issues found during testing**

Debug and fix as needed. Common issues:
- WebSocket connection fails → check nitro websocket experimental flag
- VAD doesn't start → check browser mic permissions
- Deepgram errors → check API key and encoding settings
- TTS audio doesn't play → check PCM format conversion

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix: integration fixes from end-to-end testing"
```

- [ ] **Step 6: Push to GitHub**

```bash
git push
```
