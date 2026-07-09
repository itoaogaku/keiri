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
import type { AppData, Customer, Invoice, IssuerProfile, Session } from '../types'
import { loadData, saveData } from '../lib/storage'
import { newId } from '../lib/invoice'
import {
  getGasUrl,
  setGasUrl as persistGasUrl,
  fetchState,
  login as gasLogin,
  remote,
  type Auth,
} from '../lib/gas'

const SESSION_KEY = 'keiri.session'

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

interface AppContextValue {
  data: AppData
  /** スプレッドシート連携が有効か（GAS URL 設定＋接続成功時に true） */
  syncEnabled: boolean
  /** 設定中の GAS ウェブアプリ URL */
  gasUrl: string
  /** GAS URL を設定・保存して再接続する */
  setGasUrl: (url: string) => void
  // 認証
  session: Session | null
  /** GAS連携中でログインが必要な状態か */
  needsLogin: boolean
  login: (email: string, pin: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
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
  // 事業種別
  addBusinessType: (name: string) => void
  removeBusinessType: (name: string) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData())
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [gasUrl, setGasUrlState] = useState<string>(() => getGasUrl())
  const [session, setSession] = useState<Session | null>(() => loadSession())

  // コールバック内から最新値を参照するための ref
  const dataRef = useRef(data)
  const gasRef = useRef(gasUrl)
  const sessionRef = useRef(session)
  useEffect(() => {
    dataRef.current = data
  }, [data])
  useEffect(() => {
    gasRef.current = gasUrl
  }, [gasUrl])
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  // GAS未設定なら誰でも利用可（ローカル単独）。設定済みならログイン必須。
  const needsLogin = Boolean(gasUrl) && !session

  // localStorage への即時キャッシュ（常に）
  useEffect(() => {
    saveData(data)
  }, [data])

  const doLogout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setSession(null)
    setSyncEnabled(false)
    // 表示中の他ユーザーデータを消去（設定は残す）
    setData((d) => ({ ...d, customers: [], invoices: [] }))
  }, [])

  // GAS連携中かつログイン済みなら、権限に応じたデータを取り込む
  useEffect(() => {
    let cancelled = false
    if (!gasUrl || !session) {
      setSyncEnabled(false)
      return
    }
    ;(async () => {
      try {
        const remoteState = await fetchState(gasUrl, {
          email: session.email,
          pin: session.pin,
        })
        if (cancelled) return
        setData((d) => ({
          ...d,
          customers: remoteState.customers,
          invoices: remoteState.invoices,
        }))
        setSyncEnabled(true)
      } catch (e) {
        if (cancelled) return
        setSyncEnabled(false)
        console.warn('[keiri] スプレッドシートからの読み込みに失敗しました。', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [gasUrl, session])

  const setGasUrl = useCallback((url: string) => {
    persistGasUrl(url)
    setGasUrlState(url.trim())
  }, [])

  const login = useCallback(
    async (email: string, pin: string): Promise<{ ok: boolean; error?: string }> => {
      const url = gasRef.current
      if (!url) return { ok: false, error: '先にスプレッドシート連携を設定してください' }
      try {
        const res = await gasLogin(url, email.trim(), pin.trim())
        if (!res.ok || !res.user) {
          return { ok: false, error: res.error || 'ログインに失敗しました' }
        }
        const s: Session = {
          email: res.user.email,
          name: res.user.name,
          role: res.user.role,
          pin: pin.trim(),
        }
        localStorage.setItem(SESSION_KEY, JSON.stringify(s))
        setSession(s)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: '接続に失敗しました（URLをご確認ください）' }
      }
    },
    []
  )

  // スプレッドシートへの best-effort 書き込み（失敗しても UI は継続）
  const push = (fn: (url: string, auth: Auth) => Promise<unknown>) => {
    const url = gasRef.current
    const s = sessionRef.current
    if (!url || !s) return
    fn(url, { email: s.email, pin: s.pin }).catch((e) =>
      console.warn('[keiri] スプレッドシート同期に失敗しました', e)
    )
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
    push((url, auth) => remote.saveInvoice(url, auth, saved, customerName(saved.customerId)))
    return saved
  }, [])

  const updateInvoice = useCallback((inv: Invoice) => {
    const saved: Invoice = { ...inv, updatedAt: new Date().toISOString() }
    setData((d) => ({
      ...d,
      invoices: d.invoices.map((i) => (i.id === saved.id ? saved : i)),
    }))
    push((url, auth) => remote.saveInvoice(url, auth, saved, customerName(saved.customerId)))
  }, [])

  const deleteInvoice = useCallback((id: string) => {
    setData((d) => ({ ...d, invoices: d.invoices.filter((i) => i.id !== id) }))
    push((url, auth) => remote.deleteInvoice(url, auth, id))
  }, [])

  const getCustomer = useCallback(
    (id: string) => data.customers.find((c) => c.id === id),
    [data.customers]
  )

  const addCustomer = useCallback((c: Omit<Customer, 'id'>): Customer => {
    const saved: Customer = { ...c, id: newId() }
    setData((d) => ({ ...d, customers: [...d.customers, saved] }))
    push((url, auth) => remote.saveCustomer(url, auth, saved))
    return saved
  }, [])

  const updateCustomer = useCallback((c: Customer) => {
    setData((d) => ({
      ...d,
      customers: d.customers.map((x) => (x.id === c.id ? c : x)),
    }))
    push((url, auth) => remote.saveCustomer(url, auth, c))
  }, [])

  const deleteCustomer = useCallback((id: string) => {
    setData((d) => ({ ...d, customers: d.customers.filter((c) => c.id !== id) }))
    push((url, auth) => remote.deleteCustomer(url, auth, id))
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

  const addBusinessType = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setData((d) =>
      d.businessTypes.includes(trimmed)
        ? d
        : { ...d, businessTypes: [...d.businessTypes, trimmed] }
    )
  }, [])

  const removeBusinessType = useCallback((name: string) => {
    setData((d) => ({
      ...d,
      businessTypes: d.businessTypes.filter((b) => b !== name),
    }))
  }, [])

  const value = useMemo<AppContextValue>(
    () => ({
      data,
      syncEnabled,
      gasUrl,
      setGasUrl,
      session,
      needsLogin,
      login,
      logout: doLogout,
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
      addBusinessType,
      removeBusinessType,
    }),
    [
      data,
      syncEnabled,
      gasUrl,
      setGasUrl,
      session,
      needsLogin,
      login,
      doLogout,
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
      addBusinessType,
      removeBusinessType,
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
