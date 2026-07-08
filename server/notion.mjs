// Notion REST API 連携ヘルパ。
// ブラウザから直接叩けない（CORS/トークン露出）ため、このサーバー経由で橋渡しする。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = path.join(__dirname, '.notion-dbs.json')

const NOTION_TOKEN = process.env.NOTION_TOKEN
const PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID
const NOTION_VERSION = process.env.NOTION_VERSION || '2022-06-28'

export function isConfigured() {
  return Boolean(NOTION_TOKEN && PARENT_PAGE_ID)
}

async function notion(pathname, { method = 'GET', body } = {}) {
  const res = await fetch(`https://api.notion.com/v1${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Notion API ${res.status}: ${json.message || res.statusText}`)
  }
  return json
}

// ---- rich_text ヘルパ（2000字制限を分割） ----
function rich(str) {
  const s = String(str ?? '')
  if (!s) return []
  const out = []
  for (let i = 0; i < s.length; i += 1900) {
    out.push({ type: 'text', text: { content: s.slice(i, i + 1900) } })
  }
  return out
}
function plain(prop) {
  const arr = prop?.rich_text || prop?.title || []
  return arr.map((t) => t.plain_text ?? t.text?.content ?? '').join('')
}
function num(prop) {
  return prop?.number ?? 0
}
function dateVal(prop) {
  return prop?.date?.start ?? ''
}
function selectVal(prop) {
  return prop?.select?.name ?? ''
}

// ---- 集計（フロントの calc.ts と同じロジック） ----
function computeTotals(items, taxMode) {
  const net = { 8: 0, 10: 0 }
  for (const it of items) net[it.taxRate] += Math.round(it.quantity * it.unitPrice)
  const exempt = taxMode === 'exempt'
  const tax8 = exempt ? 0 : Math.floor(net[8] * 0.08)
  const tax10 = exempt ? 0 : Math.floor(net[10] * 0.1)
  const subtotal = net[8] + net[10]
  const taxTotal = tax8 + tax10
  return { subtotal, taxTotal, total: subtotal + taxTotal }
}

// ================= データベースのプロビジョニング =================

const CUSTOMER_PROPS = {
  企業名: { title: {} },
  担当者: { rich_text: {} },
  メール: { rich_text: {} },
  住所: { rich_text: {} },
  電話: { rich_text: {} },
  AppID: { rich_text: {} },
}

const INVOICE_PROPS = {
  請求書番号: { title: {} },
  発行日: { date: {} },
  支払期限: { date: {} },
  ステータス: { select: {} },
  請求者: { select: {} },
  課税区分: { select: {} },
  顧客: { rich_text: {} },
  顧客ID: { rich_text: {} },
  小計: { number: { format: 'yen' } },
  消費税: { number: { format: 'yen' } },
  合計: { number: { format: 'yen' } },
  登録番号: { rich_text: {} },
  明細JSON: { rich_text: {} },
  請求者JSON: { rich_text: {} },
  備考: { rich_text: {} },
  AppID: { rich_text: {} },
}

let cache = null

function readCache() {
  if (cache) return cache
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
  } catch {
    cache = {}
  }
  return cache
}
function writeCache(next) {
  cache = next
  fs.writeFileSync(CACHE_FILE, JSON.stringify(next, null, 2))
}

async function dbExists(id) {
  if (!id) return false
  try {
    await notion(`/databases/${id}`)
    return true
  } catch {
    return false
  }
}

async function createDatabase(title, properties) {
  const db = await notion('/databases', {
    method: 'POST',
    body: {
      parent: { type: 'page_id', page_id: PARENT_PAGE_ID },
      title: [{ type: 'text', text: { content: title } }],
      properties,
    },
  })
  return db.id
}

/** 顧客・請求書DBが無ければ作成し、DB ID を返す */
export async function ensureDatabases() {
  const c = readCache()
  let customersDbId = c.customersDbId
  let invoicesDbId = c.invoicesDbId

  if (!(await dbExists(customersDbId))) {
    customersDbId = await createDatabase('Keiri 顧客', CUSTOMER_PROPS)
  }
  if (!(await dbExists(invoicesDbId))) {
    invoicesDbId = await createDatabase('Keiri 請求書', INVOICE_PROPS)
  }
  writeCache({ customersDbId, invoicesDbId })
  return { customersDbId, invoicesDbId }
}

// ================= マッピング =================

function customerToProps(cust) {
  return {
    企業名: { title: rich(cust.companyName) },
    担当者: { rich_text: rich(cust.contactName) },
    メール: { rich_text: rich(cust.email) },
    住所: { rich_text: rich(cust.address) },
    電話: { rich_text: rich(cust.phone) },
    AppID: { rich_text: rich(cust.id) },
  }
}
function propsToCustomer(page) {
  const p = page.properties
  return {
    id: plain(p.AppID) || page.id,
    companyName: plain(p.企業名),
    contactName: plain(p.担当者),
    email: plain(p.メール),
    address: plain(p.住所),
    phone: plain(p.電話),
  }
}

function invoiceToProps(inv, customerName) {
  const t = computeTotals(inv.items, inv.issuer?.taxMode)
  return {
    請求書番号: { title: rich(inv.invoiceNumber) },
    発行日: inv.issueDate ? { date: { start: inv.issueDate } } : { date: null },
    支払期限: inv.dueDate ? { date: { start: inv.dueDate } } : { date: null },
    ステータス: { select: { name: STATUS_LABELS[inv.status] || inv.status } },
    請求者: { select: { name: inv.issuer?.name || '未設定' } },
    課税区分: { select: { name: inv.issuer?.taxMode === 'exempt' ? '非課税' : '課税' } },
    顧客: { rich_text: rich(customerName || '') },
    顧客ID: { rich_text: rich(inv.customerId) },
    小計: { number: t.subtotal },
    消費税: { number: t.taxTotal },
    合計: { number: t.total },
    登録番号: { rich_text: rich(inv.issuer?.registrationNumber || '') },
    明細JSON: { rich_text: rich(JSON.stringify(inv.items)) },
    請求者JSON: { rich_text: rich(JSON.stringify(inv.issuer || {})) },
    備考: { rich_text: rich(inv.notes || '') },
    AppID: { rich_text: rich(inv.id) },
  }
}

const STATUS_LABELS = {
  draft: '下書き',
  issued: '発行済み',
  awaiting_payment: '入金待ち',
  paid: '入金済み',
  overdue: '延滞',
}
const STATUS_KEYS = Object.fromEntries(
  Object.entries(STATUS_LABELS).map(([k, v]) => [v, k])
)

function safeParse(str, fallback) {
  try {
    return JSON.parse(str)
  } catch {
    return fallback
  }
}

function propsToInvoice(page) {
  const p = page.properties
  const issuer = safeParse(plain(p.請求者JSON), {})
  return {
    id: plain(p.AppID) || page.id,
    invoiceNumber: plain(p.請求書番号),
    issueDate: dateVal(p.発行日),
    dueDate: dateVal(p.支払期限),
    status: STATUS_KEYS[selectVal(p.ステータス)] || 'draft',
    customerId: plain(p.顧客ID),
    issuerId: issuer.id || '',
    issuer,
    items: safeParse(plain(p.明細JSON), []),
    notes: plain(p.備考),
    createdAt: page.created_time,
    updatedAt: page.last_edited_time,
  }
}

// ================= クエリ / CRUD =================

async function queryAll(dbId) {
  const results = []
  let cursor
  do {
    const body = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    const res = await notion(`/databases/${dbId}/query`, { method: 'POST', body })
    results.push(...res.results)
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)
  return results
}

async function findPageByAppId(dbId, appId) {
  const res = await notion(`/databases/${dbId}/query`, {
    method: 'POST',
    body: {
      filter: { property: 'AppID', rich_text: { equals: appId } },
      page_size: 1,
    },
  })
  return res.results[0] || null
}

export async function getState() {
  const { customersDbId, invoicesDbId } = await ensureDatabases()
  const [custPages, invPages] = await Promise.all([
    queryAll(customersDbId),
    queryAll(invoicesDbId),
  ])
  return {
    customers: custPages.map(propsToCustomer),
    invoices: invPages
      .map(propsToInvoice)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
  }
}

export async function upsertCustomer(cust) {
  const { customersDbId } = await ensureDatabases()
  const existing = await findPageByAppId(customersDbId, cust.id)
  const properties = customerToProps(cust)
  if (existing) {
    await notion(`/pages/${existing.id}`, { method: 'PATCH', body: { properties } })
  } else {
    await notion('/pages', {
      method: 'POST',
      body: { parent: { database_id: customersDbId }, properties },
    })
  }
  return cust
}

export async function deleteCustomer(id) {
  const { customersDbId } = await ensureDatabases()
  const existing = await findPageByAppId(customersDbId, id)
  if (existing) await notion(`/pages/${existing.id}`, { method: 'PATCH', body: { archived: true } })
}

export async function upsertInvoice(inv, customerName) {
  const { invoicesDbId } = await ensureDatabases()
  const existing = await findPageByAppId(invoicesDbId, inv.id)
  const properties = invoiceToProps(inv, customerName)
  if (existing) {
    await notion(`/pages/${existing.id}`, { method: 'PATCH', body: { properties } })
  } else {
    await notion('/pages', {
      method: 'POST',
      body: { parent: { database_id: invoicesDbId }, properties },
    })
  }
  return inv
}

export async function deleteInvoice(id) {
  const { invoicesDbId } = await ensureDatabases()
  const existing = await findPageByAppId(invoicesDbId, id)
  if (existing) await notion(`/pages/${existing.id}`, { method: 'PATCH', body: { archived: true } })
}
