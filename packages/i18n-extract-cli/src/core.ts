import type { CommandOptions, FileExtension, TranslateConfig, PrettierConfig } from '../types'
import fs from 'fs-extra'
import chalk from 'chalk'
import inquirer from 'inquirer'
import path from 'path'
import prettier from 'prettier'
import cliProgress from 'cli-progress'
import glob from 'glob'
import merge from 'lodash/merge'
import cloneDeep from 'lodash/cloneDeep'
import isArray from 'lodash/isArray'
import slash from 'slash'
import transform from './transform'
import log from './utils/log'
import { getAbsolutePath } from './utils/getAbsolutePath'
import Collector from './collector'
import translate from './translate'
import getLang from './utils/getLang'
import { YOUDAO, GOOGLE, BAIDU, ALICLOUD, OPENAI } from './utils/constants'
import StateManager from './utils/stateManager'
import exportExcel from './exportExcel'
import { getI18nConfig } from './utils/initConfig'
import { saveLocaleFile } from './utils/saveLocaleFile'
import { isObject } from './utils/assertType'
import errorLogger from './utils/error-logger'
import isDirectory from './utils/isDirectory'
import { generateSemanticSnakeCaseKeys } from './utils/openaiKeyMapper'
import https from 'https'
import http from 'http'

interface InquirerResult {
  translator?: 'google' | 'youdao' | 'baidu' | 'alicloud' | 'openai'
  key?: string
  secret?: string
  proxy?: string
  openaiBaseUrl?: string
  openaiApiKey?: string
  openaiModel?: string
}

function resolvePathFrom(inputPath: string) {
  const currentDir = process.cwd()
  return path.resolve(currentDir, inputPath)
}

function getPathFromInput(input: string, exclude: string[]) {
  const resolvePath = resolvePathFrom(input)
  if (isDirectory(resolvePath)) {
    const base = slash(resolvePath)
    const pattern = `${base}/**/*.{cjs,mjs,js,ts,tsx,jsx,vue}`
    const ignore = Array.isArray(exclude) ? exclude.map((p) => slash(p)) : []
    const paths = glob
      .sync(pattern, {
        ignore,
      })
      .filter((file) => fs.statSync(file).isFile())
    return paths
  } else {
    return [resolvePath]
  }
}

function getSourceFilePaths(input: string, exclude: string[]): string[] {
  const filePaths: string[] = []
  if (isArray(input)) {
    input.forEach((item) => {
      const paths = getPathFromInput(item, exclude)
      filePaths.push(...paths)
    })
  } else {
    const paths = getPathFromInput(input, exclude)
    filePaths.push(...paths)
  }

  return filePaths
}

// TODO: 逻辑需要重写
function saveLocale(localePath: string) {
  const keyMap = Collector.getKeyMap()
  const localeAbsolutePath = getAbsolutePath(process.cwd(), localePath)

  if (!fs.existsSync(localeAbsolutePath)) {
    fs.ensureFileSync(localeAbsolutePath)
  }

  if (!fs.statSync(localeAbsolutePath).isFile()) {
    log.error(`路径${localePath}不是一个文件,请重新设置localePath参数`)
    process.exit(1)
  }
  saveLocaleFile(keyMap, localeAbsolutePath)
  log.verbose(`输出中文语言包到指定位置:`, localeAbsolutePath)
}

function getPrettierParser(ext: string): string {
  switch (ext) {
    case 'vue':
      return 'vue'
    case 'ts':
    case 'tsx':
      return 'babel-ts'
    default:
      return 'babel'
  }
}

function getOutputPath(input: string, output: string, sourceFilePath: string): string {
  let outputPath
  if (output) {
    const filePath = sourceFilePath.replace(getAbsolutePath(process.cwd(), input) + '/', '')
    outputPath = getAbsolutePath(process.cwd(), output, filePath)
    fs.ensureFileSync(outputPath)
  } else {
    outputPath = getAbsolutePath(process.cwd(), sourceFilePath)
  }
  return outputPath
}

function formatInquirerResult(answers: InquirerResult): TranslateConfig {
  if (answers.translator === YOUDAO) {
    return {
      translator: answers.translator,
      youdao: {
        key: answers.key,
        secret: answers.secret,
      },
    }
  } else if (answers.translator === BAIDU) {
    return {
      translator: answers.translator,
      baidu: {
        key: answers.key,
        secret: answers.secret,
      },
    }
  } else if (answers.translator === ALICLOUD) {
    return {
      translator: answers.translator,
      alicloud: {
        key: answers.key,
        secret: answers.secret,
      },
    }
  } else if (answers.translator === OPENAI) {
    return {
      translator: answers.translator,
      openai: {
        baseUrl: answers.openaiBaseUrl,
        apiKey: answers.openaiApiKey,
        model: answers.openaiModel || 'gpt-4o-mini',
      },
    }
  } else {
    return {
      translator: answers.translator,
      google: {
        proxy: answers.proxy,
      },
    }
  }
}

async function getTranslationConfig() {
  const cachePath = getAbsolutePath(__dirname, '../.cache/configCache.json')
  fs.ensureFileSync(cachePath)
  const cache = fs.readFileSync(cachePath, 'utf8') || '{}'
  const oldConfigCache: InquirerResult = JSON.parse(cache)

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'translator',
      message: '请选择翻译接口',
      default: YOUDAO,
      choices: [
        { name: '有道翻译', value: YOUDAO },
        { name: '谷歌翻译', value: GOOGLE },
        { name: '百度翻译', value: BAIDU },
        { name: '阿里云机器翻译', value: ALICLOUD },
        { name: 'OpenAI 翻译', value: OPENAI },
      ],
      when(answers) {
        return !answers.skipTranslate
      },
    },
    {
      type: 'input',
      name: 'proxy',
      message: '使用谷歌服务需要翻墙，请输入代理地址（可选）',
      default: oldConfigCache.proxy || '',
      when(answers) {
        return answers.translator === GOOGLE
      },
    },
    {
      type: 'input',
      name: 'key',
      message: '请输入有道翻译appKey',
      default: oldConfigCache.key || '',
      when(answers) {
        return answers.translator === YOUDAO
      },
      validate(input) {
        return input.length === 0 ? 'appKey不能为空' : true
      },
    },
    {
      type: 'input',
      name: 'secret',
      message: '请输入有道翻译appSecret',
      default: oldConfigCache.secret || '',
      when(answers) {
        return answers.translator === YOUDAO
      },
      validate(input) {
        return input.length === 0 ? 'appSecret不能为空' : true
      },
    },
    {
      type: 'input',
      name: 'key',
      message: '请输入百度翻译appId',
      default: oldConfigCache.key || '',
      when(answers) {
        return answers.translator === BAIDU
      },
      validate(input) {
        return input.length === 0 ? 'appKey不能为空' : true
      },
    },
    {
      type: 'input',
      name: 'secret',
      message: '请输入百度翻译appSecret',
      default: oldConfigCache.secret || '',
      when(answers) {
        return answers.translator === BAIDU
      },
      validate(input) {
        return input.length === 0 ? 'appSecret不能为空' : true
      },
    },
    {
      type: 'input',
      name: 'key',
      message: '请输入阿里云机器翻译accessKeyId',
      default: oldConfigCache.key || '',
      when(answers) {
        return answers.translator === ALICLOUD
      },
      validate(input) {
        return input.length === 0 ? 'accessKeyId不能为空' : true
      },
    },
    {
      type: 'input',
      name: 'secret',
      message: '请输入阿里云机器翻译accessKeySecret',
      default: oldConfigCache.secret || '',
      when(answers) {
        return answers.translator === ALICLOUD
      },
      validate(input) {
        return input.length === 0 ? 'accessKeySecret不能为空' : true
      },
    },
    {
      type: 'input',
      name: 'openaiBaseUrl',
      message: 'OpenAI baseUrl (默认 https://api.openai.com/v1，可选)',
      default: oldConfigCache.openaiBaseUrl || '',
      when(answers) {
        return answers.translator === OPENAI
      },
    },
    {
      type: 'password',
      name: 'openaiApiKey',
      message: 'OpenAI API Key (必填或设置环境变量 OPENAI_API_KEY)',
      default: oldConfigCache.openaiApiKey || '',
      when(answers) {
        return answers.translator === OPENAI
      },
    },
    {
      type: 'input',
      name: 'openaiModel',
      message: 'OpenAI 模型 (默认 gpt-4o-mini，可选)',
      default: oldConfigCache.openaiModel || 'gpt-4o-mini',
      when(answers) {
        return answers.translator === OPENAI
      },
    },
  ])

  const newConfigCache = Object.assign(oldConfigCache, answers)
  fs.writeFileSync(cachePath, JSON.stringify(newConfigCache), 'utf8')

  const result = formatInquirerResult(answers)
  return result
}

function formatCode(code: string, ext: string, prettierConfig: PrettierConfig): string {
  let stylizedCode = code
  if (isObject(prettierConfig)) {
    stylizedCode = prettier.format(code, {
      ...prettierConfig,
      parser: getPrettierParser(ext),
    })
    log.verbose(`格式化代码完成`)
  }
  return stylizedCode
}

export default async function (options: CommandOptions) {
  let i18nConfig = getI18nConfig(options)
  if (!i18nConfig.skipTranslate) {
    const translationConfig = await getTranslationConfig()
    i18nConfig = merge(i18nConfig, translationConfig)
  }
  // 全局缓存脚手架配置
  StateManager.setToolConfig(i18nConfig)

  const {
    input,
    exclude,
    output,
    rules,
    localePath,
    locales,
    skipExtract,
    skipTranslate,
    adjustKeyMap,
    localeFileType,
  } = i18nConfig
  log.debug(`命令行配置信息:`, i18nConfig)

  const openaiCfg = i18nConfig.openai || {}
  const hasOpenAI = !!(openaiCfg.apiKey || openaiCfg.baseUrl)
  async function getReservedKeysFromExistedConfig(): Promise<Set<string>> {
    const conf = i18nConfig.existedConfig || {}
    const local = Array.isArray(conf.existedKeys) ? conf.existedKeys : []
    const url = conf.getExistedUrl || ''
    const field = conf.mapFieldToKey || 'key'
    if (!url) return new Set(local)
    const client = url.startsWith('https') ? https : http
    const data: any = await new Promise((resolve) => {
      client
        .get(url, (res) => {
          let raw = ''
          res.on('data', (chunk) => (raw += chunk))
          res.on('end', () => {
            try {
              resolve(JSON.parse(raw))
            } catch (e) {
              resolve([])
            }
          })
        })
        .on('error', () => resolve([]))
    })
    let remote: string[] = []
    if (Array.isArray(data)) {
      remote = data
        .map((item) => (item && typeof item === 'object' ? item[field] : undefined))
        .filter((k) => typeof k === 'string')
    }
    return new Set<string>([...local, ...remote])
  }

  let oldPrimaryLang: Record<string, string> = {}
  const primaryLangPath = getAbsolutePath(process.cwd(), localePath)
  if (!fs.existsSync(primaryLangPath)) {
    saveLocaleFile({}, primaryLangPath)
  }
  oldPrimaryLang = getLang(primaryLangPath)
  if (!skipExtract) {
    log.info('正在转换中文，请稍等...')

    const sourceFilePaths = getSourceFilePaths(input, exclude)
    const bar = new cliProgress.SingleBar(
      {
        format: `${chalk.cyan('提取进度:')} [{bar}] {percentage}% {value}/{total}`,
      },
      cliProgress.Presets.shades_classic
    )
    const startTime = new Date().getTime()
    bar.start(sourceFilePaths.length, 0)
    sourceFilePaths.forEach((sourceFilePath) => {
      StateManager.setCurrentSourcePath(sourceFilePath)

      log.verbose(`正在提取文件中的中文:`, sourceFilePath)
      errorLogger.setFilePath(sourceFilePath)
      const sourceCode = fs.readFileSync(sourceFilePath, 'utf8')
      const ext = path.extname(sourceFilePath).replace('.', '') as FileExtension
      Collector.resetCountOfAdditions()
      Collector.setCurrentCollectorPath(sourceFilePath)
      // 跳过空文件
      if (sourceCode.trim() === '') {
        bar.increment()
        return
      }
      const { code } = transform(sourceCode, ext, rules, sourceFilePath)
      log.verbose(`完成中文提取和语法转换:`, sourceFilePath)

      // 首次遍历：若启用OpenAI语义key，先不写文件，仅收集中文
      if (!hasOpenAI && (Collector.getCountOfAdditions() > 0 || rules[ext].forceImport)) {
        const stylizedCode = formatCode(code, ext, i18nConfig.prettier)
        if (isArray(input)) {
          log.error('input为数组时，暂不支持设置dist参数')
          return
        }
        const outputPath = getOutputPath(input, output, sourceFilePath)
        fs.writeFileSync(outputPath, stylizedCode, 'utf8')
        log.verbose(`生成文件:`, outputPath)
      }

      // 自定义当前文件的keyMap
      if (adjustKeyMap) {
        const newkeyMap = adjustKeyMap(
          cloneDeep(Collector.getKeyMap()),
          Collector.getCurrentFileKeyMap(),
          sourceFilePath
        )
        Collector.setKeyMap(newkeyMap)
        Collector.resetCurrentFileKeyMap()
      }

      bar.increment()
    })
    // 增量转换时，保留之前的提取的中文结果
    if (i18nConfig.incremental) {
      const newkeyMap = merge(oldPrimaryLang, Collector.getKeyMap())
      Collector.setKeyMap(newkeyMap)
    }

    // If OpenAI config exists, transform keys using semantic snake_case mapping
    if (hasOpenAI) {
      const flatMap: Record<string, string> = {}
      Object.keys(Collector.getKeyMap()).forEach((k) => {
        const v = Collector.getKeyMap()[k]
        if (typeof v === 'string') flatMap[k] = v
      })
      const originals = Object.keys(flatMap).map((k) => flatMap[k])
      const reserved = await getReservedKeysFromExistedConfig()
      const mapping = await generateSemanticSnakeCaseKeys(originals, openaiCfg, reserved)
      StateManager.setOpenAIKeyMap(mapping)

      // Re-run transform to rewrite files with processed keys
      bar.update(0)
      bar.setTotal(sourceFilePaths.length)
      // Reset collected map for second pass
      Collector.setKeyMap({})
      Collector.resetCurrentFileKeyMap()
      for (const sourceFilePath of sourceFilePaths) {
        StateManager.setCurrentSourcePath(sourceFilePath)
        errorLogger.setFilePath(sourceFilePath)
        const sourceCode = fs.readFileSync(sourceFilePath, 'utf8')
        const ext = path.extname(sourceFilePath).replace('.', '') as FileExtension
        const { code } = transform(sourceCode, ext, rules, sourceFilePath)
        const stylizedCode = formatCode(code, ext, i18nConfig.prettier)
        if (isArray(input)) {
          log.error('input为数组时，暂不支持设置dist参数')
        } else {
          const outputPath = getOutputPath(input, output, sourceFilePath)
          fs.writeFileSync(outputPath, stylizedCode, 'utf8')
          log.verbose(`生成文件(二次语义key重写):`, outputPath)
        }
        bar.increment()
      }
    }

    const extName = path.extname(localePath)
    const savePath = localePath.replace(extName, `.${localeFileType}`)
    saveLocale(savePath)
    bar.stop()
    const endTime = new Date().getTime()

    log.info(`耗时${((endTime - startTime) / 1000).toFixed(2)}s`)
  }

  errorLogger.printErrors()
  console.log('') // 空一行
  if (!skipTranslate) {
    await translate(localePath, locales, oldPrimaryLang, {
      translator: i18nConfig.translator,
      google: i18nConfig.google,
      youdao: i18nConfig.youdao,
      baidu: i18nConfig.baidu,
      alicloud: i18nConfig.alicloud,
      openai: i18nConfig.openai,
      translationTextMaxLength: i18nConfig.translationTextMaxLength,
    })
  }

  log.success('转换完毕!')

  if (i18nConfig.exportExcel) {
    log.info(`正在导出excel翻译文件`)
    exportExcel()
    log.success(`导出完毕!`)
  }
}
