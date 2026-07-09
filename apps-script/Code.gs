/**
 * Keiri — スプレッドシート連携用 Google Apps Script。
 *
 * 使い方（詳細は GAS_SETUP.md）:
 *   1. データを蓄積したいスプレッドシートを開く
 *   2. 拡張機能 → Apps Script
 *   3. このファイルの内容を丸ごと貼り付けて保存
 *   4. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *        - 次のユーザーとして実行: 自分
 *        - アクセスできるユーザー: 全員
 *   5. 発行された「ウェブアプリ URL」をコピーし、Keiri の「請求者管理」画面で貼り付ける
 *
 * 「顧客」「請求書」シートとヘッダ行は自動で用意されます。
 */

const CUSTOMERS = '顧客'
const INVOICES = '請求書'

const CUSTOMER_HEADERS = ['id', '企業名', '担当者', 'メール', '住所', '電話']
const INVOICE_HEADERS = [
  'id', '請求書番号', '発行日', '支払期限', 'ステータス', '請求者', '課税区分',
  '顧客ID', '顧客名', '小計', '消費税', '合計', '登録番号',
  '明細JSON', '請求者JSON', '備考', '作成日時', '更新日時', '敬称',
]

const STATUS_LABELS = {
  draft: '下書き', issued: '発行済み', awaiting_payment: '入金待ち',
  paid: '入金済み', overdue: '延滞',
}
const STATUS_KEYS = {}
Object.keys(STATUS_LABELS).forEach(function (k) { STATUS_KEYS[STATUS_LABELS[k]] = k })

function ss() { return SpreadsheetApp.getActiveSpreadsheet() }

function getSheet(name, headers) {
  const book = ss()
  let sh = book.getSheetByName(name)
  if (!sh) sh = book.insertSheet(name)
  const first = sh.getRange(1, 1, 1, headers.length).getValues()[0]
  // ヘッダが空、または列が増えた場合は書き直す（後から列を追加しても追従）
  if (first.join('') === '' || first[headers.length - 1] !== headers[headers.length - 1]) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
  }
  return sh
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  )
}

// ---- HTTP ハンドラ ----

function doGet() {
  return jsonOut(getState())
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents)
    switch (body.action) {
      case 'upsertCustomer': upsertCustomer(body.customer); break
      case 'deleteCustomer': deleteRow(getSheet(CUSTOMERS, CUSTOMER_HEADERS), body.id); break
      case 'upsertInvoice': upsertInvoice(body.invoice, body.customerName); break
      case 'deleteInvoice': deleteRow(getSheet(INVOICES, INVOICE_HEADERS), body.id); break
    }
    return jsonOut({ ok: true })
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) })
  }
}

// ---- 集計（画面の calc.ts と同じ） ----

function computeTotals(items, taxMode) {
  const net = { 8: 0, 10: 0 }
  let incl = 0
  ;(items || []).forEach(function (it) {
    const amount = Math.round((it.quantity || 0) * (it.unitPrice || 0))
    if (Number(it.taxRate) === 0) incl += amount // 税込（消費税を加算しない）
    else net[it.taxRate] += amount
  })
  const exempt = taxMode === 'exempt'
  const tax8 = exempt ? 0 : Math.floor(net[8] * 0.08)
  const tax10 = exempt ? 0 : Math.floor(net[10] * 0.1)
  const subtotal = net[8] + net[10]
  const taxTotal = tax8 + tax10
  return { subtotal: subtotal, taxTotal: taxTotal, total: subtotal + taxTotal + incl }
}

function safeParse(str, fallback) {
  try { return JSON.parse(str) } catch (e) { return fallback }
}

// ---- 行の検索・更新・削除 ----

function findRow(sh, id) {
  const last = sh.getLastRow()
  if (last < 2) return -1
  const ids = sh.getRange(2, 1, last - 1, 1).getValues()
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2
  }
  return -1
}

function upsert(sh, id, row) {
  const r = findRow(sh, id)
  if (r === -1) sh.appendRow(row)
  else sh.getRange(r, 1, 1, row.length).setValues([row])
}

function deleteRow(sh, id) {
  const r = findRow(sh, id)
  if (r !== -1) sh.deleteRow(r)
}

function readAll(sh) {
  const last = sh.getLastRow()
  if (last < 2) return []
  return sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues()
}

// ---- マッピング ----

function upsertCustomer(c) {
  const sh = getSheet(CUSTOMERS, CUSTOMER_HEADERS)
  upsert(sh, c.id, [c.id, c.companyName, c.contactName, c.email, c.address, c.phone])
}

function upsertInvoice(inv, customerName) {
  const sh = getSheet(INVOICES, INVOICE_HEADERS)
  const t = computeTotals(inv.items, inv.issuer && inv.issuer.taxMode)
  const row = [
    inv.id, inv.invoiceNumber, inv.issueDate, inv.dueDate,
    STATUS_LABELS[inv.status] || inv.status,
    (inv.issuer && inv.issuer.name) || '',
    inv.issuer && inv.issuer.taxMode === 'exempt' ? '非課税' : '課税',
    inv.customerId, customerName || '',
    t.subtotal, t.taxTotal, t.total,
    (inv.issuer && inv.issuer.registrationNumber) || '',
    JSON.stringify(inv.items), JSON.stringify(inv.issuer || {}),
    inv.notes || '', inv.createdAt || '', inv.updatedAt || '',
    inv.honorific || '御中',
  ]
  upsert(sh, inv.id, row)
}

function getState() {
  const custRows = readAll(getSheet(CUSTOMERS, CUSTOMER_HEADERS))
  const invRows = readAll(getSheet(INVOICES, INVOICE_HEADERS))
  const customers = custRows.filter(function (r) { return r[0] }).map(function (r) {
    return {
      id: r[0], companyName: r[1], contactName: r[2],
      email: r[3], address: r[4], phone: r[5],
    }
  })
  const invoices = invRows.filter(function (r) { return r[0] }).map(function (r) {
    const issuer = safeParse(r[14], {})
    return {
      id: r[0], invoiceNumber: r[1], issueDate: r[2], dueDate: r[3],
      status: STATUS_KEYS[r[4]] || 'draft',
      customerId: r[7], issuerId: issuer.id || '', issuer: issuer,
      items: safeParse(r[13], []),
      notes: r[15], createdAt: r[16], updatedAt: r[17],
      honorific: r[18] || '御中',
    }
  })
  invoices.sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt))
  })
  return { customers: customers, invoices: invoices }
}
