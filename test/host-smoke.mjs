/**
 * 宿主半的煙霧測試：不啟動 DSH，直接驗證 lib/index.js 的每一個 op。
 *
 * 做法：
 *   1. 用假的 cordis ctx 把 `apply()` 掛上去，攔下那條路由。
 *   2. 用假的 req／res 呼叫路由，逐項驗證回傳值與磁碟上的檔案。
 *   3. 全部寫在暫存資料夾裡（DSH_WHIM_ROOT 覆寫），跑完就刪，不碰真的資料。
 *
 * 跑法：`node test/host-smoke.mjs`。任何一項不符就以非零結束。
 */

import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

/* ------------------------------ 測試小工具 ------------------------------ */

let passed = 0
const failures = []

async function check(label, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  ok  ${label}`)
  } catch (error) {
    failures.push({ label, error })
    console.log(`FAIL  ${label}`)
    console.log(`      ${String(error?.message ?? error).split('\n').join('\n      ')}`)
  }
}

/** 假的 req：Readable 提供 on('data')／on('end')，其餘欄位直接掛上去。 */
function makeReq({ method = 'POST', url = '/', headers = {}, body = undefined, remote = '127.0.0.1' } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(body, 'utf8')])
  req.method = method
  req.url = url
  req.headers = headers
  req.socket = { remoteAddress: remote }
  req.connection = req.socket
  return req
}

/** 假的 res：把 writeHead／end 記下來。 */
function makeRes() {
  const res = {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      res.status = status
      res.headers = headers ?? {}
    },
    end(chunk) {
      res.body = chunk === undefined ? '' : String(chunk)
    },
  }
  return res
}

/** 呼叫一次路由，回傳解析後的 JSON 與 HTTP 狀態。 */
async function callRoute(handler, { op, args, method = 'POST', headers = {}, remote = '127.0.0.1' }) {
  const body = args === undefined ? undefined : JSON.stringify(args)
  const req = makeReq({
    method,
    url: `/api/dsh-whim/rpc?op=${encodeURIComponent(op)}`,
    headers: { host: '127.0.0.1:64048', ...headers },
    body,
    remote,
  })
  const res = makeRes()
  await handler(req, res)
  let json
  try {
    json = JSON.parse(res.body)
  } catch {
    json = undefined
  }
  return { status: res.status, json, raw: res.body }
}

/* ------------------------------- 主流程 ------------------------------- */

const sandbox = await mkdtemp(join(tmpdir(), 'dsh-whim-smoke-'))
process.env.DSH_WHIM_ROOT = sandbox
// 設定檔也要留在暫存區：否則 `whim.setRoot` 會寫進使用者真正的 ~/.dsh。
process.env.DSH_HOME = join(sandbox, 'dsh-home')
delete process.env.DSH_WHIM_ALLOW_REMOTE

const mod = await import('../lib/index.js')

console.log(`\n宿主半煙霧測試（暫存資料夾：${sandbox}）\n`)

/* 1. 匯出形狀 ---------------------------------------------------------- */

await check('匯出 name／inject／apply／originFenceFailure', () => {
  assert.equal(mod.name, 'dsh-whim')
  assert.deepEqual(mod.inject, ['webServer'])
  assert.equal(typeof mod.apply, 'function')
  assert.equal(typeof mod.originFenceFailure, 'function')
})

/* 2. 掛載路由 ---------------------------------------------------------- */

let handler
const registered = []
const ctx = {
  effect(fn) {
    const dispose = fn()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  webServer: {
    register(spec) {
      registered.push(spec)
      handler = spec.handler
      return () => {}
    },
  },
}

mod.apply(ctx)

await check('apply() 掛了一條 exact 路由', () => {
  assert.equal(registered.length, 1)
  assert.equal(registered[0].kind, 'exact')
  assert.equal(registered[0].path, '/api/dsh-whim/rpc')
  assert.equal(typeof handler, 'function')
})

/* 3. 來源圍籬 ---------------------------------------------------------- */

await check('跨站請求被 403 拒絕', async () => {
  const { status, json } = await callRoute(handler, {
    op: 'whim.list',
    headers: { 'sec-fetch-site': 'cross-site' },
  })
  assert.equal(status, 403)
  assert.equal(json.ok, false)
})

await check('非本機來源被 403 拒絕', async () => {
  const { status, json } = await callRoute(handler, {
    op: 'whim.list',
    remote: '203.0.113.9',
  })
  assert.equal(status, 403)
  assert.equal(json.ok, false)
})

await check('Origin 與 Host 不符被 403 拒絕', async () => {
  const { status } = await callRoute(handler, {
    op: 'whim.list',
    headers: { origin: 'http://evil.example' },
  })
  assert.equal(status, 403)
})

await check('非 POST 被 405 拒絕', async () => {
  const { status, json } = await callRoute(handler, { op: 'whim.list', method: 'GET' })
  assert.equal(status, 405)
  assert.equal(json.ok, false)
})

/* 4. 未知 op ----------------------------------------------------------- */

await check('未知 op 回 404', async () => {
  const { status, json } = await callRoute(handler, { op: 'whim.nope' })
  assert.equal(status, 404)
  assert.equal(json.ok, false)
})

/* 5. whim.list：環境變數覆寫生效 ---------------------------------------- */

await check('whim.list 回 configured:true、root 指向覆寫位置', async () => {
  const { status, json } = await callRoute(handler, { op: 'whim.list' })
  assert.equal(status, 200)
  assert.equal(json.ok, true)
  assert.equal(json.value.configured, true)
  assert.equal(json.value.root, sandbox)
  assert.equal(json.value.source, 'env')
  assert.deepEqual(json.value.items, [])
  // 設定畫面要用的預填值與「這裡已經有念頭」提示。
  assert.equal(typeof json.value.defaultRoot, 'string')
  assert.equal(json.value.defaultRoot.length > 0, true)
  // 真實的 ~/whims 可能已經有索引，這裡只驗證它是布林值。
  assert.equal(typeof json.value.defaultHasIndex, 'boolean')
})

/* 6. whim.config：同一個設定的唯讀視圖 ---------------------------------- */

await check('whim.config 回傳目前設定', async () => {
  const { json } = await callRoute(handler, { op: 'whim.config' })
  assert.equal(json.ok, true)
  assert.equal(json.value.configured, true)
  assert.equal(json.value.root, sandbox)
  assert.equal(json.value.source, 'env')
})

/* 7. whim.setRoot：設定檔寫入（環境變數仍在時不覆蓋） -------------------- */

await check('whim.setRoot 寫入設定檔', async () => {
  const { json } = await callRoute(handler, { op: 'whim.setRoot', args: { path: sandbox } })
  assert.equal(json.ok, true)
  assert.equal(json.value.configured, true)
  assert.equal(json.value.root, sandbox)
  assert.equal(json.value.source, 'config')
})

await check('whim.setRoot 拒絕相對路徑', async () => {
  const { json } = await callRoute(handler, { op: 'whim.setRoot', args: { path: 'relative/path' } })
  assert.equal(json.ok, false)
  assert.match(String(json.error), /絕對路徑/)
})

/* 8. whim.create ------------------------------------------------------- */

let created
await check('whim.create 建資料夾與索引', async () => {
  const { status, json } = await callRoute(handler, {
    op: 'whim.create',
    args: { question: '為什麼非同步的錯誤在 catch 裡看不到 stack？' },
  })
  assert.equal(status, 200)
  assert.equal(json.ok, true)
  const value = json.value
  assert.match(value.id, /^w-\d{8}-[a-z0-9]{4}$/)
  assert.equal(value.root, sandbox)
  created = value

  const info = await stat(value.dir)
  assert.equal(info.isDirectory(), true)
  const names = (await readdir(value.dir)).sort()
  assert.deepEqual(names, ['findings.md', 'log.md', 'meta.json'])

  const meta = JSON.parse(await readFile(join(value.dir, 'meta.json'), 'utf8'))
  assert.equal(meta.id, value.id)
  assert.equal(meta.status, 'open')
  assert.equal(meta.question, '為什麼非同步的錯誤在 catch 裡看不到 stack？')
  assert.equal(meta.sessionId, '')

  const index = JSON.parse(await readFile(join(sandbox, 'index.json'), 'utf8'))
  assert.equal(index.length, 1)
  assert.equal(index[0].id, value.id)
})

await check('空念頭被拒絕', async () => {
  const { json } = await callRoute(handler, { op: 'whim.create', args: { question: '   ' } })
  assert.equal(json.ok, false)
})

/* 9. whim.read --------------------------------------------------------- */

await check('whim.read 讀回 meta／findings／log', async () => {
  const { json } = await callRoute(handler, { op: 'whim.read', args: { id: created.id } })
  assert.equal(json.ok, true)
  assert.equal(json.value.meta.id, created.id)
  assert.equal(json.value.findings, '')
  assert.match(json.value.log, /^# /)
})

await check('whim.read 拒絕跳脫 root 的 id', async () => {
  const { json } = await callRoute(handler, { op: 'whim.read', args: { id: '../../etc' } })
  assert.equal(json.ok, false)
})

/* 10. whim.save -------------------------------------------------------- */

await check('whim.save 寫入 findings／log／meta 白名單欄位', async () => {
  const { json } = await callRoute(handler, {
    op: 'whim.save',
    args: {
      id: created.id,
      findings: '結論：因為 Promise 鏈丟掉了原始 frame。',
      log: '# 第 1 輪\n\n問：為什麼？\n',
      meta: { sessionId: 'session-abc', status: 'answered', rounds: 1, id: 'HACKED', createdAt: '1970' },
    },
  })
  assert.equal(json.ok, true)
  assert.equal(json.value.meta.sessionId, 'session-abc')
  assert.equal(json.value.meta.status, 'answered')
  assert.equal(json.value.meta.rounds, 1)
  // id 與 createdAt 不在白名單裡，不能被改。
  assert.equal(json.value.meta.id, created.id)
  assert.notEqual(json.value.meta.createdAt, '1970')

  const meta = JSON.parse(await readFile(join(created.dir, 'meta.json'), 'utf8'))
  assert.equal(meta.sessionId, 'session-abc')
  assert.equal(meta.id, created.id)

  const findings = await readFile(join(created.dir, 'findings.md'), 'utf8')
  assert.match(findings, /Promise 鏈丟掉了原始 frame/)

  const log = await readFile(join(created.dir, 'log.md'), 'utf8')
  assert.match(log, /第 1 輪/)

  const index = JSON.parse(await readFile(join(sandbox, 'index.json'), 'utf8'))
  assert.equal(index[0].sessionId, 'session-abc')
})

/* 11. whim.list 排序 --------------------------------------------------- */

await check('whim.list 回傳剛剛那一筆', async () => {
  const { json } = await callRoute(handler, { op: 'whim.list' })
  assert.equal(json.value.items.length, 1)
  assert.equal(json.value.items[0].id, created.id)
  assert.equal(json.value.items[0].status, 'answered')
  assert.equal(json.value.items[0].sessionId, 'session-abc')
})

/* 12. whim.drop -------------------------------------------------------- */

await check('whim.drop 刪資料夾與索引那一列', async () => {
  const { json } = await callRoute(handler, { op: 'whim.drop', args: { id: created.id } })
  assert.equal(json.ok, true)

  const gone = await stat(created.dir).then(
    () => false,
    () => true,
  )
  assert.equal(gone, true)

  const index = JSON.parse(await readFile(join(sandbox, 'index.json'), 'utf8'))
  assert.deepEqual(index, [])

  const { json: after } = await callRoute(handler, { op: 'whim.list' })
  assert.deepEqual(after.value.items, [])
})

/* ------------------------------- 收尾 ------------------------------- */

await rm(sandbox, { recursive: true, force: true })

console.log(`\n${passed} 項通過，${failures.length} 項失敗\n`)
if (failures.length > 0) {
  for (const { label, error } of failures) {
    console.error(`✗ ${label}`)
    console.error(error)
  }
  process.exitCode = 1
}
