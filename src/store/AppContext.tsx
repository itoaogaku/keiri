import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AppData, Customer, Invoice, IssuerProfile } from '../types'
import { loadData, saveData } from '../lib/storage'
import { newId } from '../lib/invoice'
import { checkSync, fetchState, remote } from '../lib/api'

interface AppContextValue {
  data: AppData
  /** スプレッドシート連携が有効か（サーバー起動＋認証設定時に true） */
  syncEnabled: boolean
  // 請求書
  getInvoice: (id: string) => Invoice | undefined
  addInvoice: (inv: Invoice) => Invoice
  updateInvoice: (inv: Invoice) => void
  deleteInvoice: (id: string) => void
  // 顧客
  getCustomer: (id: string) => Customer | undefined
  addCustomer: (c: Omit<Customer, 'id'>) => Customer
  updateCustomer: (c: Customer) => void
  deleteCustomer: (id: string) => void
  // 請求者
  getIssuer: (id: string) => IssuerProfile | undefined
  addIssuer: (i: Omit<IssuerProfile, 'id'>) => IssuerProfile
  updateIssuer: (i: IssuerProfile) => void
  deleteIssuer: (id: string) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData())
  const [syncEnabled, setSyncEnabled] = useState(false)

  // コールバック内から最新値を参照するための ref
  const dataRef = useRef(data)
  const syncRef = useRef(false)
  useEffect(() => {
    dataRef.current = data
  }, [data])

  // localStorage への即時キャッシュ（常に）
  useEffect(() => {
    saveData(data)
  }, [data])

  // 起動時：スプレッドシート連携が有効ならリモート状態を取り込む（顧客・請求書）。
  // 請求者(issuers)はクライアント設定として保持する。
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const on = await checkSync()
      if (cancelled) return
      syncRef.current = on
      setSyncEnabled(on)
      if (!on) return
      try {
        const remoteState = await fetchState()
        if (cancelled) return
        setData((d) => ({
          ...d,
          customers: remoteState.customers,
          invoices: remoteState.invoices,
        }))
      } catch (e) {
        console.warn(
          '[keiri] スプレッドシートからの読み込みに失敗しました。localStorage を使用します。',
          e
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // スプレッドシートへの best-effort 書き込み（失敗しても UI は継続）
  const push = (fn: () => Promise<unknown>) => {
    if (!syncRef.current) return
    fn().catch((e) => console.warn('[keiri] スプレッドシート同期に失敗しました', e))
  }

  const customerName = (customerId: string) =>
    dataRef.current.customers.find((c) => c.id === customerId)?.companyName ?? ''

  const getInvoice = useCallback(
    (id: string) => data.invoices.find((i) => i.id === id),
    [data.invoices]
  )

  const addInvoice = useCallback((inv: Invoice): Invoice => {
    const saved: Invoice = {
      ...inv,
      id: inv.id || newId(),
      updatedAt: new Date().toISOString(),
    }
    setData((d) => ({ ...d, invoices: [saved, ...d.invoices] }))
    push(() => remote.saveInvoice(saved, customerName(saved.customerId)))
    return saved
  }, [])

  const updateInvoice = useCallback((inv: Invoice) => {
    const saved: Invoice = { ...inv, updatedAt: new Date().toISOString() }
    setData((d) => ({
      ...d,
      invoices: d.invoices.map((i) => (i.id === saved.id ? saved : i)),
    }))
    push(() => remote.saveInvoice(saved, customerName(saved.customerId)))
  }, [])

  const deleteInvoice = useCallback((id: string) => {
    setData((d) => ({ ...d, invoices: d.invoices.filter((i) => i.id !== id) }))
    push(() => remote.deleteInvoice(id))
  }, [])

  const getCustomer = useCallback(
    (id: string) => data.customers.find((c) => c.id === id),
    [data.customers]
  )

  const addCustomer = useCallback((c: Omit<Customer, 'id'>): Customer => {
    const saved: Customer = { ...c, id: newId() }
    setData((d) => ({ ...d, customers: [...d.customers, saved] }))
    push(() => remote.saveCustomer(saved))
    return saved
  }, [])

  const updateCustomer = useCallback((c: Customer) => {
    setData((d) => ({
      ...d,
      customers: d.customers.map((x) => (x.id === c.id ? c : x)),
    }))
    push(() => remote.saveCustomer(c))
  }, [])

  const deleteCustomer = useCallback((id: string) => {
    setData((d) => ({ ...d, customers: d.customers.filter((c) => c.id !== id) }))
    push(() => remote.deleteCustomer(id))
  }, [])

  const getIssuer = useCallback(
    (id: string) => data.issuers.find((i) => i.id === id),
    [data.issuers]
  )

  const addIssuer = useCallback((i: Omit<IssuerProfile, 'id'>): IssuerProfile => {
    const saved: IssuerProfile = { ...i, id: newId() }
    setData((d) => ({ ...d, issuers: [...d.issuers, saved] }))
    return saved
  }, [])

  const updateIssuer = useCallback((issuer: IssuerProfile) => {
    setData((d) => ({
      ...d,
      issuers: d.issuers.map((x) => (x.id === issuer.id ? issuer : x)),
    }))
  }, [])

  const deleteIssuer = useCallback((id: string) => {
    setData((d) => ({ ...d, issuers: d.issuers.filter((i) => i.id !== id) }))
  }, [])

  const value = useMemo<AppContextValue>(
    () => ({
      data,
      syncEnabled,
      getInvoice,
      addInvoice,
      updateInvoice,
      deleteInvoice,
      getCustomer,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      getIssuer,
      addIssuer,
      updateIssuer,
      deleteIssuer,
    }),
    [
      data,
      syncEnabled,
      getInvoice,
      addInvoice,
      updateInvoice,
      deleteInvoice,
      getCustomer,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      getIssuer,
      addIssuer,
      updateIssuer,
      deleteIssuer,
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
