import fs from 'fs-extra'
import path from 'path'
import chalk from 'chalk'
import cliProgress from 'cli-progress'
import { OpenAIKeyGenerator } from '../../utils/openaiKeyGenerator'
import { getAbsolutePath } from '../../utils/getAbsolutePath'
import { saveLocaleFile } from '../../utils/saveLocaleFile'
import getLang from '../../utils/getLang'
import log from '../../utils/log'
import type { OpenAIConfig, StringObject } from '../../../types'

interface OptimizeKeysOptions {
  localePath: string
  openaiConfig: OpenAIConfig
  dryRun?: boolean
  outputPath?: string
}

/**
 * 优化已提取的国际化 key，使用 OpenAI 生成更语义化的 key
 */
export async function optimizeKeys(options: OptimizeKeysOptions): Promise<void> {
  const { localePath, openaiConfig, dryRun = false, outputPath } = options

  if (!openaiConfig.apiKey && !process.env.OPENAI_API_KEY) {
    log.error('OpenAI API key is required for key optimization')
    process.exit(1)
  }

  const localeAbsolutePath = getAbsolutePath(process.cwd(), localePath)

  if (!fs.existsSync(localeAbsolutePath)) {
    log.error(`Locale file not found: ${localeAbsolutePath}`)
    process.exit(1)
  }

  log.info('Loading locale file...')
  const originalLocale = getLang(localeAbsolutePath)
  const flatLocale = flattenObject(originalLocale)

  const keyGenerator = new OpenAIKeyGenerator(openaiConfig)
  const optimizedKeyMap: Record<string, string> = {}
  const keyMappings: Record<string, string> = {} // 原key -> 新key的映射

  const keys = Object.keys(flatLocale)
  log.info(`Found ${keys.length} keys to optimize`)

  const bar = new cliProgress.SingleBar(
    {
      format: `${chalk.cyan('Key optimization progress:')} [{bar}] {percentage}% {value}/{total}`,
    },
    cliProgress.Presets.shades_classic
  )

  bar.start(keys.length, 0)

  // 批量处理以提高效率
  const batchSize = 5
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize)
    const promises = batch.map(async (originalKey) => {
      const chineseText = flatLocale[originalKey]

      try {
        // 尝试从原 key 中推断文件路径上下文
        const contextPath = inferPathFromKey(originalKey)
        const optimizedKey = await keyGenerator.generateKey(chineseText, contextPath)

        return {
          originalKey,
          optimizedKey,
          chineseText,
        }
      } catch (error) {
        log.verbose(`Failed to optimize key "${originalKey}":`, error)
        return {
          originalKey,
          optimizedKey: originalKey, // 保持原样
          chineseText,
        }
      }
    })

    const results = await Promise.all(promises)

    results.forEach(({ originalKey, optimizedKey, chineseText }) => {
      optimizedKeyMap[optimizedKey] = chineseText
      if (originalKey !== optimizedKey) {
        keyMappings[originalKey] = optimizedKey
      }
      bar.increment()
    })

    // 添加短暂延迟以避免 API 限制
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  bar.stop()

  // 显示优化结果
  const changedKeys = Object.keys(keyMappings)
  log.info(`Optimization complete! ${changedKeys.length} keys were improved.`)

  if (changedKeys.length > 0) {
    log.info('\nKey changes:')
    changedKeys.slice(0, 10).forEach((originalKey) => {
      log.info(`  ${chalk.red(originalKey)} -> ${chalk.green(keyMappings[originalKey])}`)
    })

    if (changedKeys.length > 10) {
      log.info(`  ... and ${changedKeys.length - 10} more`)
    }
  }

  if (dryRun) {
    log.info('\nDry run mode - no files were modified')
    return
  }

  // 保存优化后的 locale 文件
  const finalOutputPath = outputPath || localeAbsolutePath
  const structuredLocale = unflattenObject(optimizedKeyMap)

  saveLocaleFile(structuredLocale, finalOutputPath)
  log.success(`Optimized locale file saved to: ${finalOutputPath}`)

  // 保存 key 映射文件，用于后续更新代码
  if (changedKeys.length > 0) {
    const mappingPath = finalOutputPath.replace(/\.json$/, '.key-mappings.json')
    fs.writeFileSync(mappingPath, JSON.stringify(keyMappings, null, 2), 'utf8')
    log.info(`Key mappings saved to: ${mappingPath}`)
    log.info('You can use this mapping file to update your source code with the new keys.')
  }
}

/**
 * 从现有 key 推断可能的文件路径上下文
 */
function inferPathFromKey(key: string): string {
  const segments = key.split('_')
  const pathSegments: string[] = []

  // 根据 key 的模式推断路径
  if (key.startsWith('project_setting_')) {
    pathSegments.push('pages', 'ProjectSettings')
  } else if (key.startsWith('account_management_')) {
    pathSegments.push('pages', 'AccountManagement')
  } else if (key.startsWith('authorization_')) {
    pathSegments.push('pages', 'AuthorizationManagement')
  } else if (key.includes('customer_project_management')) {
    pathSegments.push('pages', 'CustomerProjectManagement')
  }

  return pathSegments.join('/')
}

/**
 * 扁平化对象
 */
function flattenObject(obj: StringObject, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key

    if (typeof value === 'string') {
      result[newKey] = value
    } else if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenObject(value as StringObject, newKey))
    }
  }

  return result
}

/**
 * 反扁平化对象
 */
function unflattenObject(flatObj: Record<string, string>): StringObject {
  const result: StringObject = {}

  for (const [key, value] of Object.entries(flatObj)) {
    const keys = key.split('.')
    let current = result

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]
      if (!(k in current)) {
        current[k] = {}
      }
      current = current[k] as StringObject
    }

    current[keys[keys.length - 1]] = value
  }

  return result
}
