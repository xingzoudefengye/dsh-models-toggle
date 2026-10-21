/**
 * dsh-models-toggle —— host 半边。
 *
 * 目标：模型可以「停用」但不必删除。停用状态存在 pi-ai 的模型条目上（`disabled: true`），
 * 设置页那一行有开关（见 lib/client.js，官方模型设置界面的同款代码 + 开关）；
 * 本文件负责**让停用真的生效**：把停用的模型从 `llm.listModels()` 的结果里去掉，
 * 于是模型选择器、子代理白名单之类按目录取模型的地方都不再出现它。
 *
 * 为什么不在 pi-ai 里过滤：桌面版的 pi-ai 打包在 app.asar 里，改它等于改官方安装包。
 * 这里改成在 LLM seam 上包一层，对任何 adapter 都成立，也不需要复制 pi-ai 那一大坨代码。
 *
 * 停用状态从哪读：`ctx.settings.describe()` 给出的 `llm-pi-ai` 命名空间**当前生效值**，
 * 每次调用都现读，所以设置页勾掉开关后立刻生效，不用重启。
 */

/** pi-ai 的设置命名空间（见 dsh-llm-pi-ai 里的 NS 常量）。 */
const PI_AI_NS = 'llm-pi-ai'

export const name = 'dsh-models-toggle'

/** `llm` 用来取模型目录，`settings` 用来读停用标记。 */
export const inject = ['llm', 'settings']

/**
 * 取某个 provider 下被停用的模型 id 集合。
 * 读不到就把集合留空——宁可多显示一个模型，也不要因为读配置失败让选择器空掉。
 */
function disabledModelIds(ctx, provider) {
  const hidden = new Set()

  try {
    const descriptors = ctx.settings.describe({ redactSecrets: true })
    const descriptor = Array.isArray(descriptors) ? descriptors.find((item) => item.ns === PI_AI_NS) : undefined
    const models = descriptor?.value?.providers?.[provider]?.models
    if (!Array.isArray(models)) return hidden

    for (const model of models) {
      if (model && model.disabled === true && typeof model.id === 'string') hidden.add(model.id)
    }
  } catch (error) {
    // 配置刚被改动、schema 还没就绪时会短暂失败：记一笔就好，别把 listModels 弄挂
    ctx.logger?.('dsh-models-toggle')?.warn?.('读取模型停用标记失败：%s', error instanceof Error ? error.message : String(error))
  }

  return hidden
}

export function apply(ctx) {
  ctx.effect(() => {
    const llm = ctx.llm
    const original = llm.listModels

    const wrapped = async function listModels(provider) {
      const models = await original.call(this === undefined ? llm : this, provider)
      const hidden = disabledModelIds(ctx, provider)
      if (hidden.size === 0 || !Array.isArray(models)) return models
      return models.filter((model) => !hidden.has(model?.id))
    }

    llm.listModels = wrapped

    return () => {
      // 只还原自己装的那一层，避免把别人后装的包装一起拆掉
      if (llm.listModels === wrapped) llm.listModels = original
    }
  })
}
