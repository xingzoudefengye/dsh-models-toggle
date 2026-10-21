# dsh-models-toggle

在 DSH 的「设置 → 模型」里给每个模型一个**启用/停用开关**：停用的模型从模型选择器里消失，配置仍留着，随时能勾回来。

> English: A DeepSeek Harness (DSH) plugin that adds an enable/disable switch to every model row in Settings → Models. A disabled model disappears from model pickers (including sub-agent allowed-model lists) but stays in your configuration, so re-enabling it is one click — no deleting and retyping. It ships both halves: a client-side copy of the official model-settings UI with the switch, and a host-side wrapper around `llm.listModels()` that filters disabled entries. Works with the official desktop app, whose harness is bundled inside `app.asar` and therefore cannot be patched in place. MIT licensed, Node.js >= 22.

## 为什么需要它

之前「不想要某个模型」只能**从配置里删掉**那一行：pi-ai 的模型清单是手写的 YAML，删掉就得记住 `id` / `contextWindow` / `maxTokens` / `reasoningEfforts` 一整套字段，想加回来要重新查。

官方设置页没有开关，而「加开关」这件事在桌面版上尤其麻烦：

| 场景 | 官方 harness 在哪 | 能不能就地打补丁 |
|---|---|---|
| `dsh web` / CLI | 全局 npm 安装（`npm root -g`） | 能（`patches/apply.sh` 改了 `node_modules` 里的文件） |
| 官方桌面版 | 打包进 `resources/app.asar` | **不能** —— 改它等于改官方安装包（`asar` 里那两个包是独立构建产物，`disabled` 字段在它里面出现 0 次） |

所以做成本插件：**不碰 `app.asar`，两个 profile 用同一份实现**。

## 它做什么

| 半边 | 文件 | 作用 |
|---|---|---|
| client | `lib/client.js` | 官方模型设置界面的同款代码 + 每行一个开关（`role="switch"`，标签「在选择器中显示 / 隐藏」）。随插件名 `dsh-models-toggle` 注册，并停用官方的 `ui-settings-models`，避免出现两份界面 |
| host | `lib/index.js` | 包一层 `ctx.llm.listModels()`：把 `disabled: true` 的模型从目录里去掉，模型选择器、子代理白名单等按目录取模型的地方都不再出现它 |
| patch | `cordis.patch.yml` | 挂载本插件 + 关掉官方 `ui-settings-models` |

停用状态就存在 pi-ai 模型条目上，落在 profile 的 `cordis.patch.yml`：

```yaml
- id: llm-pi-ai
  config:
    providers:
      newapi-responses:
        models:
          - id: gpt-6.1-sol          # 启用：没有 disabled 字段
            ...
          - id: grok-4.7
            disabled: true           # 停用：开关关掉时写进去的就是这一个字段
            ...
```

- 每行开关**点击即存**（写入 profile 配置），host 每次调用 `listModels()` 都现读配置，所以**勾掉立即生效，不用重启宿主**
- `schemastery` 对未知字段是**保留**的（实测），所以即使宿主的 pi-ai 没有打过 `disabled` 补丁，这个字段也能存下来、本插件也读得到
- 只在 pi-ai 的模型卡片上出现开关。直连 DeepSeek 的 `deepseek-official` 目录是**服务端发现**的，不吃这个字段

## 兼容性

| 平台 | 支持 | 说明 |
|---|---|---|
| Windows 10/11（PowerShell） | ✅ | 插件本体是纯 JS。安装脚本是 `node` 版（`scripts/install-desktop.mjs`、`scripts/smoke.mjs`），不依赖 bash |
| macOS（zsh） | ✅ | 同一套 `node` 脚本；桌面版 profile 路径同为 `~/.dsh/profiles/desktop` |
| Linux | ✅ | 同上（桌面版若无则不装 client 半边也没有意义，见「安装」） |

实际验证环境：Windows 11 22H2 + Node 24.19.0 + dsh **0.2.1-rc.2**，两个宿主都实测：

- `dsh web`（全局 npm 安装）：设置 → 模型 → 展开 `newapi-responses`，4 个开关渲染正常，点击后 `aria-checked` 由 `false → true`，控制台零报错
- 官方桌面版（harness 在 `app.asar` 里）：重启后开关出现，勾掉后模型从选择器消失

DSH 版本：peer 依赖写 `"*"` 且 optional，`dsh plugin add` 不会因版本号拒绝安装。**真正的门槛是 `lib/client.js` 这一份客户端副本**：它是按 0.2.1-rc.2 的官方模型设置界面生成的，见[维护](#维护升级-harness-之后)。

## 安装

### Web / CLI profile

```bash
dsh plugin --profile web add github:xingzoudefengye/dsh-models-toggle
```

这条命令写依赖、加进 `dsh.profile.bundles`，然后**重启宿主**（`dsh web`）。

### 官方桌面版

桌面版 profile 由应用独占管理，`dsh plugin add` 会拒绝（*managed exclusively by the Electron application*），所以用它自己的安装脚本：

```powershell
git clone https://github.com/xingzoudefengye/dsh-models-toggle "$env:TEMP\dsh-models-toggle"
node "$env:TEMP\dsh-models-toggle\scripts\install-desktop.mjs"
```

脚本做三件事：备份 `package.json` / `cordis.patch.yml` / `pnpm-lock.yaml` 到 `%TEMP%\dsh-profile-desktop-<时间戳>\`；把 `dsh-models-toggle` 写进依赖与 `dsh.profile.bundles`；在 `~/.dsh/profiles/desktop` 里跑 `pnpm install`。

参数：

| 参数 | 作用 |
|---|---|
| `--spec=<pnpm spec>` | 装哪一份（默认 `link:<本仓库>`；换机装远端用 `--spec=github:xingzoudefengye/dsh-models-toggle`） |
| `--profile=<dir>` | 换 profile 目录（默认 `$DSH_HOME/profiles/desktop`） |
| `--dry-run` | 只打印会做什么，不落盘、不安装 |
| `--no-install` | 只改 `package.json`，不跑 `pnpm install` |

前置条件：官方桌面版**先启动过一次**（它才会创建 `profiles/desktop`），并且本机有 `pnpm`（`corepack enable` 或 `npm i -g pnpm`）。

装完**完全退出桌面版**（不是最小化），从桌面图标重新启动。

## 验证

1. 设置 → 模型 → 点 `newapi-responses`（或其它 pi-ai 提供商）右边的「编辑」
2. 每个模型行末尾应有一个拨动开关；关掉一行后，那一行的 `disabled: true` 出现在 profile 的 `cordis.patch.yml` 里
3. 打开模型选择器（新会话的模型菜单 / 子代理的模型选择）：刚关掉的模型不再出现
4. 再打开开关，模型立刻回到选择器里（host 现读配置，不用重启）

不启动宿主也能跑 host 半边的自检：

```bash
node scripts/smoke.mjs
# smoke ok：停用过滤 / 其他 provider 不受影响 / dispose 还原
```

## 配置

插件自己没有配置项。唯一的状态就是模型条目上的 `disabled`：

| 想做的事 | 怎么做 |
|---|---|
| 停用某个模型 | 设置页把该行开关关掉（或手动在 `cordis.patch.yml` 里加 `disabled: true`） |
| 重新启用 | 开关打开（或删掉 `disabled` 字段） |
| 从配置里彻底删除 | 手动删那一行 —— 开关不删数据，只标记 |

配置改动 `patchReload: live` 的 profile 会热重载；开关本身走设置 API，总是即时生效。

## 卸载

1. 桌面版：把 `dsh.profile.bundles` 里的 `dsh-models-toggle` 去掉、依赖删掉，再 `pnpm install`；或用安装脚本备份目录里的原件还原 `package.json` 后 `pnpm install`
2. Web profile：`dsh plugin --profile web remove dsh-models-toggle`（或手动改 `package.json` + bundles）
3. 重启宿主。官方 `ui-settings-models` 会随之恢复（它被 `cordis.patch.yml` 停用，那份 patch 随插件一起卸载），设置页回到没有开关的官方版本；配置里残留的 `disabled: true` 会被忽略

## 排错

| 现象 | 原因 / 处理 |
|---|---|
| 重启后设置 → 模型是空的，或整个设置页报错 | `lib/client.js` 与当前 harness 的客户端 API 不匹配（harness 升级过）。先卸载恢复官方界面，再按[维护](#维护升级-harness-之后)重新生成 |
| 开关能点，但模型选择器里还看得见 | host 半边没加载。检查 profile 的 `dsh.profile.bundles` 里有没有 `dsh-models-toggle`，以及 `pnpm install` 是否把它装到了 `profiles/<profile>/node_modules/dsh-models-toggle` |
| 开关能点，但重启后回到「启用」 | 配置没写进 profile。看 `~/.dsh/profiles/<profile>/cordis.patch.yml` 里那个模型条目有没有 `disabled: true`；桌面版 profile 改的是 `profiles/desktop/cordis.patch.yml` |
| 官方界面和带开关的界面同时出现 | `cordis.patch.yml` 里 `- id: ui-settings-models / disabled: true` 那一段没生效（行 id 变了？）。对着 `dsh --profile <profile> --dump-config` 里的实际 id 改 |
| `pnpm install` 报 `EALLOWGIT` | npm 11 起默认禁 git 依赖。用 `pnpm install`（不是 `npm install`），或用 `--spec=link:<本地路径>` |

## 维护（升级 harness 之后）

`lib/client.js` 是**官方模型设置界面的一份副本**（约 214 KB，含 CSS），来源是宿主自带的那一份：

| 宿主 | 客户端 bundle 在哪 |
|---|---|
| 全局 npm 安装 | `$(npm root -g)/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js` |
| 官方桌面版 | `resources/app.asar` → `/dsh/node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js` |

生成步骤（换版后重做一遍，然后 `node scripts/smoke.mjs` + 重启手点验证）：

1. 从上面任一处取出该 `lib/client.js`（asar 用只读解析脚本抽，不必装 `asar` 包）
2. 参考本仓库 `reference/dsh-client-ui-settings-models.model-toggle.patch` 的 hunks（按 0.2.1-rc.2 生成），把开关加回 `ModelRow`（`role="switch"`、`aria-checked: model.disabled !== true`）和两处 i18n 文案
3. CSS 用**规则级差异**合并：把「加了开关的 CSS」与「原版 CSS」逐条对比，只把新增规则接到副本末尾，并把类名前缀统一成目标 bundle 用的那一套（按字符串切片容易踩 `@media` 嵌套和转义引号）
4. 文件顶部的客户端插件 `id` 改成 `dsh-models-toggle`，让它顶替官方那一份

同样要留意 `lib/index.js`：它只依赖 `ctx.llm.listModels()` 和 `ctx.settings.describe()` 两个稳定接口，harness 升级一般不用改；`smoke.mjs` 就是它的回归测试。

## 相关插件

| 插件 | 关系 |
|---|---|
| [`dsh-sidebar-cdp`](https://github.com/xingzoudefengye/dsh-sidebar-cdp) | 同样需要装进桌面版 profile，安装脚本（`scripts/install-desktop.mjs`）是同一套写法 |
| [`dsh-web-search-failover`](https://github.com/xingzoudefengye/dsh-web-search-failover) | 用 `cordis.patch.yml` 停用官方插件并插入自己那一行的另一例 |

这两个仓库和本仓库一起由 `dsh-env`（私有）的 `bootstrap.sh` 在一台新机器上复原。

## 许可

MIT，见 [LICENSE](./LICENSE)。
