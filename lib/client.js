/**
 * 念頭（dsh-whim）的瀏覽器半。
 *
 * 一個側欄入口 ＋ 一個 `main` 頁面：輸入框、清單、選中那一筆的結論。
 *
 * 兩條踩過的規矩（照 dsh-tavern 的結論抄）：
 *   1. `inject` 只放 `slots`。`remote.session`／`workspaces` 一律用 `ctx.get()`
 *      在真的要用的那一刻才拿——放進 inject 而服務等不到時，DSH 會把整個 GUI
 *      判成「沒掛起來」，那是白屏，不是「這個插件壞掉」。
 *   2. 這個檔案是手寫的 `__ModuleLoader__` bundle：沒有 ESM import、沒有 JSX，
 *      只有 `require('react')`。改完只要熱載客戶端就好。
 */

window.__ModuleLoader__.load({
  id: 'dsh-whim',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')
    var h = React.createElement

    /** 版本的鏡射：面板右下角與 console 都靠它認「跑的是哪一版」。 */
    var CLIENT_BUILD = 'whim-0.3.0'

    /** 宿主半的 RPC 路由。 */
    var RPC_PATH = '/api/dsh-whim/rpc'

    /** 側欄入口的 id ＝ `main` 那一格的 key：按入口進的就是這個面板。 */
    var PANEL_KEY = 'whim'

    /** 字串表的命名空間。 */
    var NS = 'dsh-whim'

    /**
     * ⚠️ DSH 內建的語言 id 是 **`zh` 與 `en`**（官方外掛的寫法是
     * `ctx.locale.register(ns, { zh, en })`）。只註冊 `zh-CN`／`zh-TW` 的話，
     * 中文介面會一路 fallback 到英文——面板看起來「有翻譯」，其實全部是 en。
     *
     * 所以：`zh` ＝ 簡中（DSH 的 `zh` 就是簡中）、`zh-CN` 併同一份、
     * `zh-TW` 另給繁中、`en` 英文。四份的 key 必須完全一致，少一個就掉字。
     */

    /** 簡體中文：DSH 內建 `zh` 用的那一份。 */
    var zhHans = {
      'app.title': '念头',
      'app.tagline': '冒出来、查清楚、放下。',
      'nav.label': '念头',
      'composer.placeholder': '冒出一个念头…（例：哪个 PDF 库支持中文）',
      'composer.send': '查',
      'composer.busy': '查…',
      'list.title': '最近的念头',
      'list.empty': '还没有念头。上面写一句，它会自己开一个对话。',
      'group.today': '今天',
      'group.week': '本周',
      'group.earlier': '更早',
      'status.open': '查询中',
      'status.done': '有结论',
      'status.failed': '失败',
      'detail.empty': '左边选一笔，这里显示它的结论。',
      'detail.pending': '正在另一个对话里查…',
      'detail.answer': '结论',
      'detail.log': '过程（log.md）',
      'action.drop': '放下',
      'action.confirm': '确定放下？',
      'action.open': '打开对话',
      'action.openHint': '在 DSH 自己的对话里继续问——工具、权限、中断都是原生的。',
      'foot.files': '档案都在',
      'error.noSession': '这台 DSH 没有对话服务（remote.session），开不了新对话。',
      'error.empty': '先写一句再查。',
      'setup.title': '念头要放在哪里？',
      'setup.subtitle': '选一个文件夹。一个念头一个子文件夹，结论写成 Markdown。',
      'setup.hint': '~ 会展开成你的家目录。文件夹不存在会自动建立。',
      'setup.detected': '检测到默认位置已经有资料——选它就会接上。',
      'setup.start': '开始',
      'setup.busy': '建立中…',
      'setup.cancel': '取消',
      'setup.change': '换位置',
      'setup.moveNote': '旧资料不会搬移，只会换地方读写。',
      'setup.empty': '先给一个文件夹路径。',
      'setup.browse': '浏览…',
      'setup.browseFailed': '打不开文件夹选择器，请直接输入路径。',
    }

    /** 繁體中文：給 `zh-TW`。 */
    var zhHant = {
      'app.title': '念頭',
      'app.tagline': '冒出來、查清楚、放下。',
      'nav.label': '念頭',
      'composer.placeholder': '冒出一個念頭…（例：哪個 PDF 庫支援中文）',
      'composer.send': '查',
      'composer.busy': '查…',
      'list.title': '最近的念頭',
      'list.empty': '還沒有念頭。上面寫一句，它會自己開一個對話。',
      'group.today': '今天',
      'group.week': '本週',
      'group.earlier': '更早',
      'status.open': '查詢中',
      'status.done': '有結論',
      'status.failed': '失敗',
      'detail.empty': '左邊選一筆，這裡顯示它的結論。',
      'detail.pending': '正在另一個對話裡查…',
      'detail.answer': '結論',
      'detail.log': '過程（log.md）',
      'action.drop': '放下',
      'action.confirm': '確定放下？',
      'action.open': '開啟對話',
      'action.openHint': '在 DSH 自己的對話裡繼續問——工具、權限、中斷都是原生的。',
      'foot.files': '檔案都在',
      'error.noSession': '這台 DSH 沒有對話服務（remote.session），開不了新對話。',
      'error.empty': '先寫一句再查。',
      'setup.title': '念頭要放在哪裡？',
      'setup.subtitle': '選一個資料夾。一個念頭一個子資料夾，結論寫成 Markdown。',
      'setup.hint': '~ 會展開成你的家目錄。資料夾不存在會自動建立。',
      'setup.detected': '偵測到預設位置已經有資料——選它就會接上。',
      'setup.start': '開始',
      'setup.busy': '建立中…',
      'setup.cancel': '取消',
      'setup.change': '換位置',
      'setup.moveNote': '舊資料不會搬移，只會換地方讀寫。',
      'setup.empty': '先給一個資料夾路徑。',
      'setup.browse': '瀏覽…',
      'setup.browseFailed': '打不開資料夾選擇器，請直接輸入路徑。',
    }

    var en = {
      'app.title': 'Whims',
      'app.tagline': 'Drop it in, get an answer, let it go.',
      'nav.label': 'Whims',
      'composer.placeholder': 'Drop a thought… (e.g. which PDF library handles CJK)',
      'composer.send': 'Ask',
      'composer.busy': 'Asking…',
      'list.title': 'Recent whims',
      'list.empty': 'No whims yet. Type one above — it opens its own session.',
      'group.today': 'Today',
      'group.week': 'This week',
      'group.earlier': 'Earlier',
      'status.open': 'Asking',
      'status.done': 'Answered',
      'status.failed': 'Failed',
      'detail.empty': 'Pick one on the left to read its answer.',
      'detail.pending': 'Asking in a separate session…',
      'detail.answer': 'Answer',
      'detail.log': 'Transcript (log.md)',
      'action.drop': 'Let go',
      'action.confirm': 'Delete it?',
      'action.open': 'Open chat',
      'action.openHint': 'Continue in the DSH conversation itself — tools, permissions and interrupts are native there.',
      'foot.files': 'Files live in',
      'error.noSession': 'This DSH has no conversation service (remote.session), so no whim can be asked.',
      'error.empty': 'Write the thought first.',
      'setup.title': 'Where should whims live?',
      'setup.subtitle': 'Pick a folder. One whim per subfolder, the answer as Markdown.',
      'setup.hint': '~ expands to your home folder. Missing folders are created.',
      'setup.detected': 'The default location already has data — pick it to reconnect.',
      'setup.start': 'Start',
      'setup.busy': 'Setting up…',
      'setup.cancel': 'Cancel',
      'setup.change': 'Change location',
      'setup.moveNote': 'Existing data stays where it is; only reads and writes move.',
      'setup.empty': 'Give it a folder path first.',
      'setup.browse': 'Browse…',
      'setup.browseFailed': 'Could not open the folder picker — type the path instead.',
    }

    /** 語言 id → 字串表。`zh` 必須在裡面，否則中文介面會掉回英文。 */
    var DICTS = { en: en, zh: zhHans, 'zh-CN': zhHans, 'zh-TW': zhHant }

    /** 面板的 ctx；`remote.session` 之類的服務要靠它 lazy 取得。 */
    var ctxRef = null

    /** 翻譯函式。apply 時若有 locale 服務就換成綁好命名空間的那一個。 */
    var t = function (key) {
      return zhHans[key] !== undefined ? zhHans[key] : key
    }

    /* ------------------------------- 小工具 ------------------------------- */

    function messageOf(error) {
      if (error === null || error === undefined) return '沒有回報原因'
      var message = error.message
      if (typeof message === 'string' && message !== '') return message
      return String(error)
    }

    function pad2(value) {
      return String(value).padStart(2, '0')
    }

    function humanStamp(date) {
      return (
        String(date.getFullYear()) +
        '-' +
        pad2(date.getMonth() + 1) +
        '-' +
        pad2(date.getDate()) +
        ' ' +
        pad2(date.getHours()) +
        ':' +
        pad2(date.getMinutes())
      )
    }

    function startOfDay(date) {
      var copy = new Date(date.getTime())
      copy.setHours(0, 0, 0, 0)
      return copy
    }

    /** 今天／本週／更早（週一算一週的開始）。 */
    function groupOf(iso, now) {
      var date = new Date(iso)
      if (Number.isNaN(date.getTime())) return 'earlier'
      var today = startOfDay(now)
      var day = startOfDay(date)
      if (day.getTime() === today.getTime()) return 'today'
      var weekStart = new Date(today.getTime())
      weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7))
      return day.getTime() >= weekStart.getTime() ? 'week' : 'earlier'
    }

    function shortTime(iso, now) {
      var date = new Date(iso)
      if (Number.isNaN(date.getTime())) return ''
      if (groupOf(iso, now) === 'today') return pad2(date.getHours()) + ':' + pad2(date.getMinutes())
      return pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
    }

    function longTime(iso) {
      var date = new Date(iso)
      return Number.isNaN(date.getTime()) ? '' : humanStamp(date)
    }

    /** 狀態三態：open（查詢中）／answered（有結論）／failed（失敗）。 */
    function statusOf(meta) {
      var status = meta !== null && typeof meta === 'object' ? String(meta.status ?? '') : ''
      if (status === 'answered') return 'done'
      if (status === 'failed') return 'failed'
      return 'open'
    }

    function statusLabel(status) {
      if (status === 'answered') return t('status.done')
      if (status === 'failed') return t('status.failed')
      return t('status.open')
    }

    function quoteLines(text) {
      return String(text)
        .split('\n')
        .map(function (line) {
          return '> ' + line
        })
        .join('\n')
    }

    /** log.md 的全文。整份取代，兩邊不各拼一半。 */
    function logFile(meta, rounds) {
      var lines = ['# 念頭 · ' + String(meta.id), '', quoteLines(meta.question), '']
      lines.push('建立：' + longTime(meta.createdAt))
      for (var index = 0; index < rounds.length; index += 1) {
        var round = rounds[index]
        lines.push('', '## ' + humanStamp(round.at) + ' · 問', '', quoteLines(round.question))
        lines.push('', '## ' + humanStamp(round.at) + ' · 答', '')
        lines.push(round.answer === '' ? '（沒有回覆）' : round.answer)
      }
      lines.push('')
      return lines.join('\n')
    }

    /**
     * 調查官規則（M1 用 preamble，M2 才收進 preset）。
     *
     * 「臨時」兩個字的操作化定義就是這幾條。沒有它，模型會自動把你當成在啟動一個專案。
     * ⚠️ 第 6 條（不要寫檔案）是 M1 的刻意選擇：結論由面板寫回 findings.md，
     *    agent 不必動手，也就不會在別的 session 裡跳出沙盒批准。
     */
    var PREAMBLE = [
      '你現在在處理一個「念頭」：一次性的臨時調查。',
      '',
      '1. 只回答這一題。不建專案、不寫計劃書、不做多階段重構。',
      '2. 能直接答就直接答（400 字以內）；需要查資料就先查再答。',
      '3. 結論直接寫在回覆裡：答案、關鍵事實、來源連結（有就給）、不確定處。',
      '4. 最多 6 個工具回合。超過就停下，寫「查到什麼、還缺什麼」。',
      '5. 不要反問澄清問題，除非這一題真的無法回答。',
      '6. 不要建立或修改任何檔案。',
      '',
      '念頭：',
    ].join('\n')

    /* -------------------------------- 宿主 RPC -------------------------------- */

    function rpc(op, args) {
      var url = RPC_PATH + '?op=' + encodeURIComponent(op)
      return fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args === undefined ? {} : args),
      })
        .then(function (response) {
          return response.json().catch(function () {
            throw new Error('宿主半回了不是 JSON 的東西（HTTP ' + String(response.status) + '）')
          })
        })
        .then(function (payload) {
          if (payload !== null && typeof payload === 'object' && payload.ok === true) return payload.value
          var reason =
            payload !== null && typeof payload === 'object' && payload.error
              ? String(payload.error)
              : '沒有回報原因'
          throw new Error(op + ' 失敗：' + reason)
        })
    }

    /* ------------------------------ DSH 的 session ------------------------------ */

    /**
     * ⚠️ `remote.session` 不可以放進 client bundle 的 `inject`（見檔頭第 1 條）。
     * 拿不到時回 null，面板回報「這台 DSH 沒有對話服務」，其他功能照常。
     */
    function sessionsService() {
      if (ctxRef === null || typeof ctxRef.get !== 'function') return null
      try {
        var service = ctxRef.get('remote.session')
        return service === undefined || service === null ? null : service
      } catch (error) {
        return null
      }
    }

    /** 把 DSH 的 `RemoteResult` 攤平成值或例外（它不會因為傳輸問題 reject）。 */
    function unwrapRemote(result, what) {
      if (result !== null && typeof result === 'object' && result.ok === true) return result.value
      var raw = result !== null && typeof result === 'object' && result.error ? result.error : null
      var message = raw === null ? '' : String(raw.message || raw.code || raw)
      throw new Error(what + '失敗：' + (message === '' ? '沒有回報原因' : message))
    }

    function mintRequestId() {
      return 'whim-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
    }

    /** 逐字串流裡只認文字增量；reasoning、工具呼叫一律不猜。 */
    function textDeltaOf(frame) {
      if (frame === null || typeof frame !== 'object') return ''
      if (frame.type !== 'chunk') return ''
      var chunk = frame.chunk
      if (chunk === null || typeof chunk !== 'object') return ''
      if (chunk.type !== 'text-delta') return ''
      return typeof chunk.text === 'string' ? chunk.text : ''
    }

    /** 這一輪結束了嗎（`end` 且 outcome 是 committed）。 */
    function isCommittedEnd(frame) {
      if (frame === null || typeof frame !== 'object' || frame.type !== 'end') return false
      var outcome = frame.outcome
      return outcome !== null && typeof outcome === 'object' && outcome.kind === 'committed'
    }

    /** 放下時順手封存 session：DSH 只有封存，沒有刪除。失敗就算了。 */
    function archiveSession(sessionId) {
      var workspaces = null
      try {
        workspaces = ctxRef === null ? null : ctxRef.get('workspaces')
      } catch (error) {
        workspaces = null
      }
      if (workspaces === null || workspaces === undefined || typeof workspaces.archiveSession !== 'function') {
        return Promise.resolve()
      }
      try {
        return Promise.resolve(workspaces.archiveSession(sessionId)).then(
          function () {},
          function () {},
        )
      } catch (error) {
        return Promise.resolve()
      }
    }

    /**
     * 送一則訊息，並把回覆逐字接回來。
     *
     * ⚠️ 順序不能顛倒：**先開串流，再送 prompt**。反過來模型可能在我們開始聽
     * 之前就開始吐字了。
     */
    function runTurn(service, sessionId, question, onDelta) {
      var controller = typeof AbortController === 'function' ? new AbortController() : undefined
      var stream = service.follow(
        { address: { kind: 'session', sessionId: sessionId }, assistantStream: true },
        controller === undefined ? undefined : controller.signal,
      )
      if (stream === null || typeof stream !== 'object' || typeof stream[Symbol.asyncIterator] !== 'function') {
        throw new Error('DSH 沒有回傳可讀的串流')
      }

      var text = ''
      var pumping = (function () {
        var iterator = stream[Symbol.asyncIterator]()
        return (function step() {
          return iterator.next().then(function (value) {
            if (value.done === true) return text
            var frame = value.value
            if (frame !== null && typeof frame === 'object' && frame.type === 'assistant-stream') {
              var inner = frame.frame
              var delta = textDeltaOf(inner)
              if (delta !== '') {
                text += delta
                onDelta(delta)
              }
              if (isCommittedEnd(inner)) return text
            }
            return step()
          })
        })()
      })().catch(function () {
        // 串流斷掉不是世界末日：已經收到的字還是要留給使用者。
        return text
      })

      return service
        .prompt({
          requestId: mintRequestId(),
          sessionId: sessionId,
          mode: 'queue',
          content: [{ type: 'text', text: PREAMBLE + '\n' + question }],
        })
        .then(function (result) {
          unwrapRemote(result, '送出念頭')
          return pumping
        })
        .then(function () {
          return text.trim()
        })
    }

    /* --------------------------------- 圖示 --------------------------------- */

    /**
     * 側欄那一顆：一個四角星加兩顆淡掉的回聲——「一個念頭，和它留下的一點痕跡」。
     *
     * 用 `currentColor`：側欄本來就會依選中／未選中換顏色，跟著它走兩個主題都安全。
     */
    function IconWhim(props) {
      var size =
        props !== null && props !== undefined && typeof props.size === 'number' && props.size > 0 ? props.size : 16
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M8 1.6 9.35 6.65 14.4 8 9.35 9.35 8 14.4 6.65 9.35 1.6 8 6.65 6.65Z',
          fill: 'currentColor',
        }),
        h('circle', { cx: 13.15, cy: 3.35, r: 1.15, fill: 'currentColor', opacity: 0.5 }),
        h('circle', { cx: 3.05, cy: 12.7, r: 0.9, fill: 'currentColor', opacity: 0.35 }),
      )
    }

    /* --------------------------------- 面板 --------------------------------- */

    function WhimPage() {
      var itemsState = React.useState([])
      var items = itemsState[0]
      var setItems = itemsState[1]

      var rootState = React.useState('')
      var root = rootState[0]
      var setRoot = rootState[1]

      var loadedState = React.useState(false)
      var loaded = loadedState[0]
      var setLoaded = loadedState[1]

      var draftState = React.useState('')
      var draft = draftState[0]
      var setDraft = draftState[1]

      var selectedState = React.useState('')
      var selected = selectedState[0]
      var setSelected = selectedState[1]

      var detailState = React.useState(null)
      var detail = detailState[0]
      var setDetail = detailState[1]

      var liveState = React.useState('')
      var live = liveState[0]
      var setLive = liveState[1]

      var busyState = React.useState('')
      var busy = busyState[0]
      var setBusy = busyState[1]

      var errorState = React.useState('')
      var error = errorState[0]
      var setError = errorState[1]

      var confirmingState = React.useState('')
      var confirming = confirmingState[0]
      var setConfirming = confirmingState[1]

      var configuredState = React.useState(false)
      var configured = configuredState[0]
      var setConfigured = configuredState[1]

      /** 這個資料夾註冊成的 DSH workspace；空字串＝還沒拿到。 */
      var workspaceState = React.useState('')
      var workspaceId = workspaceState[0]
      var setWorkspaceId = workspaceState[1]

      var defaultRootState = React.useState('')
      var defaultRoot = defaultRootState[0]
      var setDefaultRoot = defaultRootState[1]

      var defaultHasIndexState = React.useState(false)
      var defaultHasIndex = defaultHasIndexState[0]
      var setDefaultHasIndex = defaultHasIndexState[1]

      /** `null` ＝ 不在設定畫面；否則 `{ path, busy, error }`。 */
      var setupState = React.useState(null)
      var setup = setupState[0]
      var setSetup = setupState[1]

      var mountedRef = React.useRef(true)
      var confirmTimerRef = React.useRef(null)

      /**
       * 設定畫面是「單向」的：使用者按下開始或取消之後就記下來，之後任何一次
       * `refresh()` 都不准再自己把它打開。少了這個閘門，一次慢回來的 `whim.list`
       * 就會把面板從主畫面踢回設定畫面——使用者看到的「兩個狀態反覆跳」。
       */
      var setupDismissedRef = React.useRef(false)

      /**
       * 只認最新一次 `refresh()` 的回應。
       *
       * 舊的 `whim.list` 回應比新的晚到時，會把畫面拉回上一個狀態——使用者在設定
       * 畫面與主畫面之間來回跳，就是這樣發生的。號碼對不上就整包丟掉。
       */
      var refreshSeqRef = React.useRef(0)

      /** 防止同一個問題被送兩次（連點、Enter＋點擊、重新掛載）。 */
      var askingRef = React.useRef(false)

      React.useEffect(function () {
        mountedRef.current = true
        refresh()
        return function () {
          mountedRef.current = false
          if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current)
        }
        // refresh 只用穩定的 setState，跑一次就好
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])

      /**
       * 每一次 `refresh()` 都拿一個流水號；只有最後一次發出的回應可以改狀態。
       *
       * 沒有這個守衛，先發出、後回應的舊結果會蓋掉新的（例如「剛選好資料夾」之後
       * 才回來的舊 `configured:false`），畫面就會在設定頁與主面板之間來回跳。
       */
      function refresh() {
        refreshSeqRef.current += 1
        var seq = refreshSeqRef.current
        return rpc('whim.list')
          .then(function (value) {
            if (mountedRef.current === false) return undefined
            if (seq !== refreshSeqRef.current) return undefined
            var info = value !== null && typeof value === 'object' ? value : {}
            var list = Array.isArray(info.items) ? info.items : []
            var isConfigured = info.configured === true
            var preset = typeof info.defaultRoot === 'string' ? info.defaultRoot : ''

            setItems(list)
            setConfigured(isConfigured)
            setRoot(isConfigured && typeof info.root === 'string' ? info.root : '')
            setDefaultRoot(preset)
            setDefaultHasIndex(info.defaultHasIndex === true)
            setLoaded(true)

            /**
             * 還沒選過位置 → 直接進設定畫面，預填預設路徑。
             *
             * 只有「這次真的還沒設定」而且「使用者這回合還沒自己關掉設定頁」才開。
             * 少了後半段條件，任何一次背景 refresh 都會把使用者剛關掉的設定頁又推回來。
             */
            if (isConfigured === false) {
              if (setupDismissedRef.current === true) return undefined
              setSetup(function (previous) {
                if (previous !== null) return previous
                return { path: preset, busy: false, error: '', change: false }
              })
              return undefined
            }

            // 設定好了：這一回合就不會再回到設定頁。
            setupDismissedRef.current = true

            /**
             * 舊設定檔沒有 workspaceId（或 workspace 被刪掉了）。
             *
             * 這時候補註冊一次，讓接下來的新念頭掛回 DSH 的側欄。失敗也不要緊：
             * 下面會退回用 `cwd` 開 session，功能不減。
             */
            var knownWorkspaceId = typeof info.workspaceId === 'string' ? info.workspaceId : ''
            var currentRoot = typeof info.root === 'string' ? info.root : ''
            if (knownWorkspaceId === '' && currentRoot !== '') {
              registerWorkspace(currentRoot).then(function (nextWorkspaceId) {
                if (mountedRef.current === false) return undefined
                if (nextWorkspaceId === '') return undefined
                setWorkspaceId(nextWorkspaceId)
                return rpc('whim.setRoot', { path: currentRoot, workspaceId: nextWorkspaceId }).catch(function () {
                  return undefined
                })
              })
              return undefined
            }

            setWorkspaceId(knownWorkspaceId)
            return undefined
          })
          .catch(function (failure) {
            if (mountedRef.current === false) return undefined
            if (seq !== refreshSeqRef.current) return undefined
            setLoaded(true)
            setError(messageOf(failure))
            return undefined
          })
      }

      function loadDetail(id) {
        return rpc('whim.read', { id: id })
          .then(function (value) {
            if (mountedRef.current === false) return undefined
            setDetail({
              id: id,
              meta: value !== null && typeof value === 'object' ? value.meta : {},
              findings: value !== null && typeof value === 'object' && typeof value.findings === 'string' ? value.findings : '',
              log: value !== null && typeof value === 'object' && typeof value.log === 'string' ? value.log : '',
            })
            return undefined
          })
          .catch(function (failure) {
            if (mountedRef.current === false) return undefined
            setError(messageOf(failure))
            return undefined
          })
      }

      function select(id) {
        setSelected(id)
        setConfirming('')
        if (detail !== null && detail.id === id) return
        setDetail(null)
        loadDetail(id)
      }

      /**
       * 把資料夾註冊成 DSH 的 workspace。
       *
       * 「一個資料夾 = 一個 workspace」是唯一的工作區模型：資料夾裡每個念頭都開
       * 一個 session 掛在它底下，所以那段對話會出現在 DSH 自己的側欄，用 DSH 自己
       * 的介面繼續問。註冊是幂等的——同一個路徑再註冊一次只會拿回同一個 id。
       *
       * 拿不到服務（舊版 DSH）就回空字串：退回用 `cwd` 開 session，功能不減，
       * 只是對話不會歸在 workspace 底下。
       */
      function registerWorkspace(path) {
        var service = null
        try {
          service = ctxRef === null ? null : ctxRef.get('workspaces')
        } catch (error) {
          service = null
        }
        if (service === null || service === undefined || typeof service.create !== 'function') {
          return Promise.resolve('')
        }
        return Promise.resolve(service.create({ path: path }))
          .then(function (workspace) {
            return workspace !== null && typeof workspace === 'object' && typeof workspace.workspaceId === 'string'
              ? workspace.workspaceId
              : ''
          })
          .catch(function () {
            return ''
          })
      }

      /**
       * 把使用者帶到 DSH 原生的對話介面。
       *
       * 這是「一個念頭 = 一個真正的 DSH 對話」的關鍵：後續追問、工具輸出、
       * 權限詢問、中斷全部走 DSH 自己的流程，插件不重畫聊天室。
       * 拿不到服務就維持原本的插件內顯示，不會因此卡住。
       */
      function openNativeSession(sessionId) {
        if (typeof sessionId !== 'string' || sessionId === '') return
        var service = null
        try {
          service = ctxRef === null ? null : ctxRef.get('uiWorkspace')
        } catch (error) {
          service = null
        }
        if (service === null || service === undefined || typeof service.openSession !== 'function') return
        try {
          service.openSession(sessionId)
        } catch (error) {
          return
        }
      }

      /**
       * 依念頭 id 找到它對應的 session，交給 `openNativeSession()`。
       *
       * 這是「開啟對話」按鈕的實作：先從已經載入的 detail / items 找 sessionId，
       * 找不到才回伺服器讀一次。這一步是使用者主動按的，不是自動導航。
       */
      function openChat(id) {
        if (typeof id !== 'string' || id === '') return Promise.resolve(undefined)
        var known = ''
        if (detail !== null && detail.id === id && detail.meta !== null && typeof detail.meta === 'object') {
          known = typeof detail.meta.sessionId === 'string' ? detail.meta.sessionId : ''
        }
        if (known === '') {
          var hit = null
          for (var index = 0; index < items.length; index += 1) {
            if (items[index] !== null && typeof items[index] === 'object' && items[index].id === id) {
              hit = items[index]
              break
            }
          }
          if (hit !== null && hit.meta !== null && typeof hit.meta === 'object') {
            known = typeof hit.meta.sessionId === 'string' ? hit.meta.sessionId : ''
          }
        }
        if (known !== '') {
          openNativeSession(known)
          return Promise.resolve(undefined)
        }
        return rpc('whim.read', { id: id })
          .then(function (value) {
            if (value !== null && typeof value === 'object' && value.meta !== null && typeof value.meta === 'object') {
              var sessionId = typeof value.meta.sessionId === 'string' ? value.meta.sessionId : ''
              if (sessionId !== '') openNativeSession(sessionId)
            }
            return undefined
          })
          .catch(function () {
            return undefined
          })
      }

      function runWhim(service, created, question) {
        return Promise.resolve()
          .then(function () {
            // 有 workspace 就掛在它底下（對話會出現在 DSH 側欄），沒有就退回用 cwd。
            return workspaceId === ''
              ? service.create({ cwd: created.root })
              : service.create({ workspaceId: workspaceId })
          })
          .then(function (result) {
            var value = unwrapRemote(result, '開新對話')
            var sessionId =
              value !== null && typeof value === 'object' && typeof value.sessionId === 'string' ? value.sessionId : ''
            if (sessionId === '') throw new Error('DSH 沒有回傳 session id')
            return rpc('whim.save', { id: created.id, meta: { sessionId: sessionId } }).then(function () {
              /**
               * 這一輪留在插件裡跑完，不中途切走。
               *
               * 先前的做法是建立 session 後立刻 `openNativeSession()`，把畫面切到
               * DSH 原生對話；但插件自己的 `runTurn` 還在串流，原生對話又自己開
               * 一輪，兩邊互相覆蓋，使用者看到的就是「兩個狀態來回跳」。
               * 現在改成：插件內跑完、把答案顯示出來，再讓使用者自己按「開啟對話」
               * 決定要不要去原生介面繼續。
               */
              return sessionId
            })
          })
          .then(function (sessionId) {
            return runTurn(service, sessionId, question, function (delta) {
              if (mountedRef.current === false) return
              setLive(function (previous) {
                return previous + delta
              })
            }).then(function (answer) {
              var rounds = [{ at: new Date(), question: question, answer: answer }]
              return rpc('whim.save', {
                id: created.id,
                log: logFile(created.meta, rounds),
                findings: answer,
                meta: { status: answer === '' ? 'failed' : 'answered', rounds: 1 },
              })
            })
          })
      }

      function ask() {
        if (askingRef.current === true) return
        if (busy !== '') return
        var question = draft.trim()
        if (question === '') {
          setError(t('error.empty'))
          return
        }
        var service = sessionsService()
        if (service === null || typeof service.create !== 'function') {
          setError(t('error.noSession'))
          return
        }

        // 同步上鎖：`busy` 是 state，要等 render 才看得到；連點兩下或 Enter
        // 與點擊幾乎同時發生時，只有 ref 擋得住第二次送出。
        askingRef.current = true

        setError('')
        setDraft('')
        setConfirming('')
        var created = null

        rpc('whim.create', { question: question })
          .then(function (value) {
            created = value
            setSelected(value.id)
            setDetail({ id: value.id, meta: value.meta, findings: '', log: '' })
            setLive('')
            setBusy(value.id)
            return refresh()
          })
          .then(function () {
            return runWhim(service, created, question)
          })
          .catch(function (failure) {
            var message = messageOf(failure)
            if (mountedRef.current) setError(message)
            if (created === null) return undefined
            // 失敗也要留痕：問題還在 log.md 裡，狀態標成 failed。
            return rpc('whim.save', {
              id: created.id,
              log: logFile(created.meta, [{ at: new Date(), question: question, answer: '' }]),
              meta: { status: 'failed' },
            }).catch(function () {
              return undefined
            })
          })
          .then(function () {
            askingRef.current = false
            if (mountedRef.current === false) return
            setBusy('')
            setLive('')
            if (created === null) return
            refresh()
            loadDetail(created.id)
          })
      }

      function drop(id) {
        if (confirming !== id) {
          setConfirming(id)
          if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current)
          confirmTimerRef.current = setTimeout(function () {
            if (mountedRef.current) setConfirming('')
          }, 4000)
          return
        }
        if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current)
        setConfirming('')

        var target = null
        for (var index = 0; index < items.length; index += 1) {
          if (items[index].id === id) target = items[index]
        }
        var sessionId = target !== null && typeof target.sessionId === 'string' ? target.sessionId : ''

        rpc('whim.drop', { id: id })
          .then(function () {
            return sessionId === '' ? undefined : archiveSession(sessionId)
          })
          .then(function () {
            return refresh()
          })
          .then(function () {
            if (mountedRef.current === false) return
            if (selected === id) {
              setSelected('')
              setDetail(null)
            }
          })
          .catch(function (failure) {
            if (mountedRef.current) setError(messageOf(failure))
          })
      }

      /* ------------------------------ 儲存位置 ------------------------------ */

      /** 從標題列「換位置」進來：把目前的 root 預填好。 */
      function openSetup() {
        // 使用者主動要求換位置：這一回合允許設定畫面存在。
        setupDismissedRef.current = false
        setSetup({ path: root === '' ? defaultRoot : root, busy: false, error: '', change: true })
      }

      function cancelSetup() {
        // 使用者自己關掉：之後的 `refresh()` 不准再把它打開。
        setupDismissedRef.current = true
        setSetup(null)
      }

      /**
       * 原生資料夾選擇器：走 DSH 的 `uiWorkspace.pickDirectory()`。
       *
       * 拿不到服務（舊版 DSH、或使用者在非桌面環境）就退回手動輸入——
       * 選擇器是方便，不是必要條件，壞了不能把設定畫面卡死。
       */
      function browseSetup() {
        if (setup === null || setup.busy === true) return
        var service = null
        try {
          service = ctxRef === null ? null : ctxRef.get('uiWorkspace')
        } catch (error) {
          service = null
        }
        if (service === null || service === undefined || typeof service.pickDirectory !== 'function') {
          setSetup(function (previous) {
            if (previous === null) return previous
            return Object.assign({}, previous, { error: t('setup.browseFailed') })
          })
          return
        }

        Promise.resolve(service.pickDirectory())
          .then(function (picked) {
            if (mountedRef.current === false) return undefined
            if (typeof picked !== 'string' || picked.trim() === '') return undefined
            setSetup(function (previous) {
              if (previous === null) return previous
              return Object.assign({}, previous, { path: picked, error: '' })
            })
            return undefined
          })
          .catch(function (failure) {
            if (mountedRef.current === false) return undefined
            setSetup(function (previous) {
              if (previous === null) return previous
              return Object.assign({}, previous, { error: messageOf(failure) })
            })
            return undefined
          })
      }

      /**
       * 按下「開始」：把使用者選的資料夾寫進宿主半的設定，然後重新載入。
       *
       * 失敗（路徑不合法、DSH_WHIM_ROOT 已被佔用…）就把錯誤留在畫面上，
       * 不要把使用者丟回主頁面——他正看著那個輸入框。
       */
      function startSetup() {
        if (setup === null || setup.busy === true) return
        var target = String(setup.path ?? '').trim()
        if (target === '') {
          setSetup(Object.assign({}, setup, { error: t('setup.empty') }))
          return
        }

        setSetup(function (previous) {
          return previous === null ? previous : Object.assign({}, previous, { busy: true, error: '' })
        })

        registerWorkspace(target)
          .then(function (nextWorkspaceId) {
            return rpc('whim.setRoot', { path: target, workspaceId: nextWorkspaceId })
          })
          .then(function (value) {
            if (mountedRef.current === false) return undefined
            var nextRoot =
              value !== null && typeof value === 'object' && typeof value.root === 'string' ? value.root : target
            // 設定完成：這一回合不再自動彈設定畫面。
            setupDismissedRef.current = true
            setConfigured(true)
            setRoot(nextRoot)
            setWorkspaceId(
              value !== null && typeof value === 'object' && typeof value.workspaceId === 'string'
                ? value.workspaceId
                : '',
            )
            setSetup(null)
            setSelected('')
            setDetail(null)
            setError('')
            return refresh()
          })
          .catch(function (failure) {
            if (mountedRef.current === false) return undefined
            setSetup(function (previous) {
              if (previous === null) return previous
              return Object.assign({}, previous, { busy: false, error: messageOf(failure) })
            })
            return undefined
          })
      }

      /* ------------------------------ 清單 ------------------------------ */

      var now = new Date()
      var rows = []
      var lastGroup = ''
      for (var index = 0; index < items.length; index += 1) {
        var item = items[index]
        var group = groupOf(item.updatedAt, now)
        if (group !== lastGroup) {
          rows.push(
            h(
              'div',
              {
                key: 'group-' + group,
                className: 'dsh-whim-group' + (lastGroup === '' ? '' : ' is-pushed'),
              },
              t('group.' + group),
            ),
          )
          lastGroup = group
        }
        var active = item.id === selected
        rows.push(
          h(
            'button',
            {
              key: item.id,
              type: 'button',
              className: 'dsh-whim-row' + (active ? ' is-active' : ''),
              'aria-current': active ? 'true' : undefined,
              onClick: (function (id) {
                return function () {
                  select(id)
                }
              })(item.id),
            },
            h('span', { className: 'dsh-whim-dot is-' + statusOf(item) }),
            h('span', { className: 'dsh-whim-rowLabel' }, String(item.title || item.question || item.id)),
            h('span', { className: 'dsh-whim-rowTime' }, shortTime(item.updatedAt, now)),
          ),
        )
      }

      /* ------------------------------ 詳情 ------------------------------ */

      var streaming = detail !== null && busy !== '' && busy === detail.id
      var answer = detail === null ? '' : streaming ? live : String(detail.findings ?? '')
      var detailNode

      if (detail === null) {
        detailNode = h(
          'p',
          { className: 'dsh-whim-placeholder' },
          busy !== '' ? t('detail.pending') : t('detail.empty'),
        )
      } else {
        detailNode = h(
          'div',
          { className: 'dsh-whim-detailInner' },
          h('h2', { className: 'dsh-whim-question' }, String(detail.meta.title || detail.meta.question || '')),
          h(
            'div',
            { className: 'dsh-whim-meta' },
            h(
              'span',
              { className: 'dsh-whim-chip is-' + statusOf(detail.meta) + (streaming ? ' is-live' : '') },
              statusLabel(detail.meta.status),
            ),
            h('span', { className: 'dsh-whim-metaText' }, longTime(detail.meta.updatedAt)),
          ),
          h('div', { className: 'dsh-whim-sectionLabel' }, t('detail.answer')),
          answer.trim() === ''
            ? h('p', { className: 'dsh-whim-hint' }, streaming ? t('detail.pending') : '—')
            : h(
                'div',
                { className: 'dsh-whim-answer' },
                answer,
                streaming ? h('span', { className: 'dsh-whim-caret', 'aria-hidden': 'true' }) : null,
              ),
          detail.log !== '' && streaming === false
            ? h(
                'details',
                { className: 'dsh-whim-log' },
                h('summary', null, t('detail.log')),
                h('pre', null, detail.log),
              )
            : null,
          h(
            'div',
            { className: 'dsh-whim-actions' },
            /**
             * 「開啟對話」：把這一輪帶去 DSH 原生的對話介面。
             *
             * 插件不重畫聊天室——工具呼叫、權限詢問、中斷、附件都是原生元件。
             * 只有在這一輪已經有 session（真的開過對話）時才顯示，避免按下後沒反應。
             */
            detail.meta !== null &&
            typeof detail.meta === 'object' &&
            typeof detail.meta.sessionId === 'string' &&
            detail.meta.sessionId !== ''
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-whim-btn dsh-whim-btn-primary',
                    title: t('action.openHint'),
                    onClick: function () {
                      openChat(detail.id)
                    },
                  },
                  t('action.open'),
                )
              : null,
            h(
              'button',
              {
                type: 'button',
                className:
                  'dsh-whim-btn dsh-whim-btn-ghost' + (confirming === detail.id ? ' is-danger' : ''),
                onClick: function () {
                  drop(detail.id)
                },
              },
              confirming === detail.id ? t('action.confirm') : t('action.drop'),
            ),
          ),
        )
      }

      /* ------------------------------ 設定畫面 ------------------------------ */

      if (setup !== null) {
        var setupBusy = setup.busy === true
        var setupError = typeof setup.error === 'string' ? setup.error : ''
        var changing = setup.change === true

        return h(
          'div',
          { className: 'dsh-whim-page dsh-whim-setup' },
          h(
            'div',
            { className: 'dsh-whim-setupInner' },
            h('h1', { className: 'dsh-whim-setupTitle' }, t('setup.title')),
            h('p', { className: 'dsh-whim-setupSub' }, t('setup.subtitle')),
            h(
              'div',
              { className: 'dsh-whim-setupRow' },
              h('input', {
                className: 'dsh-whim-input dsh-whim-setupInput',
                type: 'text',
                value: setup.path,
                placeholder: defaultRoot,
                'aria-label': t('setup.title'),
                disabled: setupBusy,
                onChange: function (event) {
                  setSetup(function (previous) {
                    if (previous === null) return previous
                    return Object.assign({}, previous, { path: event.target.value, error: '' })
                  })
                },
                onKeyDown: function (event) {
                  var composing =
                    event.nativeEvent !== undefined && event.nativeEvent !== null && event.nativeEvent.isComposing === true
                  if (event.key === 'Enter' && composing === false) startSetup()
                },
              }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-whim-btn dsh-whim-btn-ghost dsh-whim-setupBrowse',
                  onClick: browseSetup,
                  disabled: setupBusy,
                },
                t('setup.browse'),
              ),
            ),
            h('p', { className: 'dsh-whim-hint' }, t('setup.hint')),
            defaultHasIndex === true
              ? h('p', { className: 'dsh-whim-hint is-accent' }, t('setup.detected'))
              : null,
            setupError === '' ? null : h('div', { className: 'dsh-whim-alert is-inline', role: 'alert' }, setupError),
            h(
              'div',
              { className: 'dsh-whim-setupActions' },
              changing
                ? h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-whim-btn dsh-whim-btn-ghost',
                      onClick: cancelSetup,
                      disabled: setupBusy,
                    },
                    t('setup.cancel'),
                  )
                : null,
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-whim-btn dsh-whim-btn-primary',
                  onClick: startSetup,
                  disabled: setupBusy || String(setup.path ?? '').trim() === '',
                },
                setupBusy ? t('setup.busy') : t('setup.start'),
              ),
            ),
            changing ? h('p', { className: 'dsh-whim-hint is-tight' }, t('setup.moveNote')) : null,
          ),
        )
      }

      /* ------------------------------ 版面 ------------------------------ */

      return h(
        'div',
        { className: 'dsh-whim-page' },
        h(
          'header',
          { className: 'dsh-whim-head' },
          h(
            'div',
            null,
            h('h1', { className: 'dsh-whim-title' }, t('app.title')),
            h('p', { className: 'dsh-whim-tagline' }, t('app.tagline')),
          ),
          h(
            'div',
            { className: 'dsh-whim-headRight' },
            items.length > 0 ? h('span', { className: 'dsh-whim-count' }, String(items.length)) : null,
            /**
             * 永遠保留一個「換位置」入口。
             *
             * 設定畫面是單向的：第一次載入若還沒設定會自動開一次，但使用者按下
             * 「取消」之後就不會再自己彈出來。若這個入口也只在 `configured` 時
             * 才顯示，取消後就再也回不到設定畫面——面板上只剩一個不能用來提問的
             * 空殼。所以這裡不加條件，任何時候都能重新選位置。
             */
            h('button', { type: 'button', className: 'dsh-whim-link', onClick: openSetup }, t('setup.change')),
          ),
        ),
        h(
          'div',
          { className: 'dsh-whim-composer' },
          h('input', {
            className: 'dsh-whim-input',
            type: 'text',
            value: draft,
            placeholder: t('composer.placeholder'),
            'aria-label': t('composer.placeholder'),
            disabled: busy !== '' || configured === false,
            onChange: function (event) {
              setDraft(event.target.value)
            },
            onKeyDown: function (event) {
              var composing = event.nativeEvent !== undefined && event.nativeEvent !== null && event.nativeEvent.isComposing === true
              if (event.key === 'Enter' && composing === false) ask()
            },
          }),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-whim-btn dsh-whim-btn-primary',
              onClick: ask,
              disabled: busy !== '' || configured === false || draft.trim() === '',
            },
            busy !== '' ? t('composer.busy') : t('composer.send'),
          ),
        ),
        error === ''
          ? null
          : h(
              'div',
              { className: 'dsh-whim-alert', role: 'alert' },
              h('span', { className: 'dsh-whim-alertText' }, error),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-whim-alertClose',
                  'aria-label': 'dismiss',
                  onClick: function () {
                    setError('')
                  },
                },
                '×',
              ),
            ),
        h(
          'div',
          { className: 'dsh-whim-body' },
          h(
            'nav',
            { className: 'dsh-whim-list', 'aria-label': t('list.title') },
            h('div', { className: 'dsh-whim-listHead' }, t('list.title')),
            loaded === false
              ? h('p', { className: 'dsh-whim-hint is-tight' }, '…')
              : items.length === 0
                ? h('p', { className: 'dsh-whim-empty' }, t('list.empty'))
                : rows,
          ),
          h('section', { className: 'dsh-whim-detail' }, detailNode),
        ),
        root === ''
          ? null
          : h(
              'footer',
              { className: 'dsh-whim-foot' },
              h('span', null, t('foot.files')),
              h('code', null, root),
              h('span', { className: 'dsh-whim-build' }, CLIENT_BUILD),
            ),
      )
    }

    /* -------------------------------- 樣式 -------------------------------- */

    var STYLE = [
      '.dsh-whim-page{box-sizing:border-box;display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55;-webkit-font-smoothing:antialiased}',
      '.dsh-whim-page *{box-sizing:border-box}',

      '.dsh-whim-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px 0}',
      '.dsh-whim-title{margin:0;font-size:16px;font-weight:600;letter-spacing:.02em;line-height:1.3}',
      '.dsh-whim-tagline{margin:2px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-whim-count{flex:none;min-width:22px;height:20px;padding:0 7px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:20px;text-align:center}',

      '.dsh-whim-composer{display:flex;gap:8px;padding:12px 20px 14px}',
      '.dsh-whim-input{flex:1 1 auto;min-width:0;height:34px;padding:0 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;outline:none}',
      '.dsh-whim-input::placeholder{color:var(--dsw-alias-label-secondary)}',
      '.dsh-whim-input:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.dsh-whim-input:disabled{opacity:.6}',

      '.dsh-whim-btn{flex:none;height:34px;padding:0 16px;border-radius:8px;border:1px solid transparent;font:inherit;font-weight:500;cursor:pointer;transition:background .12s ease,border-color .12s ease,opacity .12s ease}',
      '.dsh-whim-btn:disabled{opacity:.45;cursor:default}',
      '.dsh-whim-btn-primary{background:var(--dsw-alias-brand-primary);color:#fff;font-weight:600}',
      '.dsh-whim-btn-primary:not(:disabled):hover{filter:brightness(1.06)}',
      '.dsh-whim-btn-ghost{background:transparent;border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);height:30px;padding:0 12px;font-size:12px}',
      '.dsh-whim-btn-ghost:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-whim-btn-ghost.is-danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',

      '.dsh-whim-alert{display:flex;align-items:flex-start;gap:8px;margin:0 20px 10px;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-state-error-primary);font-size:12px}',
      '.dsh-whim-alertText{flex:1 1 auto;min-width:0;word-break:break-word}',
      '.dsh-whim-alertClose{flex:none;background:none;border:none;color:inherit;font-size:15px;line-height:1;cursor:pointer;padding:0 2px;opacity:.7}',
      '.dsh-whim-alertClose:hover{opacity:1}',

      '.dsh-whim-headRight{flex:none;display:flex;align-items:center;gap:10px}',
      '.dsh-whim-link{border:none;background:none;padding:0;font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;text-decoration:underline;text-underline-offset:2px}',
      '.dsh-whim-link:hover{color:var(--dsw-alias-label-primary)}',

      '.dsh-whim-setup{display:flex;align-items:center;justify-content:center;padding:32px 20px}',
      '.dsh-whim-setupInner{width:100%;max-width:520px}',
      '.dsh-whim-setupTitle{margin:0;font-size:18px;font-weight:600;line-height:1.35}',
      '.dsh-whim-setupSub{margin:6px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-whim-setupRow{display:flex;align-items:center;gap:8px;margin-top:18px}',
      '.dsh-whim-setupInput{flex:1 1 auto;min-width:0;height:36px}',
      '.dsh-whim-setupBrowse{flex:none;white-space:nowrap}',
      '.dsh-whim-setupInner .dsh-whim-hint{margin-top:8px}',
      '.dsh-whim-setupInner .dsh-whim-hint.is-accent{color:var(--dsw-alias-brand-primary)}',
      '.dsh-whim-setupInner .dsh-whim-hint.is-tight{margin-top:10px}',
      '.dsh-whim-setupActions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}',
      '.dsh-whim-alert.is-inline{margin:12px 0 0}',

      '.dsh-whim-body{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:minmax(190px,270px) minmax(0,1fr);border-top:1px solid var(--dsw-alias-border-l1)}',

      '.dsh-whim-list{min-height:0;overflow-y:auto;padding:10px 8px 16px;border-right:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-whim-listHead{padding:2px 8px 8px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}',
      '.dsh-whim-group{padding:8px 8px 4px;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-whim-group.is-pushed{margin-top:4px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:10px}',
      '.dsh-whim-empty{margin:6px 8px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6}',
      '.dsh-whim-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.dsh-whim-hint.is-tight{margin:2px 8px}',

      '.dsh-whim-row{display:flex;width:100%;align-items:center;gap:8px;padding:7px 8px;border:none;border-radius:7px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '.dsh-whim-row:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-whim-row.is-active{background:var(--dsw-alias-bg-layer-2)}',
      '.dsh-whim-rowLabel{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-whim-rowTime{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.dsh-whim-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}',
      '.dsh-whim-dot.is-done{background:var(--dsw-alias-state-success-primary)}',
      '.dsh-whim-dot.is-failed{background:var(--dsw-alias-state-error-primary)}',
      '.dsh-whim-dot.is-open{animation:dsh-whim-pulse 1.4s ease-in-out infinite}',
      '@keyframes dsh-whim-pulse{0%,100%{opacity:.35}50%{opacity:1}}',

      '.dsh-whim-detail{min-height:0;overflow-y:auto;padding:18px 22px 22px}',
      '.dsh-whim-detailInner{max-width:78ch}',
      '.dsh-whim-question{margin:0 0 6px;font-size:15px;font-weight:600;line-height:1.45}',
      '.dsh-whim-meta{display:flex;align-items:center;gap:8px;margin-bottom:16px}',
      '.dsh-whim-metaText{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.dsh-whim-chip{display:inline-flex;align-items:center;height:18px;padding:0 8px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-whim-chip.is-done{color:var(--dsw-alias-state-success-primary)}',
      '.dsh-whim-chip.is-failed{color:var(--dsw-alias-state-error-primary)}',
      '.dsh-whim-chip.is-live{color:var(--dsw-alias-brand-primary)}',
      '.dsh-whim-sectionLabel{margin-bottom:6px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}',
      '.dsh-whim-answer{white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.7}',
      '.dsh-whim-caret{display:inline-block;width:6px;height:14px;margin-left:2px;vertical-align:-2px;background:var(--dsw-alias-brand-primary);animation:dsh-whim-blink 1s steps(2,start) infinite}',
      '@keyframes dsh-whim-blink{0%,49%{opacity:1}50%,100%{opacity:0}}',

      '.dsh-whim-log{margin-top:18px}',
      '.dsh-whim-log>summary{cursor:pointer;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);list-style:none;padding:4px 0}',
      '.dsh-whim-log>summary::-webkit-details-marker{display:none}',
      '.dsh-whim-log>summary::before{content:"▸ ";display:inline-block;transition:transform .12s ease}',
      '.dsh-whim-log[open]>summary::before{content:"▾ "}',
      '.dsh-whim-log>pre{margin:6px 0 0;padding:10px 12px;max-height:260px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.65;white-space:pre-wrap;word-break:break-word}',

      '.dsh-whim-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}',
      '.dsh-whim-placeholder{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px}',

      '.dsh-whim-foot{display:flex;align-items:center;gap:6px;padding:7px 20px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-whim-foot code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--dsw-alias-label-secondary)}',
      '.dsh-whim-build{margin-left:auto;opacity:.55}',

      '@media (max-width:820px){.dsh-whim-body{grid-template-columns:minmax(0,1fr)}.dsh-whim-list{border-right:none;border-bottom:1px solid var(--dsw-alias-border-l1);max-height:38%}}',
    ].join('\n')

    /* ------------------------------ 插件出口 ------------------------------ */

    var name = 'dsh-whim'
    var inject = ['slots']

    function apply(ctx) {
      ctxRef = ctx

      ctx.effect(function () {
        var style = document.createElement('style')
        style.setAttribute('data-dsh-plugin', 'dsh-whim')
        style.textContent = STYLE
        document.head.appendChild(style)
        return function () {
          style.remove()
        }
      }, 'dsh-whim: styles')

      // 字串走 locale 服務；拿不到就用內建的中文字表，不要因為翻譯壞掉而整頁空白。
      ctx.effect(function () {
        var locale = null
        try {
          locale = typeof ctx.get === 'function' ? ctx.get('locale') : null
        } catch (error) {
          locale = null
        }
        if (locale === null || locale === undefined || typeof locale.register !== 'function') return undefined

        var disposers = []
        var failures = 0
        Object.keys(DICTS).forEach(function (localeId) {
          try {
            disposers.push(locale.register(NS, localeId, DICTS[localeId]))
          } catch (error) {
            failures += 1
          }
        })
        if (failures === 0 && typeof locale.bind === 'function') {
          try {
            t = locale.bind(NS)
          } catch (error) {
            /* 綁不起來就繼續用內建字表 */
          }
        }
        return function () {
          for (var index = 0; index < disposers.length; index += 1) {
            var dispose = disposers[index]
            if (typeof dispose === 'function') dispose()
          }
        }
      }, 'dsh-whim: locale dictionaries')

      var slots = ctx.get('slots')
      if (slots === undefined || slots === null) return

      // 渲染期崩潰會讓座位「退位」，症狀是「註冊成功、畫面上卻沒有」——記下來才查得動。
      if (typeof slots.onEntryError === 'function') {
        ctx.effect(function () {
          var off = slots.onEntryError(function (key, entry, error) {
            console.warn('[dsh-whim] 座位渲染失敗：' + String(key) + ' — ' + String((error && error.message) || error))
          })
          return function () {
            if (typeof off === 'function') off()
          }
        }, 'dsh-whim: entry error watch')
      }

      // 側欄最上面那一排：一個 id 對一個 `main` key，按下去進的就是下面那一頁。
      slots.inject(
        'sidebar.panellist',
        function () {
          return slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_KEY,
              order: 30,
              label: function () {
                return t('nav.label')
              },
            },
            IconWhim,
          )
        },
        'dsh-whim: sidebar entry',
      )

      slots.inject(
        'main',
        function () {
          return slots.register({ name: 'main', key: PANEL_KEY }, WhimPage)
        },
        'dsh-whim: main panel',
      )
    }

    return (module.exports = {
      name: name,
      inject: inject,
      apply: apply,
      __build: CLIENT_BUILD,
      __dicts: DICTS,
    })
  },
})
