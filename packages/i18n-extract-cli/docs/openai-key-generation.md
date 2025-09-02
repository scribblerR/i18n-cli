# OpenAI 智能 Key 生成功能

## 功能概述

这个功能使用 OpenAI 的能力自动生成语义化的国际化 key，而不是使用原始的中文文本作为 key。生成的 key 遵循项目的命名规范，如：

- `project_setting_select_tiktok_account`
- `account_management_add_success`
- `authorization_management_create`

## 使用方法

### 方法一：在提取阶段启用 OpenAI key 生成

1. 在配置文件中设置 OpenAI 相关配置：

```javascript
module.exports = {
  // ... 其他配置
  translator: 'openai',
  openai: {
    baseUrl: 'https://api.openai.com/v1', // 可选
    apiKey: '', // 留空将读取环境变量 OPENAI_API_KEY
    model: 'gpt-4o-mini', // 可选
    enableKeyGeneration: true, // 启用智能 key 生成
  },
  // ... 其他配置
}
```

2. 设置环境变量（推荐）：

```bash
export OPENAI_API_KEY=your_openai_api_key
```

3. 运行提取命令：

```bash
npx it -c your-config.js
```

### 方法二：优化已提取的 key

如果你已经有了提取的中文语言包，可以使用 `optimize-keys` 命令来优化现有的 key：

```bash
# 预览模式（不修改文件）
npx it optimize-keys --localePath ./locales/zh-CN.json --dry-run --openai-api-key your_api_key

# 实际优化
npx it optimize-keys --localePath ./locales/zh-CN.json --openai-api-key your_api_key

# 输出到新文件
npx it optimize-keys --localePath ./locales/zh-CN.json --output ./locales/zh-CN-optimized.json --openai-api-key your_api_key
```

## 命令行选项

### optimize-keys 命令选项

- `--localePath <path>`: 指定要优化的中文语言包路径（默认：./locales/zh-CN.json）
- `--output <path>`: 优化后的输出文件路径（可选，默认覆盖原文件）
- `--dry-run`: 预览模式，不实际修改文件
- `--openai-base-url <url>`: OpenAI base URL（默认：https://api.openai.com/v1）
- `--openai-api-key <key>`: OpenAI API key（或设置环境变量 OPENAI_API_KEY）
- `--openai-model <model>`: OpenAI 模型（默认：gpt-4o-mini）
- `-v, --verbose`: 显示详细日志

## Key 生成规则

生成的 key 遵循以下规则：

1. **格式**：snake_case（小写字母 + 下划线）
2. **结构**：`{模块}_{动作}_{描述}` 或 `{页面}_{组件}_{动作}`
3. **语义化**：避免使用通用词汇，如 column、status、action 等
4. **上下文感知**：基于文件路径自动推断模块和页面信息

## 示例

### 输入示例

- 中文：`"请选择 TikTok 账户"`
- 文件路径：`src/pages/ProjectSettings/index.tsx`

### 输出示例

- 生成的 key：`project_setting_select_tiktok_account`

### 更多示例

| 中文文本           | 文件路径                                    | 生成的 Key                              |
| ------------------ | ------------------------------------------- | --------------------------------------- |
| "加载中..."        | src/pages/AccountManagement/index.tsx       | account_management_loading              |
| "添加成功"         | src/pages/AccountManagement/AddAccount.tsx  | account_management_add_success          |
| "确认删除此授权？" | src/pages/AuthorizationManagement/index.tsx | authorization_management_confirm_delete |
| "项目设置"         | src/pages/ProjectSettings/index.tsx         | project_setting_title                   |

## 注意事项

1. **API 费用**：使用 OpenAI API 会产生费用，建议在正式使用前先用 `--dry-run` 模式预览
2. **网络要求**：需要能够访问 OpenAI API
3. **备用机制**：如果 OpenAI 调用失败，会自动使用内置的智能 key 生成逻辑
4. **缓存机制**：相同的文本和路径组合会被缓存，避免重复调用 API

## 环境变量

- `OPENAI_API_KEY`: OpenAI API 密钥
- `CLI_VERBOSE`: 设置为 true 启用详细日志
- `CLI_DEBUG`: 设置为 true 启用调试模式

## 故障排除

### 常见问题

1. **API key 无效**

   - 检查 `OPENAI_API_KEY` 环境变量是否正确设置
   - 确认 API key 有效且有足够的额度

2. **网络连接问题**

   - 检查网络连接是否正常
   - 如果在中国大陆，可能需要配置代理

3. **生成的 key 格式不正确**
   - 系统会自动检测并使用备用生成逻辑
   - 查看详细日志了解具体问题

### 调试

启用详细日志查看详细信息：

```bash
npx it optimize-keys --localePath ./locales/zh-CN.json --verbose
```
