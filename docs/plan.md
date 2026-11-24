# 念頭（dsh-whim）— 一次性臨時調查插件 · 設計與實作計劃

> 狀態：設計已定案（名稱、入口形態、保留策略），可直接開工。
> 目標 repo 位置建議：`~/Documents/code/git/dsh-whim`（跟你其他插件放在一起）。

**一句話：** 一個側欄入口，你冒出一個念頭就丟進去，它開一個用完就可以放下的獨立對話去查，查完留下一頁結論；查過的東西不會污染主對話，也不會污染彼此。

**為什麼叫「念頭」：** 念頭的特性就是這樣——來得快、彼此不相干、想清楚了就可以放下。它不像「專案」那樣要求你承諾，也不像「靈感」那樣暗示它一定有價值（大部分念頭其實很普通：「哪個 PDF 庫支援中文」）。名字本身就是產品規則。

---

## 1. 它解決什麼

你現在的做法是「把隨機問題丟進主對話」。代價有三個，而且都不明顯：

| 代價 | 具體長相 |
|---|---|
| **上下文污染** | 三個不相關的問題擠在同一個 context 裡，模型開始把 A 題的前提帶進 B 題；而且它們會一直被重讀，每一輪都付錢 |
| **主線被切斷** | 你正在做的事被打斷，回頭要重新建立脈絡 |
| **沒有留痕** | 三天後你想不起「上次那個念頭查到什麼」——因為它混在一長串對話中間 |

酒館解決的是**另一件事**：角色、世界書、長期陪伴。它把對話做成有身分的東西，正好是「臨時」的相反。

## 2. 它不是什麼（先劃界，避免做成第二個酒館）

- ✗ 不是角色扮演／人物卡／世界書
- ✗ 不是專案管理器（不建 repo、不建 plan、不建 issue）
- ✗ 不是長期筆記庫（要長期留的請「收好」出去，見 §8）
- ✗ 不是第二個聊天視窗（v1 不自己畫聊天介面，見 §6）

**分工一句話：** 酒館＝坐下來慢慢喝；念頭＝冒出來、查清楚、放下。

## 3. 名稱

| 名稱 | 套件 id | 意象 | 適合度 |
|---|---|---|---|
| **念頭**（採用） | `dsh-whim` | 一時興起、彼此不相干、想清楚就放下 | ★★★★★ 直接對應「隨機問題」的本質 |
| 靈光 | `dsh-spark` | 靈光一閃 | ★★★★ 好聽，但暗示每個都值得記 |
| 靈感簿 | `dsh-muse` | 收集起來可翻閱的簿子 | ★★★★ 有收藏感，跟「可丟」有點相反 |

其餘稱呼一律照這個隱喻走，寫程式時就不用再想：

| 動作 | 介面上的字 |
|---|---|
| 開一筆新的 | **冒一個念頭** |
| 清單 | **最近的念頭** |
| 丟棄 | **放下** |
| 複製結論到你的專案 | **收好** |
| 對同一筆再問 | **再想一層** |

## 4. 核心模型：一個念頭 ＝ 一個 DSH session

這是整個設計的地基，也是「互相不影響」真正落地的地方。

DSH 的 session 天生就是隔離單位：自己的 context、自己的 transcript、自己的 cwd、自己的 preset。所以**不要自己造對話引擎**，直接把「一個念頭」映射成「一個 session」：

```
你的主對話（session A）        ← 完全不受影響
├─ 念頭 1 → session B          ← 自己的 context，想清楚就封存
├─ 念頭 2 → session C          ← 自己的 context
└─ 念頭 3 → session D
```

三層隔離，一層一層看：

| 層 | 靠什麼隔離 | 強度 |
|---|---|---|
| 對話上下文 | 各自獨立 session | 硬隔離（DSH 原生） |
| 檔案 | 各自獨立子資料夾 | 軟隔離（共用 cwd，靠 §9 的 agent 規則） |
| 生命週期 | 各自獨立封存／刪除 | 硬隔離 |

> ⚠️ 為什麼檔案是軟隔離：如果每個念頭都用自己的 cwd，DSH 側欄會長出 N 個「工作區」，一個月後就是災難。所以全部掛在**同一個根目錄**底下——那個根目錄本身註冊成**一個** workspace，側欄只佔一格，念頭的對話全部收在它裡面。

## 5. 架構：三個面（跟酒館同構，但小一個量級）

```
dsh-whim/
├── lib/
│   ├── index.js       宿主半：一條 /api/dsh-whim/rpc 路由 + 檔案 I/O      ~250 行
│   ├── client.js      瀏覽器半：側欄入口 + 主頁面（清單／輸入／結論）      ~800 行
│   └── agent.js       Agent 面：調查官人格 + 工具收斂（M2 才做）           ~120 行
├── cordis.patch.yml
├── dsh.plugin.json
└── package.json
```

**宿主半**（`export function apply(ctx)`，形狀照 `dsh-tavern/lib/index.js:193`）：

```js
export const name = 'dsh-whim'
export const inject = ['webServer']          // ⚠️ 只這一個，見 §10 風險 1
export const WHIM_BUILD = 'whim-0.2.0'

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/dsh-whim/rpc',
    handler: async (req, res) => { /* 來源圍籬 → 解析 ?op= → 回 {ok,value} */ },
  }), 'dsh-whim: rpc route')
}
```

**瀏覽器半**（要包在 `window.__ModuleLoader__.load({ id, factory })` 裡，最後 `module.exports = { name, inject, apply }`，照 `dsh-tavern/lib/client.js:17014` 與 `:17148`）：

```js
var inject = ['slots']                        // ⚠️ 只放 UI 服務，見 §10 風險 2

function apply(ctx) {
  ctx.effect(() => ctx.slots.register(
    { name: 'sidebar.panelist', id: 'whim', order: 30, label: '念頭' }, IconSpark), '…')
  ctx.effect(() => ctx.slots.register(
    { name: 'main', key: 'whim' }, WhimPage), '…')
}
```

這兩個 slot（側欄一顆入口 + 一個 keyed 主頁面）就是酒館在用的同一組，實作時照它的用法抄即可。

**Agent 面**（M2）：靠 plugin 自己註冊一個 preset 才有身分：

```js
// 第一次要開對話時才做，不要在啟動時做（風險 4）
const presets = ctx.get('agentPresets')       // lazy get，不是 inject
await presets.register({
  id: 'dsh-whim', name: '念頭', order: 910,
  description: '一次性臨時調查，不建專案，留下一頁結論',
  plugins: [{ id: 'whim-agent', name: agentEntryPath }],   // 用絕對路徑，不要用套件名
})
```

## 6. v1 刻意不自己畫聊天介面

酒館的 `client.js` 是 87 萬字元——那是為了角色扮演（立繪、氣泡、串流打字、樓層）。

一個念頭的對話只需要「問題 → 回答」。所以 v1 的介面是**三塊**：

```
┌ 念頭 ───────────────────────────────┐
│  [ 冒出一個念頭…              ] [查] │
├──────────────────────────────────────┤
│ ● 為什麼 pnpm 在 Windows 會 EPERM     │  ← 清單（今天／本週／更早）
│ ✓ 哪個 PDF 庫支援中文                │
│ ✕ 上次那個 API 回 429 的代價         │
├──────────────────────────────────────┤
│ 選中那一筆的內容                       │
│   結論（findings.md）                  │
│   過程（log.md：每輪的問與答）          │
│   [在 DSH 打開這個對話] [放下] [收好]   │
└──────────────────────────────────────┘
```

回覆在 `main` 頁面裡**即時串流**顯示（我們本來就拿得到串流，見 §7），不需要自己實作完整聊天元件。

## 7. 互動流程與 RPC 契約

### 冒出一個念頭（最關鍵的一條路）

順序不能顛倒——**先開串流，再送 prompt**。反過來模型可能在你開始聽之前就開始吐字。

```js
const service = ctx.get('remote.session')                      // lazy get
const { sessionId } = await service.create({ cwd: ROOT })       // M1 先不帶 agentPreset
const stream = service.follow(
  { address: { kind: 'session', sessionId }, assistantStream: true }, signal)
const pumping = pump(stream, onDelta)                           // 先把耳朵接上
await service.prompt({
  requestId, sessionId, mode: 'queue',
  content: [{ type: 'text', text: preamble + '\n\n' + question }],
})
await pumping                                                   // 收完 → 寫 log.md
```

**M1 不裝 preset**：把「調查官規則」當成 preamble 文字接在問題前面（見 §9）。零 preset 風險，先讓東西能用；M2 再換成正式 preset。

### RPC op 清單

| op | 作用 | 備註 |
|---|---|---|
| `whim.list` | 讀 `index.json` + 目前設定 | 回 `{ configured, root, workspaceId, source, defaultRoot, defaultHasIndex, items }`；分頁／排序交給前端 |
| `whim.config` | 只讀目前設定 | 給面板確認「有沒有選過資料夾」 |
| `whim.setRoot` | 記住使用者選的資料夾（與它的 workspace） | 寫 `config.json`；`whim.setConfig` 是同義詞 |
| `whim.clearConfig` | 忘掉設定（不動檔案） | |
| `whim.create` | 建資料夾 + `meta.json` + 寫入索引 | 回 `{ id, root, dir, meta }` |
| `whim.read` | 讀某筆的 meta / findings / log | |
| `whim.save` | 改 status／sessionId／輪數，並可整份覆寫 `log.md`／`findings.md` | meta 走白名單，`id`／`createdAt` 動不了 |
| `whim.drop` | 放下：刪資料夾 + 移出索引（**不碰 session**） | 封存 session 由面板另外呼叫 DSH 的 `workspaces.archiveSession()` |

原本規劃的 `whim.update` 併入 `whim.save`；`whim.promote`（收好）留到 M2。

### 資料落點

```
<ROOT>/                       第一次使用時由使用者選（預填 ~/whims，可用「瀏覽…」走原生選擇器）
├── index.json                [{ id, title, question, status, createdAt, updatedAt, sessionId, rounds, tokens }]
└── w-20261116-1a2b/          一個念頭一個資料夾（就是它的識別碼）
    ├── meta.json
    ├── log.md                問與答（給人看的純文字）
    ├── findings.md           結論一頁（agent 寫）
    └── assets/               附件（可選）
```

`w-<yyyymmdd>-<4位亂數>` 這種命名讓資料夾照名字排就是時間序，你在檔案總管裡打開就直接看得懂。

session 的 cwd ＝ `<ROOT>`（所有念頭共用 → 側欄只長一格）。

## 8. 生命週期：五個動作

| 動作 | 使用者看到 | 背後 |
|---|---|---|
| **冒** | 輸入框 → 新的一筆 | 建資料夾 → 建 session → 送 prompt |
| **看** | 結論 + 逐輪問答 | 讀 findings.md / log.md |
| **再想一層** | 對同一筆繼續問 | 對同一個 session 再 prompt（context 還在） |
| **放下** | 從清單消失 | 封存 session → 刪資料夾 → 移出索引 |
| **收好** | 選一個目錄，findings 出現在那裡 | 複製檔案（不搬 session、不動對話） |

「收好」是這個工具跟你的專案之間唯一的橋：**要留的，你自己收走；沒收走的，就是可以放下的。**

## 9. 調查官規則（preamble）

```
你現在在處理一個「念頭」：一次性的臨時調查。

1. 只回答這一題。不建專案、不寫計劃書、不做多階段重構。
2. 能直接答就直接答（≤ 400 字）；需要查就先查再答。
3. 回覆就是這一頁的結論：答案、關鍵事實、來源連結、不確定處。
4. 這一題若有成品（文件、清單、表格、程式、圖……），寫進念頭資料夾，
   回覆裡列出寫了哪些檔案。findings.md 由插件保存回覆，不用自己寫。
5. 最多 6 個工具回合。超過就停下，寫「查到什麼、還缺什麼」。
6. 不要反問澄清問題，除非這一題真的無法回答。
7. 只在這個念頭資料夾裡建立或修改檔案；不要碰其他念頭、上層目錄或使用者的專案。

念頭資料夾：<root>/w-<yyyymmdd>-<亂數>
```

這幾條就是「臨時」兩個字的操作化定義：只做這一題，但這一題要留下的成品
就寫在它自己的資料夾裡。沒有它，模型會自動把你當成在啟動一個專案。

## 10. 風險與地雷（都是酒館踩過的，直接抄結論）

| # | 地雷 | 後果 | 對策 |
|---|---|---|---|
| 1 | 宿主半 import 了第三方套件 | **整個 `dsh web` 起不來**（不是插件壞，是 DSH 壞） | `lib/*.js` 只准 `import` `node:` 與相對檔案，零執行期依賴 |
| 2 | client 的 `inject` 放了 `remote.session` | 服務等不到 → **白屏** | `inject` 只放 `slots`；`remote.session` 用 lazy `ctx.get()`，用的那一刻才拿 |
| 3 | `session.create({ agentPreset })` 用了 registry 沒有的 id | `Unknown agent preset: …` | M1 乾脆不帶 preset；M2 註冊完再帶 |
| 4 | 在啟動時註冊 preset 或做 I/O | 拖慢／卡住啟動 | 一律「第一次用到才做」 |
| 5 | 以為 session 可以刪除 | 側欄留下孤兒 | DSH 只有**封存**；要清檔案就自己掃 `~/.dsh/sessions/*/<id>/` |
| 6 | 自己算 session 檔案路徑 | 算錯 → 刪到別人的資料 | 位置用**掃描找出來**，不自己推算（cwd 的變形規則是內部的） |
| 7 | 刪了還活著的 session 的檔案 | 下次寫入又長出半截 jsonl | 活著的一律只封存不刪檔 |
| 8 | `webServer` 本身沒有來源檢查 | 同機其他網頁可以打你的 API | 自己加 origin 圍籬（比對 Origin/Host），失敗回 403 |
| 9 | Windows 安裝時 DSH 還開著 | pnpm `EPERM` | 安裝前完全退出 DSH Desktop（含托盤） |
| 10 | 改了宿主半卻只按 F5 | 看到舊行為 | 宿主半改動**一定要重啟 `dsh web`**；只有 client 半可以熱載 |

## 11. 里程碑

### M1 — 能用

- [x] 宿主半：一條 rpc 路由 + `index.json` / 資料夾 I/O（`config` / `list` / `create` / `read` / `save` / `drop`）
- [x] 瀏覽器半：側欄入口 + `main` 頁面（輸入框、清單、選中內容）
- [x] 第一次使用時選資料夾；選定的資料夾註冊成**一個** DSH workspace
- [x] 冒一個念頭：建資料夾 → 建 session（掛在那個 workspace）→ 這一輪留在插件裡串流跑完 → 寫 `log.md` / `findings.md`；按「開啟對話」才切到原生對話
- [x] 放下：刪資料夾 + 移出索引（session 保留，只由面板另外封存）
- [ ] 驗收：連續冒 3 個不相關的念頭 → 三份 context 互不干擾；重開 DSH → 清單還在；主對話沒有被塞進任何東西

### M2 — 像個工具
- [ ] 自己的 preset（調查官人格 + 工具收斂 + 回合上限），第一次使用時註冊
- [ ] `findings.md` 真的被寫出來（agent 規則 + UI 檢查，沒寫就提醒）
- [ ] 「收好」：複製到指定目錄
- [ ] 「再想一層」：對同一 session 再問
- [ ] 每個念頭的 token 用量

### M3 — 不礙事
- [ ] 清單搜尋 / 標籤
- [ ] 全域快捷鍵（隨時「冒一個念頭」）
- [ ] 匯出（一個資料夾 → 一份 markdown）
- [ ] 太久沒動的念頭在清單上淡出（不自動刪，只提示）

## 12. 已定案

| 項目 | 決定 |
|---|---|
| 名稱 | **念頭 / `dsh-whim`** |
| 入口形態 | 側欄入口 + 主頁面（跟酒館同一組 slot） |
| 保留策略 | 全部手動「放下」，不自動清理 |

## 附錄：本計劃引用的既有實作（都驗證過）

| 事實 | 出處 |
|---|---|
| 宿主半是 `export function apply(ctx)` + `export const inject` | `dsh-tavern/lib/index.js:50-53,193` |
| 瀏覽器半是 `module.exports = { name, inject:['slots'], apply }` | `dsh-tavern/lib/client.js:17014-17151` |
| 側欄入口 / 主頁面 / plugins 分頁的 slot 名稱 | `dsh-tavern/lib/client.js:17090-17142` |
| `remote.session` 要 lazy `ctx.get()`（不能 inject） | `dsh-tavern/lib/client.js:615-636` |
| `create({ cwd, agentPreset })` 開一個新 session | `dsh-tavern/lib/client.js:1971-1979` |
| `follow()` 先接串流、`prompt()` 後送 | `dsh-tavern/lib/client.js:2395-2507` |
| preset 要 `agentPresets.register()`，且入口用絕對路徑 | `dsh-tavern/lib/preset.js:26-90` |
| session 只能封存；刪檔要先確認是否還活著 | `dsh-tavern/lib/index.js:471-529` |
| webServer 路由註冊形狀 + 來源圍籬 | `dsh-tavern/lib/index.js:152,1147-1186` |
