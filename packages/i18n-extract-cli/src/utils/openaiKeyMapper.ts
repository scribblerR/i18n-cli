import https from 'https'
import { URL } from 'url'

type OpenAIConfig = {
  baseUrl?: string
  apiKey?: string
  model?: string
}

function toSnakeCase(input: string): string {
  const ascii = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
  if (!ascii) return ''
  return ascii
    .split(/\s+/)
    .map((s) => s.toLowerCase())
    .join('_')
}

function ensureUniqueKeys(map: Record<string, string>): Record<string, string> {
  const used = new Set<string>()
  const result: Record<string, string> = {}
  Object.keys(map).forEach((k) => {
    let key = map[k]
    if (!key) key = toSnakeCase(k)
    if (!key) key = 'key'
    let candidate = key
    let i = 1
    while (used.has(candidate)) {
      candidate = `${key}_${i++}`
    }
    used.add(candidate)
    result[k] = candidate
  })
  return result
}

function postJSON(url: string, headers: Record<string, string>, body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request(
      {
        method: 'POST',
        hostname: u.hostname,
        path: u.pathname + (u.search || ''),
        port: u.port || 443,
        headers: Object.assign({ 'content-type': 'application/json' }, headers),
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json)
            } else {
              reject(new Error(`OpenAI API error ${res.statusCode}: ${JSON.stringify(json)}`))
            }
          } catch (e) {
            reject(e)
          }
        })
      }
    )
    req.on('error', reject)
    req.write(JSON.stringify(body))
    req.end()
  })
}

export async function generateSemanticSnakeCaseKeys(
  originals: string[],
  config: OpenAIConfig,
  reservedKeys: Set<string> = new Set()
): Promise<Record<string, string>> {
  const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
  const apiKey = config.apiKey || ''
  const model = config.model || 'gpt-4o-mini'

  if (!apiKey) {
    // Fallback to simple snake_case of pinyin-less ASCII approximation (may be empty)
    const naive: Record<string, string> = {}
    originals.forEach((o, idx) => {
      const s = toSnakeCase(o) || `key_${idx + 1}`
      naive[o] = s
    })
    const ensured = ensureUniqueKeys(naive)
    const adjusted: Record<string, string> = {}
    const used = new Set<string>(reservedKeys)
    Object.keys(ensured).forEach((k) => {
      const val = ensured[k]
      let cand = val
      let i = 2
      while (used.has(cand)) {
        cand = `${val}_${i++}`
      }
      used.add(cand)
      adjusted[k] = cand
    })
    return adjusted
  }

  const system =
    'You generate concise, descriptive, unique snake_case keys in English from Chinese UI strings.'
  const instruction = `Rules:
- Output ONLY a JSON object mapping each original Chinese string to an English snake_case key.
- Keys must be short, semantic, and suitable for i18n dictionaries.
- Use lowercase letters, digits, and underscores only. Start with a letter if possible.
- Ensure uniqueness. If collisions occur, append a numeric suffix starting at 2.
- Do not translate variable placeholders like {slot1}; reflect them in the key meaning (e.g., add "by_name" etc.)`

  const items = originals.slice(0)
  const reserved = Array.from(reservedKeys)
  const user = `Original strings (JSON array):\n${JSON.stringify(
    items,
    null,
    2
  )}\nReserved keys (JSON array):\n${JSON.stringify(reserved, null, 2)}\n${instruction}`

  try {
    const url = `${baseUrl}/chat/completions`
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
    }
    const body = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0,
    }
    const json = await postJSON(url, headers, body)
    const content: string = json?.choices?.[0]?.message?.content || '{}'
    let parsed: Record<string, string> | undefined
    try {
      parsed = JSON.parse(content)
    } catch (e) {
      // Try to extract JSON block
      const match = content.match(/\{[\s\S]*\}/)
      if (match) {
        parsed = JSON.parse(match[0])
      }
    }
    const result: Record<string, string> = {}
    if (parsed) {
      originals.forEach((o, idx) => {
        const v = parsed && (parsed as Record<string, string>)[o]
        result[o] =
          typeof v === 'string' && v.trim() ? v.trim() : toSnakeCase(o) || `key_${idx + 1}`
      })
      const unique = ensureUniqueKeys(result)
      const adjusted: Record<string, string> = {}
      const used = new Set<string>(reservedKeys)
      Object.keys(unique).forEach((k) => {
        const val = unique[k]
        let cand = val
        let i = 2
        while (used.has(cand)) {
          cand = `${val}_${i++}`
        }
        used.add(cand)
        adjusted[k] = cand
      })
      return adjusted
    }
  } catch (e) {
    // ignore and fallback
  }

  const fallback: Record<string, string> = {}
  originals.forEach((o, idx) => {
    fallback[o] = toSnakeCase(o) || `key_${idx + 1}`
  })
  const ensured = ensureUniqueKeys(fallback)
  const adjusted: Record<string, string> = {}
  const used = new Set<string>(reservedKeys)
  Object.keys(ensured).forEach((k) => {
    const val = ensured[k]
    let cand = val
    let i = 2
    while (used.has(cand)) {
      cand = `${val}_${i++}`
    }
    used.add(cand)
    adjusted[k] = cand
  })
  return adjusted
}
