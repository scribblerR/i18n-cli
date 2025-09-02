import type { OpenAIConfig } from '../../types'
import log from './log'

interface OpenAIKeyGeneratorOptions {
  baseUrl?: string
  apiKey?: string
  model?: string
}

export class OpenAIKeyGenerator {
  private baseUrl: string
  private apiKey: string
  private model: string

  constructor(options: OpenAIKeyGeneratorOptions = {}) {
    this.baseUrl = options.baseUrl || 'https://api.openai.com/v1'
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || ''
    this.model = options.model || 'gpt-4o-mini'

    if (!this.apiKey) {
      throw new Error('OpenAI API key is required for key generation')
    }
  }

  /**
   * 使用 OpenAI 生成国际化 key
   * @param chineseText 中文文本
   * @param filePath 文件路径，用于提供上下文
   * @returns 生成的 key
   */
  async generateKey(chineseText: string, filePath?: string): Promise<string> {
    // 从文件路径中提取上下文信息
    const context = this.extractContextFromPath(filePath)

    try {
      const fetchImpl = (await import('node-fetch')).default as any

      const prompt = this.buildPrompt(chineseText, context)
      log.info(`OpenAI prompt: ${prompt}`)
      const response = await fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are an i18n key generator. Output ONE key in snake_case using ONLY lowercase English letters, numbers, and underscores.

FORMAT:
- {module}_{description}

RULES:
1. Use only [a-z0-9_]; no Chinese, spaces, or special characters
2. The module should be derived from the provided module context (if given); otherwise infer a concise module from the text
3. The description should capture the core meaning of the Chinese text using concise nouns/verbs; omit politeness like "please"
4. Avoid generic or UI-specific prefixes such as: column, status, action, field, validation, placeholder, drawer_title
5. Do not repeat words already present in the module within the description

Return ONLY the key.`,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0,
          // max_tokens: 100,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        log.error('OpenAI key generation request failed:', errorText)
        throw new Error('openai_request_failed')
      }

      const data = await response.json()
      const generatedKey = data?.choices?.[0]?.message?.content?.trim() || ''
      log.info(`OpenAI generated key: ${generatedKey}`)
      if (!generatedKey) {
        log.error('OpenAI returned empty key')
        throw new Error('openai_empty_key')
      }

      // 规范化并清理生成的 key，确保无中文且为 snake_case，且包含模块前缀
      const normalizedKey = this.sanitizeKey(generatedKey, context)

      // 验证生成的 key 格式
      if (!this.isValidKey(normalizedKey)) {
        log.error(
          `Generated key "${generatedKey}" normalized to "${normalizedKey}" doesn't match expected format`
        )
        throw new Error('openai_invalid_key_format')
      }

      log.verbose(`Generated key: ${normalizedKey} for text: ${chineseText}`)
      return normalizedKey
    } catch (error) {
      log.error('OpenAI key generation error:', error)
      throw error
    }
  }

  /**
   * 从文件路径中提取上下文信息
   */
  private extractContextFromPath(filePath?: string): string {
    if (!filePath) return ''

    const pathSegments = filePath.replace(/\\/g, '/').split('/')

    // 选择 pages 下的第一个目录作为模块名
    const pagesIndex = pathSegments.findIndex((seg) => seg === 'pages')
    let moduleSegment = ''
    if (pagesIndex !== -1 && pathSegments[pagesIndex + 1]) {
      moduleSegment = pathSegments[pagesIndex + 1]
    } else {
      // 兜底：找第一个包含 Management/Page/Settings 的段
      const fallback = pathSegments.find((seg) => /Management|Page|Settings/.test(seg))
      if (fallback) moduleSegment = fallback
    }

    // 移除扩展名并转 snake_case
    moduleSegment = moduleSegment.replace(/\.(tsx|ts|js|jsx)$/i, '')
    moduleSegment = moduleSegment.replace(/([A-Z])/g, '_$1').replace(/^_/, '')

    return moduleSegment
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
  }

  /**
   * 构建给 OpenAI 的提示词
   */
  private buildPrompt(chineseText: string, context: string): string {
    let prompt = `Chinese text: "${chineseText}"`

    if (context) {
      prompt += `\nModule context: ${context}`
    }

    // Keep prompt generic; avoid domain-specific hints

    return prompt
  }

  /**
   * 清理并补全 OpenAI 返回的 key，确保 {module}_{description}
   */
  private sanitizeKey(key: string, context: string): string {
    // 基础清理
    let cleaned = key
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/-/g, '_')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')

    // 确保包含模块部分
    if (context) {
      const safeContext = context
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/-/g, '_')
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')

      if (cleaned && !cleaned.startsWith(`${safeContext}_`) && cleaned !== safeContext) {
        // 前缀完整的描述，不要丢失已生成的内容
        cleaned = `${safeContext}_${cleaned}`
      } else if (!cleaned) {
        cleaned = safeContext
      }
    }

    if (!/^[a-z]/.test(cleaned)) {
      cleaned = `key_${cleaned}`
    }

    return cleaned
  }

  /**
   * 验证生成的 key 是否符合格式要求
   */
  private isValidKey(key: string): boolean {
    // 检查是否为 snake_case 格式，且只包含英文字符
    const snakeCaseRegex = /^[a-z][a-z0-9_]*[a-z0-9]$/
    const hasOnlyEnglish = /^[a-z0-9_]+$/.test(key)
    const hasChinese = /[\u4e00-\u9fa5]/.test(key)

    return snakeCaseRegex.test(key) && hasOnlyEnglish && !hasChinese && key.length > 3
  }

  // Fallback generation removed per requirements
}

/**
 * 创建默认的 OpenAI key 生成器实例
 */
export function createOpenAIKeyGenerator(config?: OpenAIConfig): OpenAIKeyGenerator {
  return new OpenAIKeyGenerator(config)
}
