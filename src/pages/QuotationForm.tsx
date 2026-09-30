import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { newId, snapshotIssuer } from '../lib/invoice'
import { createBlankQuotation, copyQuotation } from '../lib/quotation'
import { computeTotals, lineNet } from '../lib/calc'
import { yen } from '../lib/format'
import {
  QUOTATION_STATUS_LABELS,
  TAX_MODE_LABELS,
  type Honorific,
  type InvoiceItem,
  type Quotation,
  type QuotationStatus,
  type TaxRate,
} from '../types'

type ItemCategory = '10' | '8' | 'incl' | 'none' | 'reimb'

/** 明細の区分（税率／税込／なし／立替金）を1つの値に集約 */
function itemCategory(it: InvoiceItem): ItemCategory {
  if (it.isReimbursement) return 'reimb'
  if (it.noTaxLabel) return 'none'
  if (it.taxRate === 0) return 'incl'
  return String(it.taxRate) as '10' | '8'
}

/** 区分の選択値から taxRate・立替金フラグ・なしフラグを決める */
function categoryPatch(cat: ItemCategory): Partial<InvoiceItem> {
  if (cat === 'reimb') return { taxRate: 0, isReimbursement: true, noTaxLabel: false }
  if (cat === 'none') return { taxRate: 0, isReimbursement: false, noTaxLabel: true }
  if (cat === 'incl') return { taxRate: 0, isReimbursement: false, noTaxLabel: false }
  return { taxRate: Number(cat) as TaxRate, isReimbursement: false, noTaxLabel: false }
}

export default function QuotationForm() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const copyFromId = searchParams.get('copyFrom')
  const navigate = useNavigate()
  const {
    data,
    session,
    getQuotation,
    addQuotation,
    updateQuotation,
    addBusinessType,
    fetchNextQuotationNumber,
  } = useApp()
  const isOwner = !session || session.role === 'owner'

  const isEdit = Boolean(id)

  const initial = useMemo<Quotation>(() => {
    if (isEdit && id) {
      const existing = getQuotation(id)
      if (existing) return structuredClone(existing)
    }
    if (copyFromId) {
      const src = getQuotation(copyFromId)
      if (src) return copyQuotation(src, data.quotations)
    }
    return createBlankQuotation(data.quotations, data.issuers[0])
    // 初回マウント時のみ算出（以降の入力で再生成させない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [form, setForm] = useState<Quotation>(initial)
  const [copiedNotice, setCopiedNotice] = useState(Boolean(copyFromId))

  useEffect(() => {
    if (copiedNotice) {
      const t = setTimeout(() => setCopiedNotice(false), 4000)
      return () => clearTimeout(t)
    }
  }, [copiedNotice])

  // 新規作成時は、全員の見積を対象にした「次の見積書番号」をGASから取得して反映する
  useEffect(() => {
    if (isEdit) return
    let cancelled = false
    fetchNextQuotationNumber().then((num) => {
      if (!cancelled && num) setForm((f) => ({ ...f, quotationNumber: num }))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totals = computeTotals(form.items, form.issuer.taxMode)

  const set = <K extends keyof Quotation>(key: K, value: Quotation[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const addAndSelectBusinessType = () => {
    const name = window.prompt('追加する事業種別を入力してください')?.trim()
    if (!name) return
    addBusinessType(name)
    set('businessType', name)
  }

  const selectIssuer = (issuerId: string) =>
    setForm((f) => {
      const profile = data.issuers.find((i) => i.id === issuerId)
      return profile ? { ...f, issuerId, issuer: snapshotIssuer(profile) } : f
    })

  const updateItem = (itemId: string, patch: Partial<InvoiceItem>) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
    }))

  const addItem = () =>
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        { id: newId(), name: '', quantity: 1, unitPrice: 0, taxRate: 10 },
      ],
    }))

  const removeItem = (itemId: string) =>
    setForm((f) => ({
      ...f,
      items: f.items.filter((it) => it.id !== itemId),
    }))

  const handleSave = (status?: QuotationStatus) => {
    const payload: Quotation = {
      ...form,
      status: status ?? form.status,
      honorific: form.honorific ?? '御中',
      businessType: form.businessType ?? '',
    }
    if (isEdit) {
      updateQuotation(payload)
      navigate(`/quotations/${payload.id}`)
    } else {
      const saved = addQuotation(payload)
      navigate(`/quotations/${saved.id}`)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {isEdit ? '見積書を編集' : '見積書を新規作成'}
          </h1>
          {copiedNotice && (
            <div className="mt-1 text-sm text-indigo-600">
              📋 過去の見積書からコピーしました。番号・日付は自動更新済みです。
            </div>
          )}
        </div>
        <Link to="/quotations" className="text-sm text-slate-500 hover:underline">
          ← 一覧へ戻る
        </Link>
      </div>

      <div className="space-y-6">
        {/* 基本情報 */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-800">基本情報</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                請求者（発行元）
              </label>
              <select
                className={inputCls}
                value={form.issuerId}
                onChange={(e) => selectIssuer(e.target.value)}
              >
                {data.issuers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}（{TAX_MODE_LABELS[i.taxMode]}）
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400">
                {form.issuer.taxMode === 'exempt'
                  ? 'この請求者は非課税枠のため、消費税は計算されません。'
                  : '課税枠：税率ごとに消費税を自動計算します。'}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">見積書番号</label>
              <input
                className={inputCls}
                value={form.quotationNumber}
                onChange={(e) => set('quotationNumber', e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">ステータス</label>
              <select
                className={inputCls}
                value={form.status}
                onChange={(e) => set('status', e.target.value as QuotationStatus)}
              >
                {Object.entries(QUOTATION_STATUS_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">発行日</label>
              <input
                type="date"
                className={inputCls}
                value={form.issueDate}
                onChange={(e) => set('issueDate', e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">有効期限</label>
              <input
                type="date"
                className={inputCls}
                value={form.validUntil}
                onChange={(e) => set('validUntil', e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">提出先（顧客）</label>
              <select
                className={inputCls}
                value={form.customerId}
                onChange={(e) => set('customerId', e.target.value)}
              >
                <option value="">— 顧客を選択 —</option>
                {data.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}（{c.contactName}）
                  </option>
                ))}
              </select>
              {data.customers.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  顧客が未登録です。<Link to="/customers" className="underline">顧客一覧</Link>から登録してください。
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">敬称</label>
              <select
                className={inputCls}
                value={form.honorific ?? '御中'}
                onChange={(e) => set('honorific', e.target.value as Honorific)}
              >
                <option value="御中">御中</option>
                <option value="様">様</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                事業種別（売上分析用）
              </label>
              <div className="flex gap-2">
                <select
                  className={inputCls}
                  value={form.businessType ?? ''}
                  onChange={(e) => set('businessType', e.target.value)}
                >
                  <option value="">— 未分類 —</option>
                  {data.businessTypes.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                  {form.businessType && !data.businessTypes.includes(form.businessType) && (
                    <option value={form.businessType}>{form.businessType}</option>
                  )}
                </select>
                {isOwner && (
                  <button
                    type="button"
                    onClick={addAndSelectBusinessType}
                    className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    ＋追加
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 明細 */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">明細</h2>
            <button
              onClick={addItem}
              className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
            >
              ＋ 明細を追加
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="pb-2">品目名</th>
                  <th className="pb-2 w-20 text-right">数量</th>
                  <th className="pb-2 w-32 text-right">単価</th>
                  <th className="pb-2 w-28">区分</th>
                  <th className="pb-2 w-32 text-right">金額</th>
                  <th className="pb-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((it) => (
                  <tr key={it.id}>
                    <td className="py-1 pr-2">
                      <input
                        className={inputCls}
                        placeholder="品目名"
                        value={it.name}
                        onChange={(e) => updateItem(it.id, { name: e.target.value })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="number"
                        min={0}
                        className={`${inputCls} text-right`}
                        value={it.quantity}
                        onChange={(e) => updateItem(it.id, { quantity: Number(e.target.value) })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="number"
                        className={`${inputCls} text-right`}
                        value={it.unitPrice}
                        onChange={(e) => updateItem(it.id, { unitPrice: Number(e.target.value) })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <select
                        className={inputCls}
                        value={itemCategory(it)}
                        onChange={(e) =>
                          updateItem(it.id, categoryPatch(e.target.value as ItemCategory))
                        }
                      >
                        <option value="10">10%</option>
                        <option value="8">8%</option>
                        <option value="incl">税込</option>
                        <option value="none">なし</option>
                        <option value="reimb">立替金</option>
                      </select>
                    </td>
                    <td className="py-1 pr-2 text-right font-medium text-slate-700">
                      {yen(lineNet(it))}
                    </td>
                    <td className="py-1 text-center">
                      <button
                        onClick={() => removeItem(it.id)}
                        disabled={form.items.length === 1}
                        className="rounded px-2 py-1 text-red-500 transition hover:bg-red-50 disabled:opacity-30"
                        title="削除"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 集計（インボイス制度：税率ごと） */}
          <div className="mt-5 flex justify-end">
            <div className="w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>小計（税抜）</span>
                <span>{yen(totals.subtotal)}</span>
              </div>
              {form.issuer.taxMode === 'exempt' ? (
                <div className="flex justify-between text-slate-500">
                  <span>消費税</span>
                  <span>非課税</span>
                </div>
              ) : (
                <>
                  {totals.netByRate[10] > 0 && (
                    <div className="flex justify-between text-slate-500">
                      <span>10%対象 {yen(totals.netByRate[10])} の消費税</span>
                      <span>{yen(totals.taxByRate[10])}</span>
                    </div>
                  )}
                  {totals.netByRate[8] > 0 && (
                    <div className="flex justify-between text-slate-500">
                      <span>8%対象 {yen(totals.netByRate[8])} の消費税</span>
                      <span>{yen(totals.taxByRate[8])}</span>
                    </div>
                  )}
                </>
              )}
              {totals.inclTotal > 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>税込入力分</span>
                  <span>{yen(totals.inclTotal)}</span>
                </div>
              )}
              {totals.reimbursementTotal > 0 && (
                <>
                  <div className="flex justify-between border-t border-slate-100 pt-1.5 text-slate-600">
                    <span>立替金を除く金額</span>
                    <span>{yen(totals.revenue)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>立替金</span>
                    <span>{yen(totals.reimbursementTotal)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-800">
                <span>{form.issuer.taxMode === 'exempt' ? '合計' : '合計（税込）'}</span>
                <span>{yen(totals.total)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* 備考 */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="mb-1 block text-xs font-medium text-slate-500">備考</label>
          <textarea
            className={inputCls}
            rows={3}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </section>

        {/* 操作ボタン */}
        <div className="flex flex-wrap justify-end gap-3">
          <button
            onClick={() => handleSave('draft')}
            className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            下書き保存
          </button>
          <button
            onClick={() => handleSave('sent')}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
          >
            {isEdit ? '保存する' : '提示して保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
