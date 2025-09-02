import type { CustomizeKey, OpenAIConfig } from '../../types'
import { OpenAIKeyGenerator } from './openaiKeyGenerator'
import log from './log'

// 缓存生成的 key，避免重复调用 OpenAI
const keyCache = new Map<string, string>()
// 待处理的异步 key 生成队列
const pendingKeys = new Map<string, Promise<string>>()

/**
 * 创建增强版的 customizeKey 函数，支持使用 OpenAI 生成语义化的 key
 */
export function createEnhancedCustomizeKey(openaiConfig?: OpenAIConfig): CustomizeKey {
  let keyGenerator: OpenAIKeyGenerator | null = null

  // 只有在启用 OpenAI key 生成功能时才初始化
  if (openaiConfig?.enableKeyGeneration) {
    try {
      keyGenerator = new OpenAIKeyGenerator(openaiConfig)
      log.info('OpenAI key generation enabled')
    } catch (error) {
      log.error('Failed to initialize OpenAI key generator:', error)
      log.error('Falling back to default key generation')
    }
  }

  return function customizeKey(key: string, path?: string): string {
    // 如果没有启用 OpenAI 或初始化失败，使用智能临时 key 生成
    if (!keyGenerator) {
      return generateTempKey(key, path)
    }

    const cacheKey = `${key}:${path || ''}`

    // 检查缓存
    if (keyCache.has(cacheKey)) {
      const cached = keyCache.get(cacheKey)
      return cached as string
    }

    // 生成临时 key 立即返回
    const tempKey = generateTempKey(key, path)

    // 启动异步 key 生成（不阻塞当前流程）
    if (!pendingKeys.has(cacheKey)) {
      const generationPromise = keyGenerator.generateKey(key, path)
      pendingKeys.set(cacheKey, generationPromise)

      // 异步处理完成后更新缓存
      generationPromise
        .then((generatedKey) => {
          keyCache.set(cacheKey, generatedKey)
          pendingKeys.delete(cacheKey)
          log.verbose(`Key generated: ${tempKey} -> ${generatedKey}`)
        })
        .catch((error) => {
          log.verbose('Failed to generate key with OpenAI:', error)
          keyCache.set(cacheKey, tempKey)
          pendingKeys.delete(cacheKey)
        })
    }

    return tempKey
  }
}

/**
 * 生成临时 key（在 OpenAI 生成完成前使用）
 */
function generateTempKey(_chineseText: string, filePath?: string): string {
  // 从文件路径中提取模块名（尽可能通用）
  let modulePart = 'module'
  if (filePath) {
    const pathSegments = filePath.replace(/\\/g, '/').split('/')
    for (let i = 0; i < pathSegments.length; i++) {
      const segment = pathSegments[i]
      if (i > 0 && pathSegments[i - 1] === 'pages') {
        modulePart = segment
          .replace(/([A-Z])/g, '_$1')
          .toLowerCase()
          .replace(/^_/, '')
        break
      }
      if (
        segment.includes('Management') ||
        segment.includes('Settings') ||
        segment.includes('Authorization')
      ) {
        modulePart = segment
          .replace(/([A-Z])/g, '_$1')
          .toLowerCase()
          .replace(/^_/, '')
        break
      }
    }
  }

  // 使用通用的 {module}_{description} 临时格式
  const finalKey = `${modulePart}_text`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')

  return /^[a-z]/.test(finalKey) ? finalKey : `key_${finalKey}`
}

/**
 * 默认的同步 customizeKey 函数（保持向后兼容）
 */
export function getDefaultCustomizeKey(): CustomizeKey {
  return function (key: string): string {
    return key
  }
}

/**
 * 清空 key 缓存
 */
export function clearKeyCache(): void {
  keyCache.clear()
}
