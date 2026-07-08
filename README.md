# Keiri — Web版 請求書発行・管理システム

過去のデータをワンクリックで複製して新しい請求書を作れる、効率的な請求書管理アプリです。

## 技術スタック

- React 18 + TypeScript
- Vite
- Tailwind CSS
- 状態管理・永続化：localStorage（`keiri.appdata.v1`）
- PDF出力：ブラウザ印刷（A4最適化・`@media print`）

## セットアップ

```bash
npm install
npm run dev      # 開発サーバ起動（http://localhost:5173）
npm run build    # 本番ビルド
npm run lint     # 型チェック（tsc --noEmit）
```

## 主要機能

| 機能 | 画面 | 説明 |
| --- | --- | --- |
| ダッシュボード | `/` | 今月の売上・未入金・入金済みサマリー＋直近請求書 |
| 請求書一覧 | `/invoices` | 検索・ソート・ステータス絞り込み |
| **過去データのコピー** | 一覧/詳細の「📋 コピー」 | `/invoices/new?copyFrom=<id>` へ遷移し複製ドラフトを生成 |
| 請求書作成・編集 | `/invoices/new`, `/invoices/:id/edit` | 明細の動的追加/削除、税率ごと自動集計 |
| 請求書詳細・PDF | `/invoices/:id` | A4プレビュー、印刷でPDF出力 |
| 顧客管理 | `/customers` | 顧客のCRUD |
| 設定（請求元） | `/settings` | 自社情報・適格請求書発行事業者登録番号 |

## ★ 過去データコピーのデータ処理ロジック

`src/lib/invoice.ts` の `copyInvoice()`：

- **引き継ぐ**：顧客(`customerId`) / 明細(品目・数量・単価・税率) / 備考 / 請求元
- **再生成する**：
  - 請求書番号 `INV-YYYYMMDD-XXX`（当日日付＋連番で自動採番）
  - 発行日 → 当日
  - 支払期限 → 当月末
  - ステータス → 下書き
  - id → 保存時に採番

一覧側ではコピー結果を作らず `?copyFrom=<id>` を渡すだけにし、生成ロジックを
新規作成画面（`InvoiceForm`）に一本化しています。直リンク・リロードでも再現性があります。

## インボイス制度対応

- 請求元に適格請求書発行事業者登録番号の入力欄
- 税率（8% / 10%）ごとに対象額・消費税額を分けて集計・表示（端数は税率区分ごとに丸め）
