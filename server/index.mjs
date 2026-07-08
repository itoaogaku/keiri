// Keiri バックエンド：フロントと Google Sheets の橋渡しをする軽量プロキシ。
// 認証情報 / スプレッドシートIDが未設定ならスプレッドシート無効（フロントは localStorage で動作）。
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import * as sheets from './sheets.mjs'

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

const enabled = sheets.isConfigured()

// 稼働状況。フロントはこれでスプレッドシート連携の有無を判定する。
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, sheets: enabled })
})

// 未設定なら 501 を返し、フロントは localStorage にフォールバックする
function requireSheets(_req, res, next) {
  if (!enabled) return res.status(501).json({ error: 'Google Sheets is not configured' })
  next()
}

app.get('/api/state', requireSheets, async (_req, res) => {
  try {
    res.json(await sheets.getState())
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.put('/api/customers/:id', requireSheets, async (req, res) => {
  try {
    res.json(await sheets.upsertCustomer({ ...req.body, id: req.params.id }))
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.delete('/api/customers/:id', requireSheets, async (req, res) => {
  try {
    await sheets.deleteCustomer(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.put('/api/invoices/:id', requireSheets, async (req, res) => {
  try {
    const { invoice, customerName } = req.body
    res.json(await sheets.upsertInvoice({ ...invoice, id: req.params.id }, customerName))
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.delete('/api/invoices/:id', requireSheets, async (req, res) => {
  try {
    await sheets.deleteInvoice(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

const PORT = process.env.PORT || 8787
app.listen(PORT, () => {
  console.log(
    `[keiri] server on http://localhost:${PORT}  (Sheets: ${enabled ? 'ON' : 'OFF'})`
  )
  if (enabled) {
    sheets
      .ensureSheets()
      .then((ids) => console.log('[keiri] Spreadsheet tabs ready:', ids))
      .catch((e) => console.error('[keiri] Sheets setup failed:', e.message))
  }
})
