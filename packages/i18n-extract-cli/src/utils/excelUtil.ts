import xlsx from 'node-xlsx'
import StateManager from './stateManager'

export function getExcelHeader(): string[] {
  const { locales, excelHeaderMap } = StateManager.getToolConfig()
  const keyHeader = (excelHeaderMap && excelHeaderMap['key']) || '字典key'
  const zhHeader = (excelHeaderMap && excelHeaderMap['zh-CN']) || 'zh-CN'
  const header = [keyHeader, zhHeader]
  for (const locale of locales) {
    header.push((excelHeaderMap && excelHeaderMap[locale]) || locale)
  }
  return header
}

export function buildExcel(headers: string[], data: string[][], name: string): Buffer {
  const sheetOptions: Record<string, any> = {}
  sheetOptions['!cols'] = []
  headers.forEach(() => {
    sheetOptions['!cols'].push({
      wch: 50, // 表格列宽
    })
  })

  data.unshift(headers)
  const buffer = xlsx.build([{ options: {}, name, data }], { sheetOptions })
  return buffer
}
