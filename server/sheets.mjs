// Google Sheets 連携ヘルパ。
// ブラウザから直接叩けない（CORS/認証）ため、このサーバー経由で橋渡しする。
// サービスアカウントで対象スプレッドシートに読み書きする。
import { google } from 'googleapis'

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

const CUSTOMERS_TAB = '顧客'
const INVOICES_TAB = '請求書'

const CUSTOMER_HEADERS = ['id', '企業名', '担当者', 'メール', '住所', '電話']
const INVOICE_HEADERS = [
  'id',
  '請求書番号',
  '発行日',
  '支払期限',
  'ステータス',
  '請求者',
  '課税区分',
  '顧客ID',
  '顧客名',
  '小計',
  '消費税',
  '合計',
  '登録番号',
  '明細JSON',
  '請求者JSON',
  '備考',
  '作成日時',
  '更新日時',
]

function makeAuth() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
    return new google.auth.GoogleAuth({ credentials, scopes: SCOPES })
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: SCOPES,
    })
  }
  return null
}

const auth = makeAuth()
const api = auth ? google.sheets({ version: 'v4', auth }) : null

export function isConfigured() {
  return Boolean(SPREADSHEET_ID && api)
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

// ================= タブ／ヘッダの用意 =================

let tabCache = null

/** 顧客・請求書タブが無ければ作成し、ヘッダ行を用意する */
export async function ensureSheets() {
  if (tabCache) return tabCache
  const meta = await api.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
  const existing = new Map(
    meta.data.sheets.map((s) => [s.properties.title, s.properties.sheetId])
  )

  const requests = []
  for (const title of [CUSTOMERS_TAB, INVOICES_TAB]) {
    if (!existing.has(title)) {
      requests.push({ addSheet: { properties: { title } } })
    }
  }
  if (requests.length) {
    const res = await api.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests },
    })
    for (const r of res.data.replies) {
      if (r.addSheet) existing.set(r.addSheet.properties.title, r.addSheet.properties.sheetId)
    }
  }

  // ヘッダ行を用意（未記入のときのみ）
  await ensureHeader(CUSTOMERS_TAB, CUSTOMER_HEADERS)
  await ensureHeader(INVOICES_TAB, INVOICE_HEADERS)

  tabCache = {
    customersSheetId: existing.get(CUSTOMERS_TAB),
    invoicesSheetId: existing.get(INVOICES_TAB),
  }
  return tabCache
}

async function ensureHeader(tab, headers) {
  const res = await api.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!1:1`,
  })
  const row = res.data.values?.[0] || []
  if (row.length === 0) {
    await api.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${tab}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    })
  }
}

// ================= マッピング =================

function customerToRow(c) {
  return [c.id, c.companyName, c.contactName, c.email, c.address, c.phone]
}
function rowToCustomer(r) {
  return {
    id: r[0] ?? '',
    companyName: r[1] ?? '',
    contactName: r[2] ?? '',
    email: r[3] ?? '',
    address: r[4] ?? '',
    phone: r[5] ?? '',
  }
}

function invoiceToRow(inv, customerName) {
  const t = computeTotals(inv.items, inv.issuer?.taxMode)
  return [
    inv.id,
    inv.invoiceNumber,
    inv.issueDate,
    inv.dueDate,
    STATUS_LABELS[inv.status] || inv.status,
    inv.issuer?.name || '',
    inv.issuer?.taxMode === 'exempt' ? '非課税' : '課税',
    inv.customerId,
    customerName || '',
    t.subtotal,
    t.taxTotal,
    t.total,
    inv.issuer?.registrationNumber || '',
    JSON.stringify(inv.items),
    JSON.stringify(inv.issuer || {}),
    inv.notes || '',
    inv.createdAt || '',
    inv.updatedAt || '',
  ]
}
function rowToInvoice(r) {
  const issuer = safeParse(r[14], {})
  return {
    id: r[0] ?? '',
    invoiceNumber: r[1] ?? '',
    issueDate: r[2] ?? '',
    dueDate: r[3] ?? '',
    status: STATUS_KEYS[r[4]] || 'draft',
    customerId: r[7] ?? '',
    issuerId: issuer.id || '',
    issuer,
    items: safeParse(r[13], []),
    notes: r[15] ?? '',
    createdAt: r[16] ?? '',
    updatedAt: r[17] ?? '',
  }
}

// ================= 読み書き =================

async function readRows(tab) {
  const res = await api.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A2:Z`,
  })
  return res.data.values || []
}

/** 対象タブでキー(id, A列)に一致する行番号(1始まり, ヘッダ=1)を返す。無ければ -1 */
async function findRowNumber(tab, id) {
  const res = await api.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A2:A`,
  })
  const ids = res.data.values || []
  const idx = ids.findIndex((row) => (row[0] ?? '') === id)
  return idx === -1 ? -1 : idx + 2 // +2: ヘッダ分 + 0始まり補正
}

async function upsertRow(tab, id, values, lastColLetter) {
  const rowNum = await findRowNumber(tab, id)
  if (rowNum === -1) {
    await api.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${tab}!A:${lastColLetter}`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [values] },
    })
  } else {
    await api.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${tab}!A${rowNum}:${lastColLetter}${rowNum}`,
      valueInputOption: 'RAW',
      requestBody: { values: [values] },
    })
  }
}

async function deleteRow(tab, sheetId, id) {
  const rowNum = await findRowNumber(tab, id)
  if (rowNum === -1) return
  await api.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowNum - 1, // 0始まり
              endIndex: rowNum,
            },
          },
        },
      ],
    },
  })
}

// ================= 公開 API =================

export async function getState() {
  await ensureSheets()
  const [custRows, invRows] = await Promise.all([
    readRows(CUSTOMERS_TAB),
    readRows(INVOICES_TAB),
  ])
  return {
    customers: custRows.filter((r) => r[0]).map(rowToCustomer),
    invoices: invRows
      .filter((r) => r[0])
      .map(rowToInvoice)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
  }
}

export async function upsertCustomer(cust) {
  await ensureSheets()
  await upsertRow(CUSTOMERS_TAB, cust.id, customerToRow(cust), 'F')
  return cust
}

export async function deleteCustomer(id) {
  const { customersSheetId } = await ensureSheets()
  await deleteRow(CUSTOMERS_TAB, customersSheetId, id)
}

export async function upsertInvoice(inv, customerName) {
  await ensureSheets()
  await upsertRow(INVOICES_TAB, inv.id, invoiceToRow(inv, customerName), 'R')
  return inv
}

export async function deleteInvoice(id) {
  const { invoicesSheetId } = await ensureSheets()
  await deleteRow(INVOICES_TAB, invoicesSheetId, id)
}
