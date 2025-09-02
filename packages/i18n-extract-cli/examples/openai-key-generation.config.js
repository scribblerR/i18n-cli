module.exports = {
  input: 'src',
  output: '',
  exclude: ['**/node_modules/**/*'],
  localePath: './locales/zh-CN.json',
  localeFileType: 'json',
  rules: {
    js: {
      caller: 'i18n',
      functionName: 't',
      importDeclaration: "import i18n from '@/i18n';",
      functionSnippets: '',
    },
    ts: {
      caller: 'i18n',
      functionName: 't',
      importDeclaration: "import i18n from '@/i18n';",
      functionSnippets: '',
    },
    jsx: {
      caller: 'i18n',
      functionName: 't',
      importDeclaration: "import i18n from '@/i18n';",
      functionSnippets: '',
    },
    tsx: {
      caller: 'i18n',
      functionName: 't',
      importDeclaration: "import i18n from '@/i18n';",
      functionSnippets: '',
    },
  },
  prettier: {
    printWidth: 100,
    singleQuote: true,
    tabWidth: 2,
    useTabs: false,
    bracketSpacing: true,
    trailingComma: 'all',
    proseWrap: 'never',
    semi: true,
    arrowParens: 'always',
    endOfLine: 'lf',
  },
  incremental: true,
  skipExtract: false,
  skipTranslate: false,
  locales: ['en-US'],
  excelPath: './locales.xlsx',
  exportExcel: false,
  translationTextMaxLength: 5000,
  globalRule: {
    ignoreMethods: [],
  },

  // OpenAI 配置
  translator: 'openai',
  openai: {
    baseUrl: 'https://api.openai.com/v1', // 可选，默认值
    apiKey: '', // 留空将读取环境变量 OPENAI_API_KEY
    model: 'gpt-4o-mini', // 可选，默认值
    enableKeyGeneration: true, // 启用 OpenAI key 生成功能
  },

  adjustKeyMap(allKeyValue, currentFileKeyMap, currentFilePath) {
    return allKeyValue;
  },
};
