# Pipeline Vocal + Feedback Intelligent - Design Spec

## Contexte

L'app pitch-practice utilise actuellement `gpt-4o-mini-realtime-preview` via WebRTC pour simuler des clients en porte-a-porte. Problemes identifies :

1. **Sort du role** - le modele mini ne suit pas bien les instructions, se met a vendre
2. **Pas realiste** - reactions non naturelles
3. **Feedback inutile** - vague, pas base sur de vraies techniques de vente
4. **Voix/latence mauvaise** - delai, qualite audio mediocre
5. **Cout eleve** - les tokens audio realtime sont tres chers ($1-3/session)

## Solution

Remplacer la connexion WebRTC directe a OpenAI Realtime par un **pipeline STT + LLM + TTS** orchestre cote serveur, avec un systeme de **feedback structure** base sur un JSON de theorie de vente de 83 items.

## Architecture du pipeline vocal

```
Browser                          Serveur Nuxt                    Services externes
-------                          -------------                   ------------------
Micro user
   |
Silero VAD (client)
   | (detecte fin de parole)
   |------- WebSocket ---------> Endpoint /api/pipeline
                                    |
                                    |------ WebSocket --------> Deepgram Nova-2 (STT)
                                    |<----- transcript ---------|
                                    |
                                    |------ HTTP stream ------> GPT-4o-mini text (LLM)
                                    |<----- tokens stream ------|
                                    |
                                    |------ HTTP stream ------> OpenAI TTS (streaming)
                                    |<----- audio chunks -------|
                                    |
   |<------ WebSocket -----------|
TalkingHead (lip-sync + playback)
```

### Latence cible : 1-1.3 secondes

| Etape | Latence |
|-------|---------|
| Silero VAD (detection fin de parole) | ~200ms |
| Deepgram STT (streaming) | ~300ms |
| LLM premier token | ~300ms |
| TTS premier chunk audio | ~200ms |
| **Total** | **~1-1.3s** |

### Cout cible : ~$0.05-0.15 par session de 5 min

| Service | Cout |
|---------|------|
| Deepgram Nova-2 | ~$0.004/min |
| GPT-4o-mini text | ~$0.15/1M input, $0.60/1M output |
| OpenAI TTS | ~$15/1M chars |
| **Total ~5 min** | **~$0.05-0.15** |

## Systeme de prompts - 3 couches

### Couche 1 : Personnage client (system prompt)

Les 4 types de clients existants sont conserves et ameliores :
- **Le Technique** - curieux, pose des questions pointues une a la fois
- **Le Facile** - ouvert mais passif, dit "ah ouin?", "ok"
- **Le Difficile** - sceptique, objections realistes, mais convaincable
- **Le Neutre** - poli, ecoute, repond par des "hmm", "je sais pas"

Les regles de base sont gardees : le client ne sait pas pourquoi le vendeur est la, repond court, ne facilite pas la vie du vendeur, parle en quebecois naturel.

### Couche 2 : Connaissance du service (extraite du JSON, content_type: "service")

Le client recoit un resume des services d'Insight (application liquide, granulation, traitement guepes, rongeurs, etc.) pour :
- Reagir de facon realiste quand le vendeur mentionne un produit
- Poser des objections coherentes
- Ne pas inventer d'informations sur le service

Le client ne mentionne JAMAIS ces informations en premier. Il les utilise uniquement pour reagir.

### Couche 3 : Conscience des techniques de vente (extraite du JSON, content_type: "sales")

Le client recoit un resume des techniques de vente pour y reagir naturellement :
- Name Labeling : reagir comme un humain qui se fait poser une question d'identite
- Third Party : "Ah ouin, Jean d'a cote fait affaire avec vous ?"
- Smokescreens : les sortir naturellement au bon moment selon le type de client
- Objections : utiliser les objections realistes documentees dans le JSON

### Format audio WebSocket

- Browser → Serveur : PCM 16-bit 16kHz mono (raw audio du micro, apres VAD)
- Serveur → Deepgram : meme format PCM forwarde directement
- Serveur → Browser : chunks audio MP3 ou PCM retournes par OpenAI TTS, forwardes au TalkingHead

### Pre-processing du JSON

Au demarrage du serveur, le JSON (83 items, ~390KB) est parse et condense en sections :
- Section service : resume des produits/traitements (~2-3KB)
- Section techniques : resume des concepts de vente cles (~3-5KB)
- Les sections sont filtrees selon le type de client choisi

Le JSON complet n'est PAS injecte dans chaque prompt. Seules les sections pertinentes condensees le sont.

## Systeme de feedback post-session

### Declenchement

Le feedback est genere quand l'utilisateur clique "Arreter" ou "Feedback".

### Pipeline de feedback

1. Le transcript complet est envoye a **GPT-4o** (modele puissant, pas le mini)
2. Avec le type de client choisi
3. Avec les sections pertinentes du JSON de theorie de vente

### Competences evaluees

| Competence | Source dans le JSON |
|---|---|
| Premiere impression / body language | Intro Pitch - Etape 1 |
| Briser la glace | Intro Pitch - Etape 2 |
| Presentation (Qui?) | Intro Pitch - Etape 3 |
| Third Party (Quoi?) | Intro Pitch - Etape 4 |
| Situation des nuisibles (Pourquoi?) | Intro Pitch - Etape 5 |
| Close / sortir un smokescreen | Intro Pitch - Etape 6 |
| Gestion des smokescreens | Surmonter les Smokescreens |
| Resolution d'objections (RAC) | Resoudre les objections |
| Name Labeling | Advanced training |
| Synchronisation / rapport | La communication |
| Explication du prix | Explication du prix |
| Connaissance du service | Detail des produits |

### Format de sortie

Le LLM retourne un JSON structure :
```json
{
  "score_global": 7,
  "competences": {
    "intro_pitch": {
      "score": 8,
      "commentaire": "Bon third party, t'as nomme des vrais voisins"
    },
    "smokescreens": {
      "score": 5,
      "commentaire": "Le client t'a dit 'j'en ai pas besoin' et t'as freeze"
    }
  },
  "points_forts": ["Bonne energie", "Third party credible"],
  "a_ameliorer": ["Repondre aux smokescreens plus vite", "Utiliser le name labeling"],
  "conseil_cle": "Quand le client dit 'j'en ai pas besoin', c'est un smokescreen classique..."
}
```

### Affichage

Le feedback est affiche **en texte** dans l'interface, comme une note structuree. Pas d'audio.

### Sauvegarde

Les scores et le feedback complet sont sauvegardes dans SQLite pour alimenter le dashboard et permettre de relire les notes.

## Dashboard de progression

### Page Profil (enrichie)

**Vue d'ensemble :**
- Score moyen global (evolution 7/30 jours)
- Nombre total de sessions
- Temps total de pratique

**Graphique de progression :**
- Line chart simple : score global par session au fil du temps

**Scores par competence :**
- Les ~12 competences, chacune avec :
  - Score actuel (moyenne des 5 dernieres sessions)
  - Tendance (monte, stable, descend)
  - Le score le plus faible mis en evidence comme priorite

**Historique des sessions :**
- Liste : date, type de client, score, duree
- Clic sur une session : affiche transcript + note de feedback

### Ce qu'on ne fait PAS
- Pas de gamification
- Pas de badges
- Pas de comparaison entre users

## Stack technique

### Services externes

| Service | Role | Alternative |
|---|---|---|
| Deepgram Nova-2 | STT streaming | Whisper API |
| GPT-4o-mini text | LLM client (roleplay) | Claude Haiku |
| GPT-4o | LLM feedback (analyse) | Claude Sonnet |
| OpenAI TTS | Text-to-speech streaming | ElevenLabs Turbo |

### Comptes necessaires

- **OpenAI** : deja existant (meme API key pour LLM + TTS)
- **Deepgram** : nouveau compte a creer ($200 credits gratuits au signup)

### Cote serveur (Nuxt 3)

- `/api/pipeline` : WebSocket orchestrant STT -> LLM -> TTS en streaming
- `/api/feedback` : endpoint POST envoyant transcript + theorie au LLM puissant
- `server/utils/theory-parser.ts` : parse le JSON au demarrage, condense en sections
- `server/utils/db.ts` : nouvelles tables pour scores et feedback

### Cote client (browser)

- `@ricky0123/vad-web` : Silero VAD pour detection de parole
- WebSocket vers `/api/pipeline` pour envoyer/recevoir audio
- TalkingHead : garde tel quel pour lip-sync
- Chart simple (CSS ou Chart.js) pour le dashboard

### Nouvelles tables SQLite

```sql
-- Scores par competence par session
CREATE TABLE session_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES sessions(id),
  competence TEXT NOT NULL,
  score INTEGER NOT NULL,
  commentaire TEXT
);

-- Feedback complet par session
ALTER TABLE sessions ADD COLUMN feedback_json TEXT;
ALTER TABLE sessions ADD COLUMN score_global INTEGER;
```

## Ce qui est garde de l'existant

- Supabase auth (login, signup, confirm)
- Les 4 types de clients et leurs prompts (ameliores)
- TalkingHead avatar + lip-sync
- SQLite pour les sessions
- Layout et style de l'interface

## Ce qui est retire

- Connexion WebRTC directe a OpenAI Realtime API
- Modele `gpt-4o-mini-realtime-preview`
- Cle ephemere et data channel OpenAI

## Ce qui est ajoute

- Pipeline vocal STT + LLM + TTS
- Silero VAD cote client
- WebSocket serveur
- Parser de theorie JSON
- Systeme de feedback structure
- Dashboard de progression
- Nouvelles tables DB
