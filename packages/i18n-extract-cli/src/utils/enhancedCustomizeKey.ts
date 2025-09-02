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
      return keyCache.get(cacheKey)!
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
function generateTempKey(chineseText: string, filePath?: string): string {
  // 从文件路径中提取上下文
  let context = ''
  if (filePath) {
    const pathSegments = filePath.replace(/\\/g, '/').split('/')

    // 查找有意义的路径段
    for (let i = 0; i < pathSegments.length; i++) {
      const segment = pathSegments[i]

      if (
        segment.includes('Management') ||
        segment.includes('Settings') ||
        segment.includes('Authorization')
      ) {
        context = segment
          .replace(/([A-Z])/g, '_$1')
          .toLowerCase()
          .replace(/^_/, '')
        break
      } else if (i > 0 && pathSegments[i - 1] === 'pages') {
        context = segment
          .replace(/([A-Z])/g, '_$1')
          .toLowerCase()
          .replace(/^_/, '')
        break
      }
    }
  }

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
    请选择: 'select', // 简化，去掉 please
    请输入: 'enter',

    // 特定业务词汇
    主体: 'entity',
    客户: 'customer',
    客户主体: 'entity', // 简化为 entity
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

  // 优先匹配完整短语（按长度排序，先匹配长的）
  const sortedTranslations = Object.entries(translationMap).sort(
    (a, b) => b[0].length - a[0].length
  )

  for (const [chinese, english] of sortedTranslations) {
    if (remainingText.includes(chinese)) {
      keyParts.push(english)
      remainingText = remainingText.replace(chinese, '').trim()
      break // 找到第一个匹配就停止
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

/**
 * 默认的同步 customizeKey 函数（保持向后兼容）
 */
export function getDefaultCustomizeKey(): CustomizeKey {
  return function (key: string, path?: string): string {
    return key
  }
}

/**
 * 清空 key 缓存
 */
export function clearKeyCache(): void {
  keyCache.clear()
}
