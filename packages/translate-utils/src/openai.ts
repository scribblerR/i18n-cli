import https from 'https'
import { URL } from 'url'

export interface OpenAIConfig {
  baseUrl?: string
  apiKey?: string
  model?: string
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

/**
 * Translate text using OpenAI Chat Completions.
 * Input may contain multiple lines separated by \n; output must preserve the same line count and order.
 */
export async function openaiTranslate(
  word: string,
  originLang: string,
  targetLang: string,
  option: OpenAIConfig
): Promise<string> {
  const baseUrl = (option.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
  const apiKey = option.apiKey || ''
  const model = option.model || 'gpt-4o-mini'

  if (!apiKey) {
    // No API key; return empty string to signal failure to caller
    return ''
  }

  const system =
    'You are a professional localization engine. Translate strictly and preserve placeholders.'
  const instruction = `Rules:\n- Source language: ${originLang}; Target language: ${targetLang}.\n- Input text may contain multiple lines separated by a single newline (\\n).\n- Output MUST contain exactly the same number of lines, in the same order.\n- Do not merge or split lines.\n- Preserve variables/placeholders like {{var}}, {var}, {0}, %s, %1$s literally.\n- Preserve leading/trailing spaces on each line.\n- Do not add explanations.`

  const user = `Text to translate (verbatim):\n\n${word}\n\n${instruction}`

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
  const content: string = json?.choices?.[0]?.message?.content || ''
  return content
}
