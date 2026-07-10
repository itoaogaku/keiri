/**
 * Keiri — スプレッドシート連携用 Google Apps Script（ログイン・権限対応版）。
 *
 * 使い方（詳細は GAS_SETUP.md）:
 *   1. データを蓄積したいスプレッドシートを開く
 *   2. 拡張機能 → Apps Script
 *   3. このファイルの内容を丸ごと貼り付けて保存
 *   4. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *        - 次のユーザーとして実行: 自分
 *        - アクセスできるユーザー: 全員
 *   5. 発行された「ウェブアプリ URL」をコピーし、Keiri の設定画面に貼る
 *
 * 「顧客」「請求書」「ユーザー」シートは自動で用意されます。
 * ★「ユーザー」シートに、利用者のメール・名前・PIN・役割を登録してください。
 *    役割: owner（全データ閲覧可） / それ以外（restricted＝自分の作成分のみ）
 */

const CUSTOMERS = '顧客'
const INVOICES = '請求書'
const USERS = 'ユーザー'

// 末尾に「作成者」列を持たせ、閲覧制御に使う
const CUSTOMER_HEADERS = ['id', '企業名', '担当者', 'メール', '住所', '電話', '作成者']
const INVOICE_HEADERS = [
  'id', '請求書番号', '発行日', '支払期限', 'ステータス', '請求者', '課税区分',
  '顧客ID', '顧客名', '小計', '消費税', '合計', '登録番号',
  '明細JSON', '請求者JSON', '備考', '作成日時', '更新日時', '敬称', '事業種別', '作成者',
  '立替金以外', '立替金',
]
const USER_HEADERS = ['メール', '名前', 'PIN', '役割']

// 請求者ごとの売上シート
const ISSUER_SHEET_PREFIX = '売上_'
const ISSUER_VIEW_HEADERS = ['事業種別', '請求書番号', '顧客名', 'ステータス', '発行日', '立替金以外', '立替金', '合計', '備考']

// 「作成者」列の位置（0始まり）
const CUSTOMER_CREATOR_IDX = 6
const INVOICE_CREATOR_IDX = 20

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

// ================= 認証 =================

function normEmail(s) { return String(s == null ? '' : s).trim().toLowerCase() }

/** メール＋PINを「ユーザー」シートで照合。合致すればユーザー情報を返す */
function authenticate(email, pin) {
  const rows = readAll(getSheet(USERS, USER_HEADERS))
  const e = normEmail(email)
  const p = String(pin == null ? '' : pin).trim()
  if (!e) return null
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (normEmail(r[0]) === e && String(r[2]).trim() === p) {
      const role = String(r[3] || '').trim()
      const isOwner = role === 'owner' || role === 'オーナー' || role === '管理者'
      return {
        email: String(r[0]).trim(),
        name: r[1] || '',
        role: isOwner ? 'owner' : 'restricted',
        isOwner: isOwner,
      }
    }
  }
  return null
}

// ================= HTTP ハンドラ =================

function doGet() {
  // 認証が必要なため、GET では状態を返さない（疎通確認用）
  return jsonOut({ ok: true, service: 'Keiri' })
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents)
    const action = body.action

    if (action === 'login') {
      const u = authenticate(body.email, body.pin)
      if (!u) return jsonOut({ ok: false, error: 'メールアドレスまたはPINが違います' })
      return jsonOut({ ok: true, user: { email: u.email, name: u.name, role: u.role } })
    }

    // 以降のアクションは認証必須
    const auth = body.auth || {}
    const user = authenticate(auth.email, auth.pin)
    if (!user) return jsonOut({ ok: false, error: 'unauthorized' })

    switch (action) {
      case 'state':
        return jsonOut(getStateFor(user))
      case 'upsertCustomer':
        upsertCustomer(user, body.customer)
        return jsonOut({ ok: true })
      case 'deleteCustomer':
        deleteEntity(user, CUSTOMERS, CUSTOMER_HEADERS, CUSTOMER_CREATOR_IDX, body.id)
        return jsonOut({ ok: true })
      case 'upsertInvoice':
        upsertInvoice(user, body.invoice, body.customerName)
        try { rebuildIssuerSheets() } catch (e2) {}
        return jsonOut({ ok: true })
      case 'deleteInvoice':
        deleteEntity(user, INVOICES, INVOICE_HEADERS, INVOICE_CREATOR_IDX, body.id)
        try { rebuildIssuerSheets() } catch (e3) {}
        return jsonOut({ ok: true })
    }
    return jsonOut({ ok: false, error: 'unknown action' })
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) })
  }
}

// ================= 集計 =================

function computeTotals(items, taxMode) {
  const net = { 8: 0, 10: 0 }
  let incl = 0
  let reimb = 0
  ;(items || []).forEach(function (it) {
    const amount = Math.round((it.quantity || 0) * (it.unitPrice || 0))
    if (it.isReimbursement) reimb += amount
    else if (Number(it.taxRate) === 0) incl += amount
    else net[it.taxRate] += amount
  })
  const exempt = taxMode === 'exempt'
  const tax8 = exempt ? 0 : Math.floor(net[8] * 0.08)
  const tax10 = exempt ? 0 : Math.floor(net[10] * 0.1)
  const subtotal = net[8] + net[10]
  const taxTotal = tax8 + tax10
  const revenue = subtotal + taxTotal + incl // 立替金以外
  return {
    subtotal: subtotal, taxTotal: taxTotal,
    revenue: revenue, reimbursement: reimb,
    total: revenue + reimb,
  }
}

function safeParse(str, fallback) {
  try { return JSON.parse(str) } catch (e) { return fallback }
}

/** セル値を YYYY-MM-DD 文字列に整える（Dateに自動変換されていても正しく戻す） */
function toYmd(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, ss().getSpreadsheetTimeZone(), 'yyyy-MM-dd')
  }
  const s = String(v == null ? '' : v)
  const m = s.match(/^\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : s
}

// ================= 行操作 =================

function findRow(sh, id) {
  const last = sh.getLastRow()
  if (last < 2) return -1
  const ids = sh.getRange(2, 1, last - 1, 1).getValues()
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2
  }
  return -1
}

function readAll(sh) {
  const last = sh.getLastRow()
  if (last < 2) return []
  return sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues()
}

/** 既存行の作成者を返す（無ければ ''） */
function creatorOfRow(sh, rowNum, creatorIdx) {
  return String(sh.getRange(rowNum, creatorIdx + 1).getValue() || '')
}

/** 権限チェック付きで行を書き込む。creator は本人（新規）または既存値を維持 */
function writeWithGuard(user, sh, id, baseRow, creatorIdx) {
  const r = findRow(sh, id)
  let creator = user.email
  if (r !== -1) {
    const existing = creatorOfRow(sh, r, creatorIdx)
    if (!user.isOwner && normEmail(existing) !== normEmail(user.email)) {
      throw new Error('forbidden')
    }
    creator = existing || user.email
  }
  const row = baseRow.slice()
  row[creatorIdx] = creator
  if (r === -1) sh.appendRow(row)
  else sh.getRange(r, 1, 1, row.length).setValues([row])
}

function deleteEntity(user, sheetName, headers, creatorIdx, id) {
  const sh = getSheet(sheetName, headers)
  const r = findRow(sh, id)
  if (r === -1) return
  if (!user.isOwner) {
    const existing = creatorOfRow(sh, r, creatorIdx)
    if (normEmail(existing) !== normEmail(user.email)) throw new Error('forbidden')
  }
  sh.deleteRow(r)
}

// ================= マッピング =================

function upsertCustomer(user, c) {
  const sh = getSheet(CUSTOMERS, CUSTOMER_HEADERS)
  const base = [c.id, c.companyName, c.contactName, c.email, c.address, c.phone, '']
  writeWithGuard(user, sh, c.id, base, CUSTOMER_CREATOR_IDX)
}

function upsertInvoice(user, inv, customerName) {
  const sh = getSheet(INVOICES, INVOICE_HEADERS)
  const t = computeTotals(inv.items, inv.issuer && inv.issuer.taxMode)
  const base = [
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
    inv.businessType || '',
    '', // 作成者（writeWithGuard が設定）
    t.revenue, // 立替金以外
    t.reimbursement, // 立替金
  ]
  writeWithGuard(user, sh, inv.id, base, INVOICE_CREATOR_IDX)
}

/** 権限に応じてデータを絞り込んで返す */
function getStateFor(user) {
  const em = normEmail(user.email)
  const custRows = readAll(getSheet(CUSTOMERS, CUSTOMER_HEADERS))
  const invRows = readAll(getSheet(INVOICES, INVOICE_HEADERS))

  const customers = custRows
    .filter(function (r) { return r[0] })
    .filter(function (r) { return user.isOwner || normEmail(r[CUSTOMER_CREATOR_IDX]) === em })
    .map(function (r) {
      return {
        id: String(r[0]), companyName: String(r[1] == null ? '' : r[1]),
        contactName: String(r[2] == null ? '' : r[2]),
        email: String(r[3] == null ? '' : r[3]),
        address: String(r[4] == null ? '' : r[4]),
        phone: String(r[5] == null ? '' : r[5]),
        creator: String(r[CUSTOMER_CREATOR_IDX] == null ? '' : r[CUSTOMER_CREATOR_IDX]),
      }
    })

  const invoices = invRows
    .filter(function (r) { return r[0] })
    .filter(function (r) { return user.isOwner || normEmail(r[INVOICE_CREATOR_IDX]) === em })
    .map(function (r) {
      const issuer = safeParse(r[14], {})
      return {
        id: String(r[0]), invoiceNumber: String(r[1]),
        issueDate: toYmd(r[2]), dueDate: toYmd(r[3]),
        status: STATUS_KEYS[r[4]] || 'draft',
        customerId: String(r[7]), issuerId: issuer.id || '', issuer: issuer,
        items: safeParse(r[13], []),
        notes: String(r[15] == null ? '' : r[15]),
        createdAt: String(r[16] == null ? '' : r[16]),
        updatedAt: String(r[17] == null ? '' : r[17]),
        honorific: r[18] || '御中',
        businessType: String(r[19] == null ? '' : r[19]),
        creator: String(r[INVOICE_CREATOR_IDX] == null ? '' : r[INVOICE_CREATOR_IDX]),
      }
    })

  invoices.sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt))
  })
  return { ok: true, customers: customers, invoices: invoices }
}

// ================= 請求者ごとの売上シート =================

/** シート名に使えない文字を除去して「売上_<請求者>」を返す */
function issuerSheetName(issuer) {
  const safe = String(issuer || '（未設定）').replace(/[\[\]\*\?\/\\:]/g, ' ').slice(0, 90)
  return ISSUER_SHEET_PREFIX + safe
}

/**
 * 「請求書」シートの内容を請求者ごとに別シート（売上_<請求者>）へ自動振り分け。
 * 各シートは A:事業種別 / B:請求書番号 / C:顧客名 / D:ステータス / E:発行日 / F:合計。
 * 請求書の作成・編集・削除のたびに全再構築する。手動実行も可。
 */
function rebuildIssuerSheets() {
  const invRows = readAll(getSheet(INVOICES, INVOICE_HEADERS))
  const groups = {}
  invRows.forEach(function (r) {
    if (!r[0]) return
    const issuer = String(r[5] || '（未設定）')
    // 明細から再計算（旧行でも立替金以外/立替金を正しく出す）
    const items = safeParse(r[13], [])
    const taxMode = (safeParse(r[14], {}) || {}).taxMode
    const tt = computeTotals(items, taxMode)
    if (!groups[issuer]) groups[issuer] = []
    groups[issuer].push({
      biz: String(r[19] || ''),        // 事業種別
      number: String(r[1] || ''),      // 請求書番号
      customer: String(r[8] || ''),    // 顧客名
      status: String(r[4] || ''),      // ステータス
      issueDate: toYmd(r[2]),          // 発行日
      revenue: tt.revenue,             // 立替金以外
      reimb: tt.reimbursement,         // 立替金
      total: tt.total,                 // 合計
      notes: String(r[15] || ''),      // 備考
    })
  })

  const book = ss()
  const targetNames = {}
  Object.keys(groups).forEach(function (issuer) {
    targetNames[issuerSheetName(issuer)] = true
  })

  // 対象外になった売上シート（請求者名変更・全削除など）は中身を空にする
  book.getSheets().forEach(function (s) {
    const nm = s.getName()
    if (nm.indexOf(ISSUER_SHEET_PREFIX) === 0 && !targetNames[nm]) s.clearContents()
  })

  Object.keys(groups).forEach(function (issuer) {
    const name = issuerSheetName(issuer)
    let sh = book.getSheetByName(name)
    if (!sh) sh = book.insertSheet(name)
    sh.clearContents()

    const list = groups[issuer].sort(function (a, b) {
      return String(a.issueDate).localeCompare(String(b.issueDate))
    })
    const out = [ISSUER_VIEW_HEADERS]
    let sumRev = 0
    let sumReimb = 0
    let sumTotal = 0
    list.forEach(function (x) {
      out.push([x.biz, x.number, x.customer, x.status, x.issueDate, x.revenue, x.reimb, x.total, x.notes])
      sumRev += x.revenue
      sumReimb += x.reimb
      sumTotal += x.total
    })
    out.push(['', '', '', '', '合計', sumRev, sumReimb, sumTotal, ''])

    sh.getRange(1, 1, out.length, ISSUER_VIEW_HEADERS.length).setValues(out)
  })
}
