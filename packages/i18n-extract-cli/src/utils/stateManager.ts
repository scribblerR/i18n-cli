import type { Config } from '../../types'
import defaultConfig from '../default.config'

class StateManager {
  private static _instance: StateManager
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  private toolConfig: Config = defaultConfig

  private currentSourcePath = ''

  private vueScriptLang = 'js'

  private openAIKeyMap: Record<string, string> = {}

  static getInstance() {
    if (!this._instance) {
      this._instance = new StateManager()
    }
    return this._instance
  }

  setToolConfig(config: Config): void {
    this.toolConfig = config
  }
  getToolConfig(): Config {
    return this.toolConfig
  }

  setCurrentSourcePath(path: string): void {
    this.currentSourcePath = path
  }

  getCurrentSourcePath(): string {
    return this.currentSourcePath
  }

  setVueScriptLang(lang?: string): void {
    this.vueScriptLang = lang || 'js'
  }

  getVueScriptLang(): string {
    return this.vueScriptLang
  }

  setOpenAIKeyMap(map: Record<string, string>): void {
    this.openAIKeyMap = map || {}
  }

  getOpenAIKeyMap(): Record<string, string> {
    return this.openAIKeyMap
  }
}

export default StateManager.getInstance()
