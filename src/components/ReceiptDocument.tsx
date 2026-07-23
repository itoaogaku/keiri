import { yen, jpDate } from '../lib/format'

export interface ReceiptTaxLine {
  label: string // 例：10%対象
  net: number
  tax: number
}

export interface ReceiptData {
  receiptNo: string
  receiptDate: string // YYYY-MM-DD
  recipientName: string
  honorific: string
  note: string
  issuerName: string
  issuerAddress?: string
  issuerTel?: string
  issuerRegistrationNumber?: string
  seal?: string | null
  subtotal: number
  taxTotal: number
  total: number
  exempt: boolean
  taxLines: ReceiptTaxLine[]
}

/** A4 領収書のプレビュー／印刷本体（請求書発行・単独発行で共用） */
export default function ReceiptDocument({ data }: { data: ReceiptData }) {
  const needStamp = data.total >= 50000

  return (
    <div className="print-area mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-10 shadow-sm">
      <div className="flex items-start justify-between">
        <h1 className="text-3xl font-bold tracking-widest text-slate-800">領収書</h1>
        <div className="text-right text-sm text-slate-600">
          <div>領収日：{jpDate(data.receiptDate)}</div>
          {data.receiptNo && <div>No. {data.receiptNo}</div>}
        </div>
      </div>

      {/* 宛名 */}
      <div className="mt-8 max-w-md">
        <div className="border-b-2 border-slate-800 pb-1 text-xl font-semibold text-slate-800">
          {data.recipientName || '（宛名未設定）'} {data.honorific}
        </div>
      </div>

      {/* 金額 */}
      <div className="mt-8 flex items-center gap-4">
        <span className="text-lg text-slate-600">金額</span>
        <span className="rounded-lg border-2 border-slate-800 px-6 py-2 text-3xl font-bold tracking-wider text-slate-800">
          {yen(data.total)}
        </span>
        <span className="text-sm text-slate-500">（税込）</span>
      </div>

      <div className="mt-4 text-sm text-slate-700">但し {data.note}</div>
      <div className="mt-1 text-sm text-slate-700">上記正に領収いたしました。</div>

      {/* 収入印紙欄 ＋ 内訳 */}
      <div className="mt-6 flex justify-between">
        <div className="flex items-end">
          {needStamp && (
            <div className="flex h-24 w-24 items-center justify-center rounded border border-dashed border-slate-400 text-center text-xs text-slate-400">
              収入印紙
            </div>
          )}
        </div>

        <div className="w-72 space-y-1.5 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>{data.exempt ? '税抜金額' : '小計（税抜）'}</span>
            <span>{yen(data.subtotal)}</span>
          </div>
          {data.exempt ? (
            <div className="flex justify-between text-slate-500">
              <span>消費税</span>
              <span>非課税</span>
            </div>
          ) : (
            <>
              {data.taxLines.map((l) => (
                <div key={l.label} className="flex justify-between text-slate-500">
                  <span>
                    {l.label} {yen(l.net)}
                  </span>
                  <span>消費税 {yen(l.tax)}</span>
                </div>
              ))}
              <div className="flex justify-between text-slate-600">
                <span>消費税合計</span>
                <span>{yen(data.taxTotal)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between border-t-2 border-slate-300 pt-2 text-base font-bold text-slate-800">
            <span>合計</span>
            <span>{yen(data.total)}</span>
          </div>
        </div>
      </div>

      {/* 請求元（発行者） */}
      <div className="mt-10 flex justify-end">
        <div className="relative text-sm text-slate-600">
          {data.seal && (
            <img
              src={data.seal}
              alt="角印"
              className="pointer-events-none absolute right-0 top-2 h-20 w-20 object-contain"
              style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
            />
          )}
          <div className="font-semibold text-slate-800">{data.issuerName}</div>
          {data.issuerAddress && <div className="whitespace-nowrap">{data.issuerAddress}</div>}
          {data.issuerTel && <div>TEL: {data.issuerTel}</div>}
          {data.issuerRegistrationNumber && (
            <div className="mt-2 text-slate-500">登録番号：{data.issuerRegistrationNumber}</div>
          )}
        </div>
      </div>
    </div>
  )
}
