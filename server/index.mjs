// Keiri バックエンド：フロントと Notion の橋渡しをする軽量プロキシ。
// NOTION_TOKEN / NOTION_PARENT_PAGE_ID が未設定なら Notion 無効（フロントは localStorage で動作）。
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import * as notion from './notion.mjs'

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

const enabled = notion.isConfigured()

// 稼働状況。フロントはこれで Notion 連携の有無を判定する。
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, notion: enabled })
})

// Notion 未設定なら 501 を返し、フロントは localStorage にフォールバックする
function requireNotion(_req, res, next) {
  if (!enabled) return res.status(501).json({ error: 'Notion is not configured' })
  next()
}

app.get('/api/state', requireNotion, async (_req, res) => {
  try {
    res.json(await notion.getState())
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.put('/api/customers/:id', requireNotion, async (req, res) => {
  try {
    res.json(await notion.upsertCustomer({ ...req.body, id: req.params.id }))
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.delete('/api/customers/:id', requireNotion, async (req, res) => {
  try {
    await notion.deleteCustomer(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.put('/api/invoices/:id', requireNotion, async (req, res) => {
  try {
    const { invoice, customerName } = req.body
    res.json(await notion.upsertInvoice({ ...invoice, id: req.params.id }, customerName))
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

app.delete('/api/invoices/:id', requireNotion, async (req, res) => {
  try {
    await notion.deleteInvoice(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

const PORT = process.env.PORT || 8787
app.listen(PORT, () => {
  console.log(`[keiri] server on http://localhost:${PORT}  (Notion: ${enabled ? 'ON' : 'OFF'})`)
  if (enabled) {
    notion
      .ensureDatabases()
      .then((ids) => console.log('[keiri] Notion databases ready:', ids))
      .catch((e) => console.error('[keiri] Notion setup failed:', e.message))
  }
})
