/**
 * 念頭（dsh-whim）的宿主半。
 *
 * 一個念頭 = 一個 DSH session。這裡只負責「session 以外的東西」：
 *
 *   1. 掛一條 `/api/dsh-whim/rpc` 路由（來源圍籬先於一切）
 *   2. 記住「念頭放在哪一個資料夾」——第一次使用時由使用者在面板上選，
 *      設定寫進 `<DSH_HOME>/whim/config.json`
 *   3. 為每個念頭開一個 `w-<日期>-<亂數>/` 資料夾（meta／log／findings），
 *      並維護 `<root>/index.json`
 *
 * ⚠️ 硬規則：這個檔案只准 import `node:` 與相對檔案，零執行期依賴。
 * DSH 啟動時會同步導入 loader entry，任何一個頂層 import 解析失敗，整個 `dsh web`
 * 就起不來——那不是「插件壞掉」，是 DSH 壞掉。
 *
 * ⚠️ 第二條硬規則：啟動時不做任何 I/O。設定檔與資料夾都是「第一次真的用到才碰」。
 *
 * ⚠️ 第三條：**這裡不建立、不刪除、不讀寫 DSH session**。
 * session 由瀏覽器半呼叫 DSH 自己的服務去開；宿主半只碰自己那幾個資料夾。
 * 面板按「刪除」只會刪資料夾，session 會留在 DSH 裡——那是使用者的對話紀錄，
 * 不是這個插件可以代他決定的東西。
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

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

/** `whim.save` 准許寫回的 meta 欄位。sessionId 之外都是插件自己的狀態。 */
const META_FIELDS = ['sessionId', 'status', 'title', 'rounds', 'answeredAt']

/* ------------------------------- 路徑與檔案 ------------------------------- */

/** `DSH_WHIM_ROOT` 的覆寫值；沒有就是空字串。給測試與自動化用的下車道。 */
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
 * 建議位置：`~/whims`（可用 `DSH_WHIM_DEFAULT_ROOT` 換掉）。
 *
 * 這只是**設定畫面的預填值**，不是硬性預設。使用者沒按下「開始」之前，
 * 不會有任何資料夾被建立——所以它不違反「不要硬編碼儲存位置」那條規則。
 */
function suggestedRoot() {
  const override = String(process.env.DSH_WHIM_DEFAULT_ROOT ?? '').trim()
  if (override !== '') return override
  return join(homedir(), 'whims')
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

/** 某個資料夾裡有沒有現成的索引（設定畫面用來提示「這裡已經有念頭」）。 */
async function hasIndex(root) {
  if (root === '') return false
  const raw = await readText(join(root, INDEX_NAME))
  return raw.trim() !== ''
}

/**
 * 現在到底該用哪個資料夾、哪一個 workspace。
 *
 * 順序：`DSH_WHIM_ROOT`（環境變數，給測試與自動化）→ 設定檔 → **還沒選**。
 * 沒有預設值——使用者沒選過，就不該有資料夾被悄悄建立，也不該有
 * workspace 被悄悄註冊。面板會先請他選一個。
 *
 * @returns {Promise<{configured: boolean, workspaceId: string, root: string, source: 'env'|'config'|'none'}>}
 */
async function resolveConfig() {
  const override = envOverride()
  if (override !== '') {
    return { configured: true, workspaceId: '', root: override, source: 'env' }
  }

  const saved = await readJson(configPath()).catch(() => undefined)
  if (isRecord(saved)) {
    const root = typeof saved.root === 'string' ? saved.root.trim() : ''
    const workspaceId = typeof saved.workspaceId === 'string' ? saved.workspaceId.trim() : ''
    if (root !== '') return { configured: true, workspaceId, root, source: 'config' }
  }

  return { configured: false, workspaceId: '', root: '', source: 'none' }
}

/** 回傳資料夾；還沒選就丟一個使用者看得懂的錯。 */
async function requireRoot() {
  const found = await resolveConfig()
  if (found.configured === false) {
    throw new Error('還沒有選念頭要放在哪個資料夾，先在面板上選一個')
  }
  return found.root
}

/** 一次念頭的資料夾。id 先過白名單，所以不可能跳出 root。 */
function whimDir(root, id) {
  if (typeof id !== 'string' || !ID_SHAPE.test(id)) {
    throw new Error(`念頭 id 不合法（${String(id)}）`)
  }
  return join(root, id)
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

/** `20261116` 形式的當地日期。 */
function dateStamp(date) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
}

/** 給人看的當地時間（檔案裡的每一行都要看得懂）。 */
function humanStamp(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function mintId(date) {
  let suffix = ''
  for (let index = 0; index < 4; index += 1) {
    suffix += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]
  }
  return `w-${dateStamp(date)}-${suffix}`
}

/** 第一行當標題：去掉換行、太長就截斷。 */
function titleOf(question) {
  const flat = String(question ?? '').replace(/\s+/g, ' ').trim()
  if (flat.length <= 60) return flat
  return `${flat.slice(0, 59)}…`
}

/* --------------------------------- 各項操作 --------------------------------- */

/**
 * 開一個新念頭：建資料夾、寫 meta 與 log、追加索引。
 *
 * 只做檔案。session 由瀏覽器半去開——宿主半沒有遠端 session 服務，
 * 也不該有：session 的生命週期屬於 DSH，不屬於這個插件。
 */
async function createWhim(input) {
  const question = String(input?.question ?? '').trim()
  if (question === '') throw new Error('念頭不能是空的')

  const root = await requireRoot()
  const now = new Date()
  const id = mintId(now)
  const dir = whimDir(root, id)

  await mkdir(dir, { recursive: true })

  const meta = {
    id,
    question,
    title: titleOf(question),
    status: 'open',
    sessionId: '',
    rounds: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }

  await writeJsonAtomic(join(dir, 'meta.json'), meta)
  await writeTextAtomic(join(dir, 'log.md'), `# ${meta.title}\n\n- ${humanStamp(now)} 開了一個念頭\n`)
  await writeTextAtomic(join(dir, 'findings.md'), '')

  const items = await readIndex(root)
  items.push({ id, title: meta.title, status: meta.status, sessionId: '', createdAt: meta.createdAt })
  await writeIndex(root, items)

  return { id, root, dir, meta }
}

/** 清單：索引 + 每一筆的 meta（meta 才是真的，索引只是排序用的）。 */
async function listWhims() {
  const config = await resolveConfig()
  const preset = suggestedRoot()
  const presetHasIndex = await hasIndex(preset)

  if (config.configured === false) {
    return {
      configured: false,
      workspaceId: '',
      root: '',
      source: 'none',
      defaultRoot: preset,
      defaultHasIndex: presetHasIndex,
      items: [],
    }
  }

  const root = config.root
  const indexed = await readIndex(root)
  const items = []

  for (const entry of indexed) {
    const dir = join(root, entry.id)
    let meta
    try {
      meta = await readMeta(dir)
    } catch (error) {
      // 索引裡有、資料夾卻沒了：留一筆看得懂的殘骸，不要讓整份清單掛掉。
      items.push({
        id: entry.id,
        title: String(entry.title ?? entry.id),
        question: '',
        status: 'missing',
        sessionId: typeof entry.sessionId === 'string' ? entry.sessionId : '',
        rounds: 0,
        createdAt: String(entry.createdAt ?? ''),
        updatedAt: String(entry.createdAt ?? ''),
      })
      continue
    }
    items.push({
      id: meta.id ?? entry.id,
      title: typeof meta.title === 'string' ? meta.title : titleOf(meta.question),
      question: typeof meta.question === 'string' ? meta.question : '',
      status: typeof meta.status === 'string' ? meta.status : 'open',
      sessionId: typeof meta.sessionId === 'string' ? meta.sessionId : '',
      rounds: Number.isFinite(meta.rounds) ? meta.rounds : 0,
      createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : '',
      updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : '',
    })
  }

  return {
    configured: true,
    workspaceId: config.workspaceId,
    root,
    source: config.source,
    defaultRoot: preset,
    defaultHasIndex: presetHasIndex,
    items,
  }
}

/**
 * 更新一筆念頭：meta 只准寫白名單欄位，`id`／`createdAt` 動不了。
 *
 * `log` 與 `findings` 是可選的整份覆寫——面板每跑完一輪就把整份 markdown 交回來，
 * 宿主半不猜格式，只負責原子寫入。
 */
async function saveWhim(input) {
  const root = await requireRoot()
  const dir = whimDir(root, input?.id)
  const meta = await readMeta(dir)
  const patch = isRecord(input?.meta) ? input.meta : {}

  for (const field of META_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) meta[field] = patch[field]
  }
  meta.updatedAt = new Date().toISOString()

  await writeJsonAtomic(join(dir, 'meta.json'), meta)

  if (typeof input?.log === 'string') await writeTextAtomic(join(dir, 'log.md'), input.log)
  if (typeof input?.findings === 'string') await writeTextAtomic(join(dir, 'findings.md'), input.findings)

  const items = await readIndex(root)
  const next = items.map((entry) =>
    entry.id === meta.id
      ? {
          ...entry,
          title: meta.title,
          status: meta.status,
          sessionId: typeof meta.sessionId === 'string' ? meta.sessionId : '',
          createdAt: meta.createdAt,
        }
      : entry,
  )
  await writeIndex(root, next)

  return { meta }
}

/** 讀一筆：meta + 兩個 markdown。 */
async function readWhim(input) {
  const root = await requireRoot()
  const dir = whimDir(root, input?.id)
  const meta = await readMeta(dir)
  const findings = await readText(join(dir, 'findings.md'))
  const log = await readText(join(dir, 'log.md'))
  return { meta, findings, log }
}

/** 刪資料夾。**不碰 DSH session**——那是使用者的對話紀錄。 */
async function dropWhim(input) {
  const root = await requireRoot()
  const dir = whimDir(root, input?.id)
  await rm(dir, { recursive: true, force: true })

  const items = await readIndex(root)
  await writeIndex(root, items.filter((entry) => entry.id !== input.id))

  return { dropped: input.id }
}

/** 記住使用者選的資料夾與 workspace。 */
async function setRoot(input) {
  const root = String(input?.path ?? input?.root ?? '').trim()
  if (root === '') throw new Error('沒有選到資料夾')
  if (isAbsolute(root) === false) throw new Error(`資料夾要用絕對路徑（${root}）`)

  const workspaceId = String(input?.workspaceId ?? '').trim()
  await mkdir(join(dshHome(), 'whim'), { recursive: true })
  await writeJsonAtomic(configPath(), { workspaceId, root })

  return { configured: true, workspaceId, root, source: 'config' }
}

/** 忘掉設定（不動資料夾裡的檔案）。 */
async function clearConfig() {
  await rm(configPath(), { force: true })
  return { configured: false, workspaceId: '', root: '', source: 'none' }
}

/* --------------------------------- 路由 --------------------------------- */

/** 跨站／非本機／Origin 與 Host 對不上，一律 403。 */
export function originFenceFailure(req) {
  const headers = req?.headers ?? {}

  // 1. 瀏覽器自己標記的跨站請求：直接擋。
  const site = String(headers['sec-fetch-site'] ?? '').trim().toLowerCase()
  if (site === 'cross-site') return '跨站請求'

  // 2. 來源位址不是本機：直接擋。
  const remote = String(req?.socket?.remoteAddress ?? req?.connection?.remoteAddress ?? '').trim()
  if (remote !== '') {
    const loopback =
      remote === '127.0.0.1' ||
      remote === '::1' ||
      remote === '::ffff:127.0.0.1' ||
      remote.startsWith('127.')
    if (loopback === false) return `只接受本機連線（${remote}）`
  }

  // 3. Origin 與 Host 對不上，或 Origin 不是本機：直接擋。
  const origin = String(headers.origin ?? '').trim()
  const host = String(headers.host ?? '').trim()

  if (origin !== '') {
    let parsed
    try {
      parsed = new URL(origin)
    } catch (error) {
      return 'Origin 不是合法的網址'
    }
    if (parsed.host !== host) return `Origin（${parsed.host}）與 Host（${host}）不一致`
    const hostname = parsed.hostname
    const loopback = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]'
    if (loopback === false) return `只接受本機來源（${hostname}）`
  }

  return ''
}

const OPS = {
  'whim.config': () => resolveConfig(),
  'whim.list': () => listWhims(),
  'whim.setRoot': (input) => setRoot(input),
  'whim.setConfig': (input) => setRoot(input),
  'whim.clearConfig': () => clearConfig(),
  'whim.create': (input) => createWhim(input),
  'whim.save': (input) => saveWhim(input),
  'whim.read': (input) => readWhim(input),
  'whim.drop': (input) => dropWhim(input),
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('請求太大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function send(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

export function apply(ctx) {
  ctx.webServer.register({
    kind: 'exact',
    path: RPC_PATH,
    handler: async (req, res) => {
      const fenced = originFenceFailure(req)
      if (fenced !== '') {
        send(res, 403, { ok: false, error: fenced })
        return
      }

      if (req.method !== 'POST') {
        send(res, 405, { ok: false, error: '只接受 POST' })
        return
      }

      const url = new URL(req.url ?? RPC_PATH, 'http://127.0.0.1')
      const op = String(url.searchParams.get('op') ?? '').trim()
      const handler = OPS[op]
      if (handler === undefined) {
        send(res, 404, { ok: false, error: `沒有這個操作（${op}）` })
        return
      }

      let input = {}
      try {
        const raw = await readBody(req)
        if (raw.trim() !== '') input = JSON.parse(raw)
      } catch (error) {
        send(res, 200, { ok: false, error: `請求內容讀不懂：${error.message}` })
        return
      }

      try {
        const value = await handler(input)
        send(res, 200, { ok: true, value })
      } catch (error) {
        send(res, 200, { ok: false, error: String(error?.message ?? error) })
      }
    },
  })
}
