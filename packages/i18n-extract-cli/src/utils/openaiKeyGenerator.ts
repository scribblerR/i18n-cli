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

      const prompt = this.buildPrompt(chineseText, context, filePath)

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
              content: `You are a professional i18n key generator. Generate semantic, descriptive keys in snake_case format for internationalization.

CRITICAL REQUIREMENTS:
1. MUST use ONLY English characters (a-z, 0-9, underscore)
2. MUST use snake_case format (lowercase with underscores)
3. NO Chinese characters, NO special characters, NO spaces
4. Be descriptive and semantic
5. Include context when relevant
6. Avoid generic words like "column", "status", "action", "field", "validation", "placeholder", "drawer_title"
7. Follow patterns like: {module}_{action}_{description} or {page}_{component}_{action}

Examples of good keys:
- project_setting_select_tiktok_account
- project_setting_select_awin_account
- project_setting_loading
- not_access_page_tip
- account_management_add_success
- authorization_management_create
- customer_project_management_detail_account_management
- customer_project_management_entity (for "客户主体" or "主体")

For Chinese words, translate their meaning:
- 主体 -> entity
- 客户 -> customer
- 客户主体 -> entity (since it means "customer entity" but should be simplified)
- 选择 -> select
- 请选择 -> select (remove the "please" for brevity)
- 管理 -> management
- 设置 -> setting
- 加载 -> loading
- 加载中 -> loading
- 创建 -> create
- 删除 -> delete
- 编辑 -> edit
- 确认 -> confirm
- 取消 -> cancel
- 搜索 -> search
- 账户 -> account
- 账号 -> account

IMPORTANT: For compound phrases like "搜索选择客户主体", focus on the core meaning and context.
Example: "搜索选择客户主体" in CustomerProjectManagement context should become "customer_project_management_entity"

Return ONLY the English key in snake_case format, no explanations or additional text.`,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 100,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        log.error('OpenAI key generation request failed:', errorText)
        return this.fallbackKeyGeneration(chineseText, context)
      }

      const data = await response.json()
      const generatedKey = data?.choices?.[0]?.message?.content?.trim() || ''

      if (!generatedKey) {
        log.error('OpenAI returned empty key')
        return this.fallbackKeyGeneration(chineseText, context)
      }

      // 验证生成的 key 格式
      if (!this.isValidKey(generatedKey)) {
        log.error(`Generated key "${generatedKey}" doesn't match expected format, using fallback`)
        return this.fallbackKeyGeneration(chineseText, context)
      }

      log.verbose(`Generated key: ${generatedKey} for text: ${chineseText}`)
      return generatedKey
    } catch (error) {
      log.error('OpenAI key generation error:', error)
      return this.fallbackKeyGeneration(chineseText, context)
    }
  }

  /**
   * 从文件路径中提取上下文信息
   */
  private extractContextFromPath(filePath?: string): string {
    if (!filePath) return ''

    const pathSegments = filePath.replace(/\\/g, '/').split('/')
    const relevantSegments: string[] = []

    // 提取有意义的路径段
    for (let i = 0; i < pathSegments.length; i++) {
      const segment = pathSegments[i]

      // 跳过常见的无意义路径段
      if (['src', 'pages', 'components', 'index.tsx', 'index.ts', 'index.js'].includes(segment)) {
        continue
      }

      // 提取页面和组件名称
      if (
        segment.includes('Management') ||
        segment.includes('Page') ||
        segment.includes('Settings')
      ) {
        relevantSegments.push(segment)
      } else if (i > 0 && pathSegments[i - 1] === 'pages') {
        relevantSegments.push(segment)
      } else if (i > 0 && pathSegments[i - 1] === 'components') {
        relevantSegments.push(segment)
      }
    }

    return relevantSegments.join('_').toLowerCase()
  }

  /**
   * 构建给 OpenAI 的提示词
   */
  private buildPrompt(chineseText: string, context: string, filePath?: string): string {
    let prompt = `Chinese text: "${chineseText}"`

    if (context) {
      prompt += `\nModule context: ${context}`
    }

    if (filePath) {
      prompt += `\nFile path: ${filePath}`
    }

    // 为特定的文本提供额外的上下文提示
    if (chineseText.includes('客户主体') || chineseText.includes('主体')) {
      prompt += `\nNote: "主体" or "客户主体" refers to business entity, use "entity" in the key`
    }

    if (chineseText.includes('搜索') && chineseText.includes('选择')) {
      prompt += `\nNote: This appears to be about searching/selecting, focus on the main object being selected`
    }

    return prompt
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

  /**
   * 备用 key 生成方法（当 OpenAI 失败时使用）
   */
  private fallbackKeyGeneration(chineseText: string, context: string): string {
    // 扩展的中文到英文翻译映射
    const translationMap: Record<string, string> = {
      // 基础动作
      加载中: 'loading',
      确认: 'confirm',
      取消: 'cancel',
      保存: 'save',
      删除: 'delete',
      编辑: 'edit',
      添加: 'add',
      创建: 'create',
      更新: 'update',
      成功: 'success',
      失败: 'failed',
      错误: 'error',
      警告: 'warning',
      提示: 'tip',

      // 业务相关
      设置: 'setting',
      管理: 'management',
      账户: 'account',
      账号: 'account',
      项目: 'project',
      授权: 'authorization',
      选择: 'select',
      请选择: 'please_select',
      请输入: 'please_enter',

      // 特定业务词汇
      主体: 'entity',
      客户: 'customer',
      客户主体: 'customer_entity',
      搜索: 'search',
      查找: 'search',
      筛选: 'filter',
      关联: 'associate',
      移除: 'remove',
      禁用: 'disable',
      启用: 'enable',
      刷新: 'refresh',
      详情: 'detail',
      列表: 'list',
    }

    let keyParts: string[] = []

    // 添加上下文前缀
    if (context) {
      keyParts.push(context)
    }

    // 处理中文文本
    let remainingText = chineseText.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, '').trim()

    // 尝试匹配完整短语
    for (const [chinese, english] of Object.entries(translationMap)) {
      if (remainingText.includes(chinese)) {
        keyParts.push(english)
        remainingText = remainingText.replace(chinese, '').trim()
      }
    }

    // 如果还有未处理的文本，尝试逐字匹配
    if (remainingText) {
      const singleCharMap: Record<string, string> = {
        选: 'select',
        择: 'choose',
        客: 'customer',
        户: 'user',
        主: 'main',
        体: 'entity',
        搜: 'search',
        索: 'index',
        创: 'create',
        建: 'build',
        管: 'manage',
        理: 'manage',
        设: 'set',
        置: 'config',
      }

      const chars = remainingText.split('')
      let translatedPart = ''

      for (const char of chars) {
        if (singleCharMap[char]) {
          translatedPart += singleCharMap[char] + '_'
        }
      }

      if (translatedPart) {
        keyParts.push(translatedPart.replace(/_+/g, '_').replace(/_$/, ''))
      }
    }

    // 如果没有生成任何部分，使用默认值
    if (keyParts.length === 0) {
      keyParts = [context || 'generated', 'text']
    }

    // 组合并清理 key
    let finalKey = keyParts
      .filter((part) => part && part.length > 0)
      .join('_')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '') // 移除非英文字符
      .replace(/_+/g, '_') // 合并多个下划线
      .replace(/^_|_$/g, '') // 移除首尾下划线

    // 确保 key 以字母开头
    if (!/^[a-z]/.test(finalKey)) {
      finalKey = 'key_' + finalKey
    }

    return finalKey
  }
}

/**
 * 创建默认的 OpenAI key 生成器实例
 */
export function createOpenAIKeyGenerator(config?: OpenAIConfig): OpenAIKeyGenerator {
  return new OpenAIKeyGenerator(config)
}
