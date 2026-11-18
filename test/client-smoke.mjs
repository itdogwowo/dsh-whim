/**
 * 瀏覽器半的煙霧測試：不開瀏覽器，用假的 loader／React／ctx 驗證 lib/client.js。
 *
 * lib/client.js 是手寫的 `window.__ModuleLoader__.load({...})` bundle，沒有 ESM
 * 匯出，所以不能直接 import——這裡把它當字串讀進來，用 `new Function` 配上
 * 假的 `window`／`document` 執行，再從 loader 攔下 factory。
 *
 * 驗的是「形狀對不對」：匯出、字串表、座位註冊、字串表 key 是否四份一致。
 * 畫面本身要看真的瀏覽器，那不在煙霧測試的範圍。
 *
 * 跑法：`node test/client-smoke.mjs`。任何一項不符就以非零結束。
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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

/* ------------------------------ 假環境 ------------------------------ */

/** 最小 React 替身：只需要 client.js 真的用到的那四個。 */
const react = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useEffect: (fn) => fn(),
  useRef: (initial) => ({ current: initial }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
}

/** 最小的 document：styles 那段會 appendChild 一個 style。 */
const styles = []
const documentStub = {
  createElement: () => ({
    setAttribute() {},
    remove() {},
    textContent: '',
  }),
  head: {
    appendChild(element) {
      styles.push(element)
    },
  },
}

/** 攔下 loader 的 factory。 */
let factory = null
const windowStub = {
  __ModuleLoader__: {
    load(spec) {
      factory = spec.factory
    },
  },
}

/* ------------------------------ 載入 bundle ------------------------------ */

const here = dirname(fileURLToPath(import.meta.url))
const source = await readFile(join(here, '..', 'lib', 'client.js'), 'utf8')

// 把整份 bundle 當函式本體執行；window／document 由參數提供。
// eslint-disable-next-line no-new-func
new Function('window', 'document', source)(windowStub, documentStub)

console.log('\n瀏覽器半煙霧測試\n')

await check('bundle 呼叫了 __ModuleLoader__.load', () => {
  assert.equal(typeof factory, 'function')
})

const moduleExports = factory((id) => {
  if (id === 'react') return react
  throw new Error(`意料之外的 require：${id}`)
})

/* 1. 匯出形狀 ---------------------------------------------------------- */

await check('匯出 name／inject／apply／__build／__dicts', () => {
  assert.equal(moduleExports.name, 'dsh-whim')
  assert.deepEqual(moduleExports.inject, ['slots'])
  assert.equal(typeof moduleExports.apply, 'function')
  assert.equal(typeof moduleExports.__build, 'string')
  assert.equal(typeof moduleExports.__dicts, 'object')
})

/* 2. 字串表 ------------------------------------------------------------ */

await check('字串表有四份：en／zh／zh-CN／zh-TW', () => {
  const keys = Object.keys(moduleExports.__dicts).sort()
  assert.deepEqual(keys, ['en', 'zh', 'zh-CN', 'zh-TW'])
})

await check('四份字串表的 key 完全一致', () => {
  const dicts = moduleExports.__dicts
  const reference = Object.keys(dicts.en).sort()
  assert.ok(reference.length > 0, 'en 是空的')
  for (const localeId of ['zh', 'zh-CN', 'zh-TW']) {
    const keys = Object.keys(dicts[localeId]).sort()
    assert.deepEqual(keys, reference, `${localeId} 的 key 與 en 不一致`)
  }
})

await check('字串表沒有空值', () => {
  const dicts = moduleExports.__dicts
  for (const [localeId, dict] of Object.entries(dicts)) {
    for (const [key, value] of Object.entries(dict)) {
      assert.equal(typeof value, 'string', `${localeId}.${key} 不是字串`)
      assert.ok(value.trim() !== '', `${localeId}.${key} 是空的`)
    }
  }
})

/* 3. apply() 掛座位 ----------------------------------------------------- */

const registered = []
const injected = []
const effects = []
const localeRegistrations = []
let boundNs = null

const localeStub = {
  register(ns, localeId, dict) {
    localeRegistrations.push({ ns, localeId, keys: Object.keys(dict).length })
    return () => {}
  },
  bind(ns) {
    boundNs = ns
    return (key) => key
  },
}

const slotsStub = {
  inject(name, factoryFn, label) {
    injected.push({ name, label })
    return factoryFn()
  },
  register(spec, component) {
    registered.push({ spec, component })
    return () => {}
  },
  onEntryError() {
    return () => {}
  },
}

const ctx = {
  effect(fn, label) {
    const dispose = fn()
    effects.push({ label, dispose })
    return typeof dispose === 'function' ? dispose : () => {}
  },
  get(service) {
    if (service === 'locale') return localeStub
    if (service === 'slots') return slotsStub
    return undefined
  },
}

moduleExports.apply(ctx)

await check('apply() 註冊了四個語言字典', () => {
  assert.equal(localeRegistrations.length, 4)
  const ids = localeRegistrations.map((item) => item.localeId).sort()
  assert.deepEqual(ids, ['en', 'zh', 'zh-CN', 'zh-TW'])
  for (const item of localeRegistrations) {
    assert.equal(item.ns, 'dsh-whim')
    assert.ok(item.keys > 0)
  }
})

await check('apply() 綁定了 dsh-whim 命名空間', () => {
  assert.equal(boundNs, 'dsh-whim')
})

await check('apply() 注入並註冊了側欄入口與主面板', () => {
  const names = injected.map((item) => item.name).sort()
  assert.deepEqual(names, ['main', 'sidebar.panellist'])

  const specs = registered.map((item) => item.spec)
  const sidebar = specs.find((spec) => spec.name === 'sidebar.panellist')
  const main = specs.find((spec) => spec.name === 'main')
  assert.ok(sidebar, '沒有註冊 sidebar.panellist')
  assert.ok(main, '沒有註冊 main')

  assert.equal(sidebar.id, 'whim')
  assert.equal(sidebar.order, 30)
  assert.equal(typeof sidebar.label, 'function')
  assert.equal(main.key, 'whim')

  // 兩個座位都要有元件，不然畫面是空的。
  for (const item of registered) {
    assert.equal(typeof item.component, 'function', `${item.spec.name} 的元件不是函式`)
  }
})

await check('apply() 掛上了樣式 effect', () => {
  assert.ok(styles.length >= 1, '沒有把 style 加進 document.head')
  assert.ok(effects.some((item) => item.label === 'dsh-whim: styles'))
})

/* ------------------------------- 收尾 ------------------------------- */

console.log(`\n${passed} 項通過，${failures.length} 項失敗\n`)
if (failures.length > 0) {
  for (const { label, error } of failures) {
    console.error(`✗ ${label}`)
    console.error(error)
  }
  process.exitCode = 1
}
