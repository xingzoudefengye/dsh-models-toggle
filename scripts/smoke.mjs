#!/usr/bin/env node
/**
 * 用假 ctx 装一遍 host 半边：只验证「停用的模型会被过滤掉、dispose 后恢复」。
 * 真实链路（设置页开关 + 桌面版加载）只能重启后手点。
 *
 * 用法：node scripts/smoke.mjs
 */

import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'

const settings = {
  describe: () => [
    {
      ns: 'llm-pi-ai',
      value: {
        providers: {
          demo: {
            models: [{ id: 'keep-me' }, { id: 'hidden-me', disabled: true }],
          },
        },
      },
    },
  ],
}

const llm = {
  async listModels() {
    return [{ id: 'keep-me' }, { id: 'hidden-me' }]
  },
}

let disposed = null
const ctx = {
  llm,
  settings,
  effect(fn) {
    disposed = fn()
    return disposed
  },
  logger() {
    return { warn() {}, info() {} }
  },
}

apply(ctx)

const visible = await llm.listModels('demo')
assert.deepEqual(
  visible.map((model) => model.id),
  ['keep-me'],
  '停用的模型必须从目录里消失',
)

const other = await llm.listModels('another-provider')
assert.deepEqual(
  other.map((model) => model.id),
  ['keep-me', 'hidden-me'],
  '别的 provider 不该受影响',
)

// 配置里没有 disabled 时原样返回
settings.describe = () => [{ ns: 'llm-pi-ai', value: { providers: { demo: { models: [{ id: 'hidden-me' }] } } } }]
const restored = await llm.listModels('demo')
assert.equal(restored.length, 2, '没有停用标记时应原样返回')

// dispose 之后必须恢复原方法
settings.describe = () => [
  { ns: 'llm-pi-ai', value: { providers: { demo: { models: [{ id: 'hidden-me', disabled: true }] } } } },
]
disposed?.()
const afterDispose = await llm.listModels('demo')
assert.equal(afterDispose.length, 2, 'dispose 后应恢复原行为')

console.log('smoke ok：停用过滤 / 其他 provider 不受影响 / dispose 还原')
