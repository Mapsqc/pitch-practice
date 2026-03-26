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
