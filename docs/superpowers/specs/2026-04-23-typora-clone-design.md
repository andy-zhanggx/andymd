# Typora-Clone Markdown 编辑器设计文档

**作者**：Andy Zhang
**日期**：2026-04-23
**状态**：Draft（待 Review）
**定位**：macOS 原生体验的 WYSIWYG Markdown 阅读器与编辑器，对标 Typora

---

## 1. 目标与非目标

### 1.1 目标

- 提供 **Typora 风格的 WYSIWYG 体验**：所见即所得，无源码/预览分栏；标记符号（`#`、`**`、`` ` ``）仅在光标进入时显示
- macOS 原生观感：红绿灯、菜单栏、原生文件对话框、系统暗色模式跟随
- 能作为日常阅读 + 写作工具使用，替代当前打开 VSCode / Typora 阅读 `.md` 的场景
- **迭代式交付**：每一轮版本独立可用，不做一次性大爆炸

### 1.2 非目标（暂不考虑）

- Windows / Linux 打包（Tauri 天然支持，未来需要时再补平台 UX 细节）
- 移动端（Tauri Mobile 在 v2+ 成熟后另议）
- 双向链接 / 知识图谱（Obsidian 类产品方向，与 Typora 定位不同）
- 实时协作
- 插件市场

---

## 2. 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 应用外壳 | **Tauri 2.x（Rust）** | 相比 Electron 体积仅 ~10MB，内存低；Mac 上用系统 WKWebView |
| 前端框架 | **React 18 + Vite** | Milkdown 官方首要支持；UI 组件生态最广 |
| 编辑器核心 | **Milkdown（基于 ProseMirror）** | 开箱即用的 Markdown WYSIWYG；插件化；KaTeX/Mermaid 有官方插件 |
| 状态管理 | **Zustand** | 极简、无样板代码、适合中小型桌面 app |
| 文件树组件 | **react-arborist** | 虚拟滚动、键盘导航、未来可加拖拽；MIT |
| 代码高亮 | **Prism.js**（via Milkdown Prism 插件） | 轻量、语言包按需加载 |
| 文件监听 | Rust `notify` crate | 跨平台稳定的 fs 事件监听 |
| 移至废纸篓 | Rust `trash` crate | macOS 原生废纸篓 API |

**Bundle identifier**：`com.andyz.typora`（一旦确定不再修改，避免 macOS 识别为两个不同 app）

---

## 3. 总体架构

### 3.1 进程边界

```
┌─────────────────────────────────────────────────────────────┐
│  Rust 主进程 (src-tauri/)                                   │
│  ─ 窗口管理 / 菜单栏 / 文件对话框 / 全局快捷键              │
│  ─ 文件系统 I/O（读写 .md、遍历目录、监听 fs 变化）         │
│  ─ 最近工作区 / 用户配置 持久化                             │
│  ─ 未来：导出 PDF / HTML、原生通知                          │
└─────────────────────────────────────────────────────────────┘
                         ▲  Tauri IPC (invoke / event)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  WebView (WKWebView) - React App (src/)                     │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ UI 层: 侧边栏 / 标题栏 / 状态栏 / 命令面板              ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ 编辑器层: Milkdown (ProseMirror) + 插件                 ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ 状态层: Zustand（workspace / document / config）        ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ 服务层: fs-service / config-service（封装 IPC）         ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 3.2 设计原则

1. **文件 I/O 只在 Rust 侧**。JS 永不直接调用 `@tauri-apps/plugin-fs`，全部经过 `fs-service.ts` → Tauri `invoke` → Rust command。权限集中可审计；未来替换外壳时只需改一层。
2. **编辑器核心与 UI 解耦**。Milkdown 封装为 `<MarkdownEditor>` 组件，对外暴露受控接口（`value` / `onChange` / `onReady`）；UI 状态与编辑器内部状态分离。
3. **状态极简**。Zustand 三个 slice：`workspaceStore`（当前工作区+文件树）、`documentStore`（当前文档+脏状态）、`configStore`（主题+偏好）。不引入 Redux/XState。
4. **文件监听原生化**。Rust 侧 `notify` 监听工作区目录，通过 Tauri event 推给 JS；JS 不轮询。
5. **文件原子写**。写入流程：`write → fsync → rename` 到目标路径，防断电/崩溃丢数据。
6. **不侵入用户目录**。App 所有状态保存在 `Application Support`，不在工作区偷偷写隐藏文件（与 Typora 一致，有别于 Obsidian `.obsidian/`）。

### 3.3 目录结构

```
typora/
├── src-tauri/              # Rust 后端
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/       # #[tauri::command]
│   │   │   ├── fs.rs       # 读写 / 列目录 / 删除
│   │   │   ├── workspace.rs# 最近工作区、切换工作区
│   │   │   └── config.rs   # 用户配置读写
│   │   ├── watcher.rs      # notify 文件监听
│   │   └── menu.rs         # macOS 菜单栏
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                    # React 前端
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── Sidebar/        # 文件树
│   │   ├── Editor/         # Milkdown 封装
│   │   ├── TitleBar/
│   │   └── StatusBar/
│   ├── stores/             # Zustand slices
│   ├── services/           # fs/config IPC 封装
│   ├── hooks/
│   └── styles/
├── docs/
│   └── superpowers/specs/
├── package.json
└── vite.config.ts
```

### 3.4 关键 IPC 命令（v0.1）

| 命令 | 参数 | 返回 | 说明 |
|---|---|---|---|
| `read_file` | `path` | `{content, mtime}` | 读 Markdown |
| `write_file` | `path, content` | `{mtime}` | 原子写（临时文件 + rename） |
| `list_workspace` | `root` | `FileNode[]` | 递归遍历 `.md` 文件 |
| `open_workspace_dialog` | - | `path?` | 原生文件夹选择 |
| `create_file` / `create_dir` | `parent, name` | `FileNode` | 新建 |
| `rename_path` | `from, to` | `()` | 重命名 |
| `delete_to_trash` | `path` | `()` | `trash` crate 移到废纸篓 |
| `get_config` / `save_config` | - / `Config` | `Config` / `()` | 配置读写 |

**Event（Rust → JS）**
- `workspace-changed`：fs 变化（create / modify / delete）
- `theme-changed`：系统主题变化

---

## 4. 数据模型

### 4.1 领域类型（TypeScript）

```ts
interface Workspace {
  root: string;                    // 绝对路径
  name: string;                    // 末端目录名
  tree: FileNode;                  // 文件树根节点
  expandedPaths: Set<string>;      // 记忆展开状态
}

interface FileNode {
  path: string;                    // 绝对路径（作唯一 ID）
  name: string;
  kind: 'file' | 'dir';
  children?: FileNode[];
}

interface Document {
  path: string | null;             // null 表示未命名草稿
  content: string;                 // 磁盘上的规范内容
  draft: string;                   // 编辑器中的当前内容
  isDirty: boolean;                // draft !== content
  mtime: number;                   // 外部修改冲突检测用
  encoding: 'utf-8';               // v0.1 固定
}

interface DocumentSession {
  scrollTop: number;
  selection: { anchor: number; head: number };
  lastAccessedAt: number;
}

interface AppConfig {
  theme: 'light' | 'dark' | 'system';
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  editorWidth: 'narrow' | 'normal' | 'wide' | 'full';
  showSidebar: boolean;
  sidebarWidth: number;
  recentWorkspaces: string[];      // 最多 10 个
  lastWorkspace: string | null;
  showHiddenFiles: boolean;
  sessions: Record<string, DocumentSession>;  // LRU，上限 200
}
```

### 4.2 持久化位置（macOS 惯例）

| 内容 | 位置 |
|---|---|
| 用户配置 | `~/Library/Application Support/com.andyz.typora/config.json` |
| 日志 | `~/Library/Logs/com.andyz.typora/app.log` |
| 崩溃恢复草稿 | `~/Library/Application Support/com.andyz.typora/drafts/<uuid>.md`（v0.3） |
| 用户文档 | 用户自己的工作区目录（app 不侵入） |

### 4.3 外部修改冲突处理

1. 打开文件时记录 `mtime`
2. 保存前 `stat` 磁盘文件
3. 若磁盘 `mtime > 内存 mtime` → 弹原生 dialog：`Overwrite / Discard my changes / Cancel`
4. 文件监听检测到已打开文件被外部改动时，在编辑器顶部弹非阻塞横幅提示

### 4.4 文档位置记忆

- **存储**：`sessions` 映射表，key = 文件绝对路径，value = `DocumentSession`
- **上限**：200 条，按 `lastAccessedAt` LRU 淘汰，防止 config 无限膨胀
- **写入时机**：关闭文档 / 切换文档 / app 退出 / 打开文档 15 秒后（补救型 flush）
- **恢复时机**：编辑器 `ready` 事件触发后 + 一帧 `requestAnimationFrame`，再 set 滚动位置
- **失效兜底**：文件内容变更导致 `selection.head` 超出文档长度 → 静默退回文档顶部，不报错

### 4.5 未命名草稿

- 新建文档 `path = null`，首次保存触发 macOS 原生 "Save As" 对话框
- 关闭脏文档按 macOS 惯例弹"是否保存"对话框

---

## 5. UI 设计

### 5.1 窗口布局

```
┌─────────────────────────────────────────────────────────────┐
│ ⬤ ⬤ ⬤   [ ≡ ]  document-name.md           [auto-save ✓]    │ TitleBar 38px
├────────────────┬────────────────────────────────────────────┤
│ 📁 MyNotes     │                                            │
│ ▼ drafts       │                                            │
│   📄 idea.md   │                                            │
│ ▼ weekly       │       WYSIWYG Editor Area                  │
│   📄 w14.md    │       (居中，max-width 根据 editorWidth)    │
│   📄 w15.md    │                                            │
│ 📄 README.md   │                                            │
│ [Sidebar 260px,│                                            │
│  可拖拽]       │                                            │
├────────────────┴────────────────────────────────────────────┤
│ H1 · 1,234 words · 8,542 chars · utf-8 · ⚙                   │ StatusBar 24px
└─────────────────────────────────────────────────────────────┘
```

**macOS 细节**
- `titleBarStyle: "overlay"` + `hiddenTitle: true`：红绿灯漂浮在自定义标题栏上
- 窗口背景色跟随主题，MVP 纯色；v0.4 可考虑 `NSVisualEffectView` vibrancy

### 5.2 组件清单

**TitleBar**
- 左：红绿灯（原生）+ 侧边栏折叠按钮 `≡`
- 中：文档名 + 脏状态指示（`●`）
- 右：自动保存状态、更多菜单 `⋯`

**Sidebar**
- 顶部：工作区名 + 切换工作区下拉（最近 10 个）
- 树：`react-arborist` 虚拟滚动
- 右键菜单：`New File` / `New Folder` / `Rename` / `Reveal in Finder` / `Delete（废纸篓）`
- 底部：文件名模糊搜索（v0.1 仅文件名；v0.4 才做全文）
- 边缘可拖拽调整宽度（200–500px），宽度记忆到 config
- `Cmd+B`（焦点不在编辑器时）切换显隐

**Editor**
- Milkdown 实例包在 `<MarkdownEditor>` 中，受控接口
- 中央布局：max-width 由 `editorWidth` 控制
- **v0.1 插件集**：
  - `@milkdown/preset-commonmark`
  - `@milkdown/preset-gfm`（表格、任务列表、删除线）
  - `@milkdown/plugin-listener`
  - `@milkdown/plugin-history`
  - `@milkdown/plugin-clipboard`
  - `@milkdown/plugin-cursor`
  - `@milkdown/plugin-prism`（代码高亮）
- 图片：本地图片通过 Tauri `asset:` 协议加载（v0.1 仅显示，粘贴拖拽插入在 v0.3）

**StatusBar**
- 左：当前块类型（`H1` / `Paragraph` / `Code: rust` 等）
- 中：字数 / 字符数 / 阅读时间估算
- 右：编码（固定 utf-8）+ 设置齿轮

**命令面板（`Cmd+K`）**
- v0.1：工作区内 `.md` 文件名模糊跳转
- v0.2+：命令搜索（切主题、切视图、导出等）

**设置面板**
- 独立窗口（非模态），按 macOS 偏好面板习惯用 tabs：
  - General（主题、字体、编辑器宽度）
  - Editor（行高、拼写检查）
  - Files（默认工作区、是否显示隐藏文件）
  - About

### 5.3 快捷键（MVP）

| 快捷键 | 行为 |
|---|---|
| `Cmd+N` | 新建未命名文档 |
| `Cmd+O` | 打开文件 |
| `Cmd+Shift+O` | 打开工作区 |
| `Cmd+S` / `Cmd+Shift+S` | 保存 / 另存为 |
| `Cmd+W` | 关闭当前文档 |
| `Cmd+B` | 粗体（焦点在编辑器）/ 切侧边栏（焦点在外） |
| `Cmd+K` | 命令面板 |
| `Cmd+,` | 设置面板 |
| `Cmd+Z` / `Cmd+Shift+Z` | 撤销 / 重做 |
| `Cmd+I` | 斜体 |
| `Cmd+1..6` | 切块为 H1..H6 |
| `Cmd+Enter` | 退出当前块到普通段落 |
| `Cmd++` / `Cmd+-` / `Cmd+0` | 字号增/减/重置 |

### 5.4 主题系统（MVP）

- 用 CSS Variables 统一管理
- 提供 `light.css` / `dark.css` 两套变量
- `theme: system` 时监听 macOS `prefers-color-scheme`
- Milkdown 编辑器内样式共用同一套变量
- 用户自定义主题 UI 在 v0.4

---

## 6. 迭代路线图

### v0.1 · MVP 基础阅读器 & 编辑器 · 预估 2-3 周

**目标**：日常读写 Markdown 文件可用，替代打开文本编辑器的场景。

**交付**
1. Tauri + React + Vite 工程骨架，macOS 构建脚本（`.app` / `.dmg`）跑通
2. Rust 侧：`read_file` / `write_file`（原子）/ `list_workspace` / fs watcher / 文件对话框 / 最近工作区
3. Milkdown 基础 CommonMark + GFM（标题 / 段落 / 粗斜体删除 / 列表 / 任务列表 / 引用 / 代码块 / 链接 / 分割线 / 表格）
4. 代码块 Prism 语法高亮（js/ts/rust/python/bash/json/md）
5. 图片显示（`asset:` 协议）
6. 侧边栏文件树（`react-arborist`）+ 右键菜单
7. 标题栏 / 状态栏（字数、块类型）
8. 浅色 / 深色 / 跟随系统 三主题
9. MVP 快捷键全集
10. 打开/编辑/保存工作流 + 脏状态 + 未命名草稿
11. 外部修改冲突检测
12. 文档位置记忆

**验收标准**
- 打开 500 个文件的工作区，侧边栏滚动不卡
- 编辑 10,000 字文档输入延迟 < 16ms（60fps）
- `Cmd+S` 保存后磁盘内容与编辑器一致；杀进程重开无丢失
- Finder 里改名/删除工作区文件，侧边栏 2 秒内同步
- `.app` 体积 < 20MB

**v0.1 明确不做**：数学公式 / Mermaid / 导出 / 打字机 / 专注模式 / 多窗口 / 自动保存 / 全文搜索 / 拼写检查 / 插件 / 图片拖拽粘贴 / 斜杠命令

---

### v0.2 · 高级渲染与大纲 · 预估 1.5-2 周

**交付**
1. KaTeX 数学公式（行内 `$...$` / 块级 `$$...$$`）
2. Mermaid 流程图
3. 文档大纲（TOC）抽屉面板：从编辑器 state 实时提取标题
4. 文件树内文件名模糊搜索
5. 命令面板 `Cmd+K` 基础版（跳转文件 / 切主题 / 切视图）
6. GFM 扩展：高亮、上下标、脚注

**验收**：带 50 公式 + 10 mermaid 的文档首次渲染 < 1s；滚动流畅；大纲实时更新

---

### v0.3 · 导出与编辑增强 · 预估 2 周

**交付**
1. 导出 HTML（单文件，可选图片 inline 为 base64）
2. 导出 PDF（隐藏 webview + `print_to_pdf`）
3. 自动保存（debounce 2s；可关闭）
4. 崩溃恢复草稿
5. 图片粘贴/拖拽：保存到 `<filename>.assets/`，插入相对路径；点击弹菜单
6. 斜杠命令 `/`
7. 拼写检查（macOS 系统 API）

**验收**：导出 HTML 与编辑器一致；PDF 分页合理；自动保存不丢数据；崩溃可恢复

---

### v0.4 · 体验打磨 · 预估 2 周

**交付**
1. 专注模式（当前段落高亮，其他段落低透明度）
2. 打字机模式（当前行居中）
3. 多窗口
4. 主题系统 UI + 内置 3-5 套主题 + 自定义 CSS
5. 自定义快捷键
6. 导出 docx
7. 全文搜索（Rust 侧 ripgrep）

---

### v0.5+ · 未来方向

- 插件系统
- Git 集成
- 双向链接 / 标签
- 实时协作（yjs）
- Tauri Mobile（iPad/iPhone）
- Windows / Linux

---

## 7. 开发工作流

### 7.1 Codex 强制规则

本项目**所有代码编写**通过 Codex CLI 完成：
- Claude 负责：需求梳理、架构设计、任务拆解、代码审阅、路线协调
- Codex 负责：具体实现、重构、调试、测试编写
- 调用路径：`codex:codex-rescue` subagent 或 `codex:rescue` skill

Claude 原则上不直接写应用代码；设计文档、规划文档例外。

### 7.2 分支与合并

- 永不直接提交到 `main`
- 每个迭代单独分支：`feature/v0.1-mvp`、`feature/v0.2-advanced-rendering`……
- 工作区隔离：`.worktrees/<name>`（仓库根目录下）
- 合并前先把 `main` 合入特性分支，再用 `glab mr create`（或适配本地 git，由 Andy 决定是否上 GitLab）

### 7.3 每轮迭代的 Definition of Done

1. 交付清单全部完成
2. 验收标准全部通过（实机测试）
3. 无已知 P0/P1 bug
4. `CHANGELOG.md` 更新
5. 设计文档（本文档）按实际实现回溯更新（若有偏离）

---

## 8. 风险与权衡

| 风险 | 影响 | 对策 |
|---|---|---|
| Milkdown WYSIWYG 在某些 Markdown 边缘语法上行为与原文档不等价 | 用户觉得"我的文件被改了" | v0.1 建设保存前后内容 diff 测试；遇到关键边缘 case 时考虑降级到 CodeMirror 6 + 装饰器路线 |
| WKWebView 与 Chromium 的 CSS/JS 兼容性差异 | 某些 UI 细节在 macOS 上表现不同 | 编写 macOS-first CSS；早期在目标设备上持续实机测试 |
| Tauri 2.x 仍在演进，API 小概率破坏性变更 | 需要跟随升级 | 锁定 minor 版本；升级时先跑一轮回归 |
| 大工作区遍历慢 | 启动时卡顿 | Rust 侧异步遍历 + 分批推送文件树；UI 先显示骨架 |
| Session 映射无限增长 | config.json 膨胀 | LRU 上限 200；Cmd+, 提供"清空位置记忆"按钮 |

---

## 9. 开放问题（暂定，待后续确认）

这些问题不阻塞 v0.1 启动，在各自版本开工前再决定：

- [ ] v0.3 导出 PDF：是否需要 Pagedjs 这类精细分页库（代码块不撕裂）？还是 `print_to_pdf` 默认行为够用？
- [ ] v0.4 自定义主题：CSS 自由度 vs 图形化调色盘，选哪个方向？
- [ ] v0.5 插件系统：JS 沙箱方案（iframe / vm2 / 不隔离只约定）？

---

## 10. 附录

### 10.1 术语

- **WYSIWYG**：What You See Is What You Get，所见即所得
- **GFM**：GitHub Flavored Markdown
- **TOC**：Table of Contents，文档大纲
- **IPC**：Inter-Process Communication
- **LRU**：Least Recently Used

### 10.2 参考

- Typora：https://typora.io/
- Milkdown：https://milkdown.dev/
- Tauri：https://tauri.app/
- ProseMirror：https://prosemirror.net/
- react-arborist：https://github.com/brimdata/react-arborist
