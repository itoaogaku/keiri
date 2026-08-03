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
 * 「顧客」「請求書」「ユーザー」シートは、誰かが一度ログインを試みると
 * 自動で作られます。まだ誰もログインしていない新しいスプレッドシートでは
 * タブが1つも無いので、先に下の setup() を一度手動実行してください。
 *   1. 上部の関数選択ドロップダウンで「setup」を選ぶ
 *   2. 「実行」（▶）をクリック（初回は権限の承認を求められたら許可）
 *   3. スプレッドシートに戻ると「顧客」「請求書」「領収書」「ユーザー」の
 *      タブが揃っている
 * ★「ユーザー」シートに、利用者のメール・名前・PIN・役割を1行ずつ登録してください。
 *    役割: owner（全データ閲覧可） / それ以外（restricted＝自分の作成分のみ）
 */

const CUSTOMERS = '顧客'
const INVOICES = '請求書'
const RECEIPTS = '領収書'
const USERS = 'ユーザー'

// 末尾に「作成者」列を持たせ、閲覧制御に使う
const CUSTOMER_HEADERS = ['id', '企業名', '担当者', 'メール', '住所', '電話', '作成者']
const INVOICE_HEADERS = [
  'id', '請求書番号', '発行日', '支払期限', 'ステータス', '請求者', '課税区分',
  '顧客ID', '顧客名', '小計', '消費税', '合計', '登録番号',
  '明細JSON', '請求者JSON', '備考', '作成日時', '更新日時', '敬称', '事業種別', '作成者',
  '立替金以外', '立替金',
]
const RECEIPT_HEADERS = [
  'id', '領収書番号', '領収日', '宛名', '敬称', '請求者', '課税区分',
  '小計', '消費税', '合計', '但し書き', '請求者JSON', '請求書ID', '請求書番号',
  '作成日時', '更新日時', '作成者',
]
const USER_HEADERS = ['メール', '名前', 'PIN', '役割']

// 共有設定（請求者プロファイル・事業種別）を保存するシート。
// 角印画像などで大きくなるため JSON を分割して1列に格納する。
const CONFIG_SHEET = '設定'
const CONFIG_CHUNK = 45000

// 請求者ごとの売上シート
const ISSUER_SHEET_PREFIX = '売上_'
const ISSUER_VIEW_HEADERS = ['事業種別', '請求書番号', '顧客名', 'ステータス', '発行日', '立替金以外', '立替金', '合計', '備考']

// 「作成者」列の位置（0始まり）
const CUSTOMER_CREATOR_IDX = 6
const INVOICE_CREATOR_IDX = 20
const RECEIPT_CREATOR_IDX = 16

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

/**
 * 初回セットアップ用：必要なシートをすべて作成する（手動で一度実行）。
 * 「顧客」「請求書」「領収書」「ユーザー」は通常ログイン時に自動で作られるが、
 * まだ誰もログインしていない新しいスプレッドシートではタブが1つも無いため、
 * 先にこれを実行してタブを揃えてから「ユーザー」シートへ入力する。
 */
function setup() {
  getSheet(CUSTOMERS, CUSTOMER_HEADERS)
  getSheet(INVOICES, INVOICE_HEADERS)
  getSheet(RECEIPTS, RECEIPT_HEADERS)
  getSheet(USERS, USER_HEADERS)
  Logger.log('セットアップ完了：顧客・請求書・領収書・ユーザーの各シートを用意しました。')
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

// ================= 共有設定（請求者・事業種別） =================

function readConfig() {
  const sh = ss().getSheetByName(CONFIG_SHEET)
  if (!sh) return { issuers: [], businessTypes: [] }
  const last = sh.getLastRow()
  if (last < 1) return { issuers: [], businessTypes: [] }
  const cells = sh.getRange(1, 1, last, 1).getValues()
  const json = cells.map(function (r) { return r[0] }).join('')
  try {
    const c = JSON.parse(json)
    return { issuers: c.issuers || [], businessTypes: c.businessTypes || [] }
  } catch (e) {
    return { issuers: [], businessTypes: [] }
  }
}

function writeConfig(config) {
  const book = ss()
  let sh = book.getSheetByName(CONFIG_SHEET)
  if (!sh) sh = book.insertSheet(CONFIG_SHEET)
  sh.clearContents()
  const json = JSON.stringify({
    issuers: (config && config.issuers) || [],
    businessTypes: (config && config.businessTypes) || [],
  })
  const chunks = []
  for (let i = 0; i < json.length; i += CONFIG_CHUNK) chunks.push([json.slice(i, i + CONFIG_CHUNK)])
  if (chunks.length === 0) chunks.push([''])
  const range = sh.getRange(1, 1, chunks.length, 1)
  // セルを文字列固定にして、base64が数式/数値/日付に化けるのを防ぐ
  range.setNumberFormat('@')
  range.setValues(chunks)
}

/** 全請求書を対象に、指定日(YYYYMMDD)の次の請求書番号を採番する */
function nextInvoiceNumber(datePart) {
  const rows = readAll(getSheet(INVOICES, INVOICE_HEADERS))
  let max = 0
  rows.forEach(function (r) {
    const num = String(r[1])
    if (/^\d{10}$/.test(num) && num.slice(0, 8) === datePart) {
      const seq = parseInt(num.slice(8), 10)
      if (!isNaN(seq) && seq > max) max = seq
    }
  })
  return datePart + String(max + 1).padStart(2, '0')
}

/** 全領収書を対象に、指定日(YYYYMMDD)の次の領収書番号を採番する（R-YYYYMMDD-XX） */
function nextReceiptNumber(datePart) {
  const rows = readAll(getSheet(RECEIPTS, RECEIPT_HEADERS))
  const prefix = 'R-' + datePart + '-'
  let max = 0
  rows.forEach(function (r) {
    const num = String(r[1])
    if (num.indexOf(prefix) === 0) {
      const seq = parseInt(num.slice(prefix.length), 10)
      if (!isNaN(seq) && seq > max) max = seq
    }
  })
  return prefix + String(max + 1).padStart(2, '0')
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
      case 'nextInvoiceNumber':
        return jsonOut({ ok: true, invoiceNumber: nextInvoiceNumber(String(body.datePart)) })
      case 'nextReceiptNumber':
        return jsonOut({ ok: true, receiptNumber: nextReceiptNumber(String(body.datePart)) })
      case 'saveConfig':
        if (!user.isOwner) return jsonOut({ ok: false, error: 'forbidden' })
        writeConfig(body.config)
        return jsonOut({ ok: true })
      case 'upsertCustomer': {
        const savedId = upsertCustomer(user, body.customer)
        return jsonOut({ ok: true, id: savedId })
      }
      case 'deleteCustomer':
        deleteShared(CUSTOMERS, CUSTOMER_HEADERS, body.id)
        return jsonOut({ ok: true })
      case 'mergeCustomers':
        if (!user.isOwner) return jsonOut({ ok: false, error: 'forbidden' })
        return jsonOut({ ok: true, merged: mergeDuplicateCustomers() })
      case 'upsertInvoice':
        upsertInvoice(user, body.invoice, body.customerName)
        try { rebuildIssuerSheets() } catch (e2) {}
        try { rebuildAnalysisSheet() } catch (e2b) {}
        return jsonOut({ ok: true })
      case 'deleteInvoice':
        deleteEntity(user, INVOICES, INVOICE_HEADERS, INVOICE_CREATOR_IDX, body.id)
        try { rebuildIssuerSheets() } catch (e3) {}
        try { rebuildAnalysisSheet() } catch (e3b) {}
        return jsonOut({ ok: true })
      case 'upsertReceipt':
        upsertReceipt(user, body.receipt)
        return jsonOut({ ok: true })
      case 'deleteReceipt':
        deleteEntity(user, RECEIPTS, RECEIPT_HEADERS, RECEIPT_CREATOR_IDX, body.id)
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
  if (r === -1) {
    // 新規はヘッダ直下（2行目）に挿入し、最新が上に来るようにする
    sh.insertRowBefore(2)
    sh.getRange(2, 1, 1, row.length).setValues([row])
  } else {
    sh.getRange(r, 1, 1, row.length).setValues([row])
  }
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

/**
 * 顧客は全員共有の台帳として扱う（作成者による閲覧・編集制限をかけない）。
 * 誰が登録・編集しても構わないため、権限チェックなしで書き込む。
 */
function writeShared(user, sh, id, baseRow, creatorIdx) {
  const r = findRow(sh, id)
  const creator = r !== -1 ? creatorOfRow(sh, r, creatorIdx) || user.email : user.email
  const row = baseRow.slice()
  row[creatorIdx] = creator
  if (r === -1) {
    sh.insertRowBefore(2)
    sh.getRange(2, 1, 1, row.length).setValues([row])
  } else {
    sh.getRange(r, 1, 1, row.length).setValues([row])
  }
}

function deleteShared(sheetName, headers, id) {
  const sh = getSheet(sheetName, headers)
  const r = findRow(sh, id)
  if (r !== -1) sh.deleteRow(r)
}

function normCompanyName(s) {
  return String(s == null ? '' : s).trim().toLowerCase()
}

/** 企業名が完全一致する既存顧客の行番号を返す（自分自身のidは除く） */
function findCustomerRowByName(sh, companyName, excludeId) {
  const last = sh.getLastRow()
  if (last < 2) return -1
  const rows = sh.getRange(2, 1, last - 1, 2).getValues() // A:id, B:企業名
  const target = normCompanyName(companyName)
  if (!target) return -1
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(excludeId)) continue
    if (normCompanyName(rows[i][1]) === target) return i + 2
  }
  return -1
}

/**
 * 既存の重複顧客（企業名が同じ）を1件に統合する。
 * - 各グループで、請求書からの参照が最も多い顧客を正とする（同数なら先頭）
 * - 正の側で空欄の項目は、重複側の値で補完する
 * - その顧客を参照している請求書の顧客IDを正のidへ付け替える
 * - 重複行を削除する
 * 戻り値は統合（削除）した件数。
 */
function mergeDuplicateCustomers() {
  const sh = getSheet(CUSTOMERS, CUSTOMER_HEADERS)
  const last = sh.getLastRow()
  if (last < 3) return 0
  const numRows = last - 1
  const data = sh.getRange(2, 1, numRows, CUSTOMER_HEADERS.length).getValues()

  const groups = {}
  data.forEach(function (r, i) {
    if (!r[0]) return
    const key = normCompanyName(r[1])
    if (!key) return
    if (!groups[key]) groups[key] = []
    groups[key].push({ sheetRow: i + 2, id: String(r[0]), row: r })
  })

  const invSh = getSheet(INVOICES, INVOICE_HEADERS)
  const invLast = invSh.getLastRow()
  const custIdCol = 8 // 「顧客ID」列（1始まり）
  const invIds = invLast >= 2 ? invSh.getRange(2, custIdCol, invLast - 1, 1).getValues() : []

  const counts = {}
  invIds.forEach(function (c) {
    const cid = String(c[0])
    counts[cid] = (counts[cid] || 0) + 1
  })

  const rowsToDelete = []
  const idRemap = {}
  let mergedCount = 0

  Object.keys(groups).forEach(function (key) {
    const list = groups[key]
    if (list.length < 2) return
    list.sort(function (a, b) { return (counts[b.id] || 0) - (counts[a.id] || 0) })
    const canonical = list[0]
    const dups = list.slice(1)

    const merged = canonical.row.slice()
    dups.forEach(function (d) {
      for (let col = 2; col <= 5; col++) { // 担当者/メール/住所/電話
        if (!merged[col] && d.row[col]) merged[col] = d.row[col]
      }
    })
    sh.getRange(canonical.sheetRow, 1, 1, CUSTOMER_HEADERS.length).setValues([merged])

    dups.forEach(function (d) {
      idRemap[d.id] = canonical.id
      rowsToDelete.push(d.sheetRow)
      mergedCount++
    })
  })

  if (Object.keys(idRemap).length && invLast >= 2) {
    const range = invSh.getRange(2, custIdCol, invLast - 1, 1)
    const ids = range.getValues()
    let changed = false
    for (let i = 0; i < ids.length; i++) {
      const cid = String(ids[i][0])
      if (idRemap[cid]) {
        ids[i][0] = idRemap[cid]
        changed = true
      }
    }
    if (changed) range.setValues(ids)
  }

  // 行番号がずれないよう、大きい行番号から削除する
  rowsToDelete.sort(function (a, b) { return b - a })
  rowsToDelete.forEach(function (r) { sh.deleteRow(r) })

  if (mergedCount > 0) {
    try { rebuildIssuerSheets() } catch (e) {}
    try { rebuildAnalysisSheet() } catch (e) {}
  }
  return mergedCount
}

// ================= マッピング =================

/**
 * 顧客は全員共有の台帳。企業名が一致する既存顧客があれば、
 * 新規作成せずその既存行を更新する（同じ会社が複数人の入力で
 * 重複登録されるのを防ぐ）。戻り値は実際に書き込んだid。
 */
function upsertCustomer(user, c) {
  const sh = getSheet(CUSTOMERS, CUSTOMER_HEADERS)
  let targetId = c.id
  const dupRow = findCustomerRowByName(sh, c.companyName, c.id)
  if (dupRow !== -1) {
    targetId = String(sh.getRange(dupRow, 1).getValue())
  }
  const base = [targetId, c.companyName, c.contactName, c.email, c.address, c.phone, '']
  writeShared(user, sh, targetId, base, CUSTOMER_CREATOR_IDX)
  return targetId
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

function upsertReceipt(user, rc) {
  const sh = getSheet(RECEIPTS, RECEIPT_HEADERS)
  const issuer = rc.issuer || {}
  const exempt = rc.exempt === true
  const base = [
    rc.id, rc.receiptNo || '', rc.receiptDate || '',
    rc.recipientName || '', rc.honorific || '御中',
    issuer.name || '',
    exempt ? '非課税' : '課税',
    rc.subtotal || 0, rc.taxTotal || 0, rc.total || 0,
    rc.note || '', JSON.stringify(issuer),
    rc.invoiceId || '', rc.invoiceNumber || '',
    rc.createdAt || '', rc.updatedAt || '',
    '', // 作成者（writeWithGuard が設定）
  ]
  writeWithGuard(user, sh, rc.id, base, RECEIPT_CREATOR_IDX)
}

/** 権限に応じてデータを絞り込んで返す */
function getStateFor(user) {
  const em = normEmail(user.email)
  const custRows = readAll(getSheet(CUSTOMERS, CUSTOMER_HEADERS))
  const invRows = readAll(getSheet(INVOICES, INVOICE_HEADERS))

  // 顧客は全員共有の台帳のため、作成者に関わらず全件を返す
  const customers = custRows
    .filter(function (r) { return r[0] })
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

  const rcRows = readAll(getSheet(RECEIPTS, RECEIPT_HEADERS))
  const receipts = rcRows
    .filter(function (r) { return r[0] })
    .filter(function (r) { return user.isOwner || normEmail(r[RECEIPT_CREATOR_IDX]) === em })
    .map(function (r) {
      return {
        id: String(r[0]), receiptNo: String(r[1] || ''), receiptDate: toYmd(r[2]),
        recipientName: String(r[3] || ''), honorific: r[4] || '御中',
        exempt: r[6] === '非課税',
        subtotal: Number(r[7]) || 0, taxTotal: Number(r[8]) || 0, total: Number(r[9]) || 0,
        note: String(r[10] || ''), issuer: safeParse(r[11], {}),
        invoiceId: String(r[12] || ''), invoiceNumber: String(r[13] || ''),
        createdAt: String(r[14] || ''), updatedAt: String(r[15] || ''),
        creator: String(r[RECEIPT_CREATOR_IDX] || ''),
      }
    })
  receipts.sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt))
  })

  const config = readConfig()
  return {
    ok: true,
    customers: customers,
    invoices: invoices,
    receipts: receipts,
    issuers: config.issuers,
    businessTypes: config.businessTypes,
  }
}

// ================= 請求者ごとの売上シート =================

/** シート名に使えない文字を除去して「売上_<ラベル>」を返す */
function issuerSheetName(label) {
  const safe = String(label || '（未設定）').replace(/[\[\]\*\?\/\\:]/g, ' ').slice(0, 90)
  return ISSUER_SHEET_PREFIX + safe
}

/** 設定(請求者)の 正式名称→略称 マップを作る */
function issuerShortNameMap() {
  const map = {}
  const config = readConfig()
  ;(config.issuers || []).forEach(function (i) {
    if (i && i.name) map[i.name] = String(i.shortName || '').trim()
  })
  return map
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
  const shortByName = issuerShortNameMap()
  const labelFor = function (issuer) {
    return shortByName[issuer] ? shortByName[issuer] : issuer
  }

  const targetNames = {}
  Object.keys(groups).forEach(function (issuer) {
    targetNames[issuerSheetName(labelFor(issuer))] = true
  })

  // 対象外になった売上シート（略称変更・請求者名変更・全削除など）は削除する
  book.getSheets().forEach(function (s) {
    const nm = s.getName()
    if (nm.indexOf(ISSUER_SHEET_PREFIX) === 0 && !targetNames[nm]) {
      try {
        book.deleteSheet(s)
      } catch (e) {
        s.clearContents()
      }
    }
  })

  Object.keys(groups).forEach(function (issuer) {
    const name = issuerSheetName(labelFor(issuer))
    let sh = book.getSheetByName(name)
    if (!sh) sh = book.insertSheet(name)
    sh.clearContents()

    const list = groups[issuer].sort(function (a, b) {
      return String(b.issueDate).localeCompare(String(a.issueDate)) // 新しい発行日が上
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

// ================= 分析シート =================

const ANALYSIS_SHEET = '分析'

function newAgg() {
  return { count: 0, revenue: 0, reimb: 0, total: 0 }
}
function addAgg(map, key, tt) {
  if (!map[key]) map[key] = newAgg()
  const m = map[key]
  m.count += 1
  m.revenue += tt.revenue
  m.reimb += tt.reimbursement
  m.total += tt.total
}

/** シートの指定行にブロック（2次元配列）を書き込み、次の空き行番号を返す */
function writeBlock(sh, startRow, block) {
  if (!block.length) return startRow
  let cols = 0
  block.forEach(function (r) { if (r.length > cols) cols = r.length })
  const padded = block.map(function (r) {
    const rr = r.slice()
    while (rr.length < cols) rr.push('')
    return rr
  })
  sh.getRange(startRow, 1, padded.length, cols).setValues(padded)
  return startRow + padded.length
}

/** 発行月(YYYY-MM)から年度ラベル（4月始まり）を返す */
function fyLabel(ym) {
  if (!ym || ym.length < 7) return '不明'
  const y = parseInt(ym.slice(0, 4), 10)
  const m = parseInt(ym.slice(5, 7), 10)
  if (isNaN(y) || isNaN(m)) return '不明'
  return (m >= 4 ? y : y - 1) + '年度'
}

/** data[a][b] += v */
function bump(d, a, b, v) {
  if (!d[a]) d[a] = {}
  d[a][b] = (d[a][b] || 0) + v
}

/** 件数・立替金以外・立替金・合計のサマリーブロックを作る（keys順） */
function summaryBlock(title, map, keys) {
  const block = [[title], ['区分', '件数', '立替金以外', '立替金', '合計']]
  let c = 0, rev = 0, rem = 0, tot = 0
  keys.forEach(function (k) {
    const m = map[k]
    if (!m) return
    block.push([k, m.count, m.revenue, m.reimb, m.total])
    c += m.count; rev += m.revenue; rem += m.reimb; tot += m.total
  })
  block.push(['合計', c, rev, rem, tot])
  return block
}

/** クロス集計ブロックを作る。data[rowKey][colKey] = number */
function crossTab(title, cornerLabel, rowKeys, colKeys, data) {
  const block = [[title]]
  block.push([cornerLabel].concat(colKeys).concat(['合計']))
  const colSums = colKeys.map(function () { return 0 })
  let grand = 0
  rowKeys.forEach(function (rk) {
    const line = [rk]
    let rt = 0
    colKeys.forEach(function (ck, idx) {
      const v = (data[rk] && data[rk][ck]) || 0
      line.push(v)
      rt += v
      colSums[idx] += v
    })
    line.push(rt)
    grand += rt
    block.push(line)
  })
  block.push(['合計'].concat(colSums).concat([grand]))
  return block
}

/**
 * 「分析」シートを再構築（年度＝4月〜翌3月で区切る）。
 * 年度別サマリー／事業種別×年度／請求者×年度／請求者×事業種別／
 * 月別／ステータス別 をまとめる。金額は立替金以外(収益)を基本にする。
 */
function rebuildAnalysisSheet() {
  const rows = readAll(getSheet(INVOICES, INVOICE_HEADERS))
  const shortByName = issuerShortNameMap()

  const byFy = {}
  const byMonth = {}
  const byStatus = {}
  const bizFy = {}       // bizFy[biz][fy] = revenue
  const issuerFy = {}    // issuerFy[issuer][fy] = revenue
  const issuerBiz = {}   // issuerBiz[issuer][biz] = revenue
  const bizSet = {}
  const issuerSet = {}
  const fySet = {}

  rows.forEach(function (r) {
    if (!r[0]) return
    const items = safeParse(r[13], [])
    const taxMode = (safeParse(r[14], {}) || {}).taxMode
    const tt = computeTotals(items, taxMode)
    const biz = String(r[19] || '未分類')
    const issuerName = String(r[5] || '（未設定）')
    const issuer = shortByName[issuerName] ? shortByName[issuerName] : issuerName
    const ym = (toYmd(r[2]) || '').slice(0, 7) || '不明'
    const fy = fyLabel(ym)
    const status = String(r[4] || '')

    addAgg(byFy, fy, tt)
    addAgg(byMonth, ym, tt)
    addAgg(byStatus, status, tt)
    bizSet[biz] = true
    issuerSet[issuer] = true
    fySet[fy] = true
    bump(bizFy, biz, fy, tt.revenue)
    bump(issuerFy, issuer, fy, tt.revenue)
    bump(issuerBiz, issuer, biz, tt.revenue)
  })

  const book = ss()
  let sh = book.getSheetByName(ANALYSIS_SHEET)
  if (!sh) sh = book.insertSheet(ANALYSIS_SHEET)
  sh.clear()

  const fyKeys = Object.keys(fySet).sort().reverse() // 新しい年度が左/上
  const bizList = Object.keys(bizSet).sort()
  const issuerList = Object.keys(issuerSet).sort()

  const now = Utilities.formatDate(new Date(), ss().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm')
  let row = 1
  row = writeBlock(sh, row, [['売上分析（年度＝4月〜翌3月）'], ['最終更新: ' + now]])
  row += 1

  // 年度別サマリー
  row = writeBlock(sh, row, summaryBlock('■ 年度別サマリー', byFy, fyKeys)); row += 1

  // 事業種別 × 年度（立替金以外）
  row = writeBlock(
    sh, row,
    crossTab('■ 事業種別 × 年度（立替金以外の売上）', '事業種別＼年度', bizList, fyKeys, bizFy)
  ); row += 1

  // 請求者 × 年度（立替金以外）
  row = writeBlock(
    sh, row,
    crossTab('■ 請求者 × 年度（立替金以外の売上）', '請求者＼年度', issuerList, fyKeys, issuerFy)
  ); row += 1

  // 請求者 × 事業種別（立替金以外・全期間）
  row = writeBlock(
    sh, row,
    crossTab('■ 請求者 × 事業種別（立替金以外・全期間）', '請求者＼事業種別', issuerList, bizList, issuerBiz)
  ); row += 1

  // 月別（新しい順）
  const monthKeys = Object.keys(byMonth).sort().reverse()
  row = writeBlock(sh, row, summaryBlock('■ 月別（発行月）', byMonth, monthKeys)); row += 1

  // ステータス別
  const statusKeys = Object.keys(byStatus).sort(function (a, b) {
    return byStatus[b].total - byStatus[a].total
  })
  row = writeBlock(sh, row, summaryBlock('■ ステータス別', byStatus, statusKeys))
}
