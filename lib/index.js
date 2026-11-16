/**
 * 念頭（dsh-whim）的宿主半。
 *
 * 只做三件事：
 *   1. 掛一條 `/api/dsh-whim/rpc` 路由（來源圍籬先於一切）
 *   2. 記住「念頭放在哪裡」：第一次使用時由使用者在面板上選，
 *      設定寫進 `<DSH_HOME>/whim/config.json`
 *   3. 讀寫 `<root>/index.json` 與 `<root>/w-<日期>-<亂數>/` 底下的 meta／log／findings
 *
 * ⚠️ 硬規則：這個檔案只准 import `node:` 與相對檔案，零執行期依賴。
 * DSH 啟動時會同步導入 loader entry，任何一個頂層 import 解析失敗，整個 `dsh web`
 * 就起不來——那不是「插件壞掉」，是 DSH 壞掉。
 *
 * ⚠️ 第二條硬規則：啟動時不做任何 I/O。資料夾是「第一次真的用到才建」。
 */

import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, normalize } from 'node:path'

/** 這一列在 cordis.patch.yml 裡的 name 必須與它一致。 */
export const name = 'dsh-whim'

/** 唯一的服務依賴：路由載體。其他服務都在瀏覽器半按需取得。 */
export const inject = ['webServer']

/** 面板打的那一條路由。 */
const RPC_PATH = '/api/dsh-whim/rpc'

/** 索引檔名。 */
const INDEX_NAME = 'index.json'

/** 設定檔名：記「念頭放在哪裡」，不是念頭的資料。 */
const CONFIG_NAME = 'config.json'

/** 一個念頭的資料夾名稱：`w-<yyyymmdd>-<4 位小寫英數>`。 */
const ID_SHAPE = /^w-\d{8}-[a-z0-9]{4}$/

/** 面板請求的 body 上限。念頭是文字，1MB 已經非常寬。 */
const MAX_BODY_BYTES = 1_000_000

/** 產生 id 用的字母表（只用小寫與數字：資料夾名在檔案總管裡不會大小寫混亂）。 */
const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/* ------------------------------- 路徑與檔案 ------------------------------- */

/**
 * 預設位置：`~/whims`。
 *
 * 只給面板「預填」與「偵測」用——沒有使用者的選擇就不會寫進去。
 * 位置是使用者的選擇，不是我們的猜測。
 */
function defaultRoot() {
  return join(homedir(), 'whims')
}

/** `DSH_WHIM_ROOT` 的覆寫值；沒有就是空字串。 */
function envOverride() {
  return String(process.env.DSH_WHIM_ROOT ?? '').trim()
}

/** DSH 的家目錄：`DSH_HOME` 優先，否則 `~/.dsh`。 */
function dshHome() {
  const override = String(process.env.DSH_HOME ?? '').trim()
  return override === '' ? join(homedir(), '.dsh') : override
}

/** 這個插件自己的設定檔。 */
function configPath() {
  return join(dshHome(), 'whim', CONFIG_NAME)
}

/**
 * 現在到底該用哪個資料夾。
 *
 * 順序：`DSH_WHIM_ROOT`（環境變數，給測試與自動化）→ 設定檔 → 沒有。
 * 故意不自動採用 `~/whims`：使用者沒選過，就不該有資料夾被悄悄建立。
 *
 * @returns {Promise<{root: string, source: 'env'|'config'|'none'}>}
 */
async function resolveRoot() {
  const override = envOverride()
  if (override !== '') return { root: override, source: 'env' }

  const config = await readJson(configPath()).catch(() => undefined)
  const saved = isRecord(config) && typeof config.root === 'string' ? config.root.trim() : ''
  if (saved !== '') return { root: saved, source: 'config' }
  return { root: '', source: 'none' }
}

/** 已設定時回傳根目錄；還沒選過就丟——呼叫端會把它變成面板上的一行字。 */
async function requireRoot() {
  const found = await resolveRoot()
  if (found.root === '') throw new Error('還沒選念頭要放在哪裡')
  return found.root
}

/** `~` 展開成家目錄；其餘原樣。 */
function expandPath(input) {
  const raw = String(input ?? '').trim()
  if (raw === '') throw new Error('資料夾路徑不可以是空的')
  if (raw === '~') return homedir()
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return join(homedir(), raw.slice(2))
  return raw
}

/** 一次念頭的資料夾。id 先過白名單，所以不可能跳出 root。 */
function whimDir(root, id) {
  if (typeof id !== 'string' || !ID_SHAPE.test(id)) {
    throw new Error(`念頭 id 不合法（${String(id)}）`)
  }
  return join(root, id)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && Array.isArray(value) === false
}

async function readText(file) {
  return readFile(file, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return ''
    throw error
  })
}

async function readJson(file) {
  const raw = await readText(file)
  if (raw.trim() === '') return undefined
  return JSON.parse(raw)
}

/**
 * 寫檔：先寫 `.tmp` 再 rename。
 *
 * 半截的 `index.json` 比沒有索引更糟——清單會整個讀不出來，而使用者只知道
 * 「插件壞了」。rename 在同一顆磁碟上是原子的。
 */
async function writeTextAtomic(file, text) {
  const temp = `${file}.tmp`
  await writeFile(temp, text, 'utf8')
  await rename(temp, file)
}

async function writeJsonAtomic(file, value) {
  await writeTextAtomic(file, `${JSON.stringify(value, null, 2)}\n`)
}

/** 讀索引。壞掉就讓它丟：寧可回報，也不要靜靜把使用者的索引清空。 */
async function readIndex(root) {
  const parsed = await readJson(join(root, INDEX_NAME))
  if (parsed === undefined) return []
  if (Array.isArray(parsed) === false) throw new Error(`${INDEX_NAME} 的形狀不對（應該是陣列）`)
  return parsed.filter((item) => isRecord(item) && typeof item.id === 'string')
}

async function writeIndex(root, items) {
  await writeJsonAtomic(join(root, INDEX_NAME), items)
}

async function readMeta(dir) {
  const meta = await readJson(join(dir, 'meta.json'))
  if (meta === undefined || isRecord(meta) === false) throw new Error('這一筆念頭沒有 meta.json')
  return meta
}

/* --------------------------------- 小工具 --------------------------------- */

function pad2(value) {
  return String(value).padStart(2, '0')
}

/** `2026-11-16` 形式的當地日期。 */
function dateStamp(date) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
}

/** 給人看的當地時間（檔案裡的每一行都要看得懂）。 */
function humanStamp(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function mintId() {
  let suffix = ''
  for (let index = 0; index < 4; index += 1) {
    suffix += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]
  }
  return `w-${dateStamp(new Date())}-${suffix}`
}

/** 清單上那一行字：問題的第一行、收乾淨、太長就截掉。 */
function titleOf(question) {
  const flat = question.replace(/\s+/g, ' ').trim()
  return flat.length <= 60 ? flat : `${flat.slice(0, 59)}…`
}

function logHeader(meta) {
  return [
    `# 念頭 · ${meta.id}`,
    '',
    `> ${meta.question}`,
    '',
    `建立：${humanStamp(new Date(meta.createdAt))}`,
    '',
  ].join('\n')
}

function sortByUpdated(items) {
  return items
    .slice()
    .sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')))
}

/* -------------------------------- 來源圍籬 -------------------------------- */

/** 這個位址字串是不是「本機」（含 `localhost` 與 IPv4-mapped IPv6）。 */
function isLoopbackAddress(value) {
  const address = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
  if (address === '') return false
  if (address === 'localhost' || address === '::1') return true
  if (address.startsWith('127.')) return true
  if (address.startsWith('::ffff:')) {
    const tail = address.slice('::ffff:'.length)
    if (tail.startsWith('127.')) return true
    if (tail.startsWith('7f')) return true
  }
  return false
}

/**
 * 來源圍籬：只接受「同一台機器、同一個來源」的請求。
 *
 * 為什麼需要它：`webServer` 本身沒有任何來源檢查，所以這條路由預設是「任何連得到
 * 這個 port 的東西都能打」。而這些 op 會建立、改寫、刪除使用者硬碟上的檔案——
 * 綁 `127.0.0.1` 擋不掉「你自己開的另一個網頁」。
 *
 * 四項都檢查，少一項就是一個繞過的縫：
 *   1. 連線來源必須是迴圈位址
 *   2. `Host` 也必須是迴圈位址（擋 DNS rebinding）
 *   3. `Sec-Fetch-Site` 不可以是 `cross-site`
 *   4. 有 `Origin` 時，它的 host 必須與 `Host` 相符
 *
 * 刻意留的遠端出口：真的從別台機器開這個介面的人，設 `DSH_WHIM_ALLOW_REMOTE=1`
 * 可以放行非本機來源——但第 3、4 項仍然有效，別的網頁還是打不進來。
 *
 * @returns 不通過時回傳原因字串，通過時回傳 null。
 */
export function originFenceFailure(req) {
  const site = String(req.headers?.['sec-fetch-site'] ?? '')
  if (site === 'cross-site') return '跨站請求被拒絕'

  const host = String(req.headers?.host ?? '')
  const origin = String(req.headers?.origin ?? '')
  if (origin !== '') {
    let parsed
    try {
      parsed = new URL(origin)
    } catch {
      return `Origin 無法解析（${origin}）`
    }
    if (parsed.host !== host) return 'Origin 與 Host 不相符'
  }

  if (String(process.env.DSH_WHIM_ALLOW_REMOTE ?? '').trim() === '1') return null

  const remote = req.socket?.remoteAddress ?? req.connection?.remoteAddress ?? ''
  if (!isLoopbackAddress(remote)) {
    return `只接受本機連線（來源 ${remote === '' ? '未知' : remote}）；若你刻意從別的機器連，設 DSH_WHIM_ALLOW_REMOTE=1`
  }

  const hostName = host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.split(':')[0]
  if (!isLoopbackAddress(hostName)) {
    return `Host 必須是本機位址（收到 ${host === '' ? '空的' : host}）`
  }

  if (origin !== '') {
    const originHostName = new URL(origin).hostname
    if (!isLoopbackAddress(originHostName)) return 'Origin 與 Host 不相符'
  }
  return null
}

/* --------------------------------- HTTP --------------------------------- */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      reject(error)
    }
    const declared = Number(req.headers?.['content-length'] ?? '')
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      fail(new Error(`body 太大（${String(declared)} > ${String(MAX_BODY_BYTES)}）`))
      req.destroy()
      return
    }
    req.on('data', (chunk) => {
      total += chunk.length
      if (total > MAX_BODY_BYTES) {
        fail(new Error(`body 太大（超過 ${String(MAX_BODY_BYTES)} bytes）`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('error', fail)
    req.on('end', () => {
      if (settled) return
      settled = true
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw.trim() === '') {
        resolve(undefined)
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('body 不是合法 JSON'))
      }
    })
  })
}

/* ---------------------------------- ops ---------------------------------- */

/** `whim.save` 只認得這幾個欄位（其他一律忽略，不要讓面板改到 id 或建立時間）。 */
const META_PATCH_FIELDS = ['sessionId', 'status', 'title', 'rounds', 'error']

const routes = {
  /**
   * 清單。順便把「現在用哪個資料夾、預設位置有沒有資料」一起回：
   * 面板要用 root 當新 session 的 cwd，而這些只有宿主半算得對。
   *
   * 還沒設定時回 `configured: false` ＋ `defaultRoot`／`defaultHasIndex`——
   * 面板靠這兩個值把設定畫面預填好，並在預設位置已有資料時給一句提示。
   */
  'whim.list': async () => {
    const found = await resolveRoot()
    const preset = defaultRoot()

    if (found.root === '') {
      const existing = await readIndex(preset).catch(() => [])
      return {
        configured: false,
        root: '',
        source: 'none',
        defaultRoot: preset,
        defaultHasIndex: existing.length > 0,
        items: [],
      }
    }

    await mkdir(found.root, { recursive: true })
    return {
      configured: true,
      root: found.root,
      source: found.source,
      defaultRoot: preset,
      items: sortByUpdated(await readIndex(found.root)),
    }
  },

  /**
   * 選一個資料夾，並把它記下來。
   *
   * 已存在就接上（讀它的 index.json）；不存在就建立。舊資料不會搬移——
   * 換位置只換讀寫的地方，搬資料是另一件事，不該偷偷發生。
   */
  'whim.setRoot': async (args) => {
    if (envOverride() !== '') {
      throw new Error('DSH_WHIM_ROOT 已經指定了位置，面板的選擇會被它覆寫；請先移除這個環境變數')
    }

    const target = normalize(expandPath(args?.path))
    if (isAbsolute(target) === false) throw new Error('請給絕對路徑（或 ~ 開頭）')

    const info = await stat(target).catch(() => null)
    if (info !== null && info.isDirectory() === false) {
      throw new Error('那個路徑是一個檔案，不是資料夾')
    }
    await mkdir(target, { recursive: true })

    await mkdir(join(dshHome(), 'whim'), { recursive: true })
    await writeJsonAtomic(configPath(), { root: target, savedAt: new Date().toISOString() })

    const existing = await readIndex(target).catch(() => [])
    return { root: target, source: 'config', count: existing.length }
  },

  /** 冒一個念頭：建資料夾（meta／log／findings）＋ 寫進索引。 */
  'whim.create': async (args) => {
    const question = String(args?.question ?? '').trim()
    if (question === '') throw new Error('念頭不可以是空的')

    const root = await requireRoot()
    await mkdir(root, { recursive: true })
    const now = new Date()
    const meta = {
      id: '',
      question,
      title: titleOf(question),
      status: 'open',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      sessionId: '',
      rounds: 0,
    }

    // 同一天同一個亂數撞到就重抽；連續八次都撞到，那大概是這個資料夾被鎖住了。
    let dir
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const id = mintId()
      const candidate = join(root, id)
      try {
        await mkdir(candidate, { recursive: false })
      } catch (error) {
        if (error?.code === 'EEXIST') continue
        throw error
      }
      meta.id = id
      dir = candidate
      break
    }
    if (dir === undefined) throw new Error('開不出念頭的資料夾（id 一直撞到）')

    await writeJsonAtomic(join(dir, 'meta.json'), meta)
    await writeFile(join(dir, 'findings.md'), '', 'utf8')
    await writeFile(join(dir, 'log.md'), logHeader(meta), 'utf8')

    const items = await readIndex(root)
    items.push(meta)
    await writeIndex(root, items)
    return { id: meta.id, dir, root, meta }
  },

  /** 讀一筆：meta ＋ findings ＋ log。 */
  'whim.read': async (args) => {
    const dir = whimDir(await requireRoot(), args?.id)
    return {
      meta: await readMeta(dir),
      findings: await readText(join(dir, 'findings.md')),
      log: await readText(join(dir, 'log.md')),
    }
  },

  /**
   * 寫一筆。`meta` 只認白名單欄位；`log`／`findings` 是整份取代。
   *
   * 為什麼整份覆蓋而不是 append：log 的形狀（哪一輪、誰問的）由面板決定，
   * 兩邊各拼一半遲早會不一致。檔案小，整份寫最省事也最不會壞。
   */
  'whim.save': async (args) => {
    const root = await requireRoot()
    const id = args?.id
    const dir = whimDir(root, id)
    const meta = await readMeta(dir)

    if (typeof args?.findings === 'string') {
      await writeFile(join(dir, 'findings.md'), args.findings, 'utf8')
    }
    if (typeof args?.log === 'string') {
      await writeFile(join(dir, 'log.md'), args.log, 'utf8')
    }

    if (isRecord(args?.meta)) {
      for (const field of META_PATCH_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(args.meta, field)) {
          meta[field] = args.meta[field]
        }
      }
    }
    meta.updatedAt = new Date().toISOString()
    await writeJsonAtomic(join(dir, 'meta.json'), meta)

    const items = await readIndex(root)
    const at = items.findIndex((item) => item.id === id)
    if (at === -1) items.push(meta)
    else items[at] = meta
    await writeIndex(root, items)

    return { id, meta }
  },

  /**
   * 放下：刪掉這一筆的資料夾與索引那一列。
   *
   * ⚠️ 只刪「念頭自己的資料夾」。session 的檔案一律不碰（DSH 只有封存，沒有刪除；
   * 是否封存由面板另外呼叫 workspaces 服務決定）——自己算 session 檔案路徑去刪，
   * 遲早刪到別人的資料。
   */
  'whim.drop': async (args) => {
    const root = await requireRoot()
    const id = args?.id
    const dir = whimDir(root, id)
    await rm(dir, { recursive: true, force: true })
    const items = await readIndex(root)
    await writeIndex(root, items.filter((item) => item.id !== id))
    return { id }
  },
}

/* --------------------------------- 掛載 --------------------------------- */

/**
 * @param ctx - cordis context（已注入 webServer）。
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: RPC_PATH,
        handler: async (req, res) => {
          // 圍籬先於一切：來源不對就直接拒絕，連 body 都不讀。
          const fenced = originFenceFailure(req)
          if (fenced !== null) {
            sendJson(res, 403, { ok: false, error: fenced })
            return
          }
          if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'method not allowed' })
            return
          }

          let op = ''
          try {
            const url = new URL(req.url ?? '/', 'http://localhost')
            op = url.searchParams.get('op') ?? ''
            const handler = routes[op]
            if (handler === undefined) {
              sendJson(res, 404, { ok: false, error: `沒有這個 op（${op}）` })
              return
            }
            const args = await readJsonBody(req)
            sendJson(res, 200, { ok: true, value: await handler(args) })
          } catch (error) {
            // 一律回 200 + ok:false：面板只看 ok 欄位，不需要分辨 HTTP 狀態。
            sendJson(res, 200, { ok: false, error: String(error?.message ?? error) })
          }
        },
      }),
    'dsh-whim: rpc route',
  )
}
