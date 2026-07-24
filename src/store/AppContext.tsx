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
import type { AppData, Customer, Invoice, IssuerProfile, Receipt, Session } from '../types'
import { loadData, saveData } from '../lib/storage'
import { newId } from '../lib/invoice'
import {
  getGasUrl,
  setGasUrl as persistGasUrl,
  fetchState,
  login as gasLogin,
  saveConfig as gasSaveConfig,
  nextInvoiceNumber as gasNextInvoiceNumber,
  nextReceiptNumber as gasNextReceiptNumber,
  mergeCustomers as gasMergeCustomers,
  remote,
  type Auth,
} from '../lib/gas'
import { compactDate } from '../lib/format'

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
  // 顧客（全アカウント共有台帳）
  getCustomer: (id: string) => Customer | undefined
  addCustomer: (c: Omit<Customer, 'id'>) => Customer
  updateCustomer: (c: Customer) => void
  deleteCustomer: (id: string) => void
  /** 同名の重複顧客を1件に統合する（オーナーのみ・同期時のみ）。統合後は最新データを再取得する */
  mergeDuplicateCustomers: () => Promise<number | null>
  // 請求者
  getIssuer: (id: string) => IssuerProfile | undefined
  addIssuer: (i: Omit<IssuerProfile, 'id'>) => IssuerProfile
  updateIssuer: (i: IssuerProfile) => void
  deleteIssuer: (id: string) => void
  // 事業種別
  addBusinessType: (name: string) => void
  removeBusinessType: (name: string) => void
  // 全請求書を対象にした次番号の採番（同期時のみ。未同期は null）
  fetchNextInvoiceNumber: (base?: Date) => Promise<string | null>
  // 領収書（台帳）
  getReceipt: (id: string) => Receipt | undefined
  addReceipt: (r: Receipt) => Receipt
  updateReceipt: (r: Receipt) => void
  deleteReceipt: (id: string) => void
  // 全領収書を対象にした次番号の採番（同期時のみ。未同期は null）
  fetchNextReceiptNumber: (base?: Date) => Promise<string | null>
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
    setData((d) => ({ ...d, customers: [], invoices: [], receipts: [] }))
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
        // 共有設定（請求者・事業種別）はリモート優先。未初期化ならローカルを採用
        const localIssuers = dataRef.current.issuers
        const localBiz = dataRef.current.businessTypes
        const issuers = remoteState.issuers.length ? remoteState.issuers : localIssuers
        const businessTypes = remoteState.businessTypes.length
          ? remoteState.businessTypes
          : localBiz
        setData((d) => ({
          ...d,
          customers: remoteState.customers,
          invoices: remoteState.invoices,
          receipts: remoteState.receipts,
          issuers,
          businessTypes,
        }))
        setSyncEnabled(true)
        // リモート未初期化かつオーナーなら、ローカル設定で初期化する
        if (
          session.role === 'owner' &&
          (!remoteState.issuers.length || !remoteState.businessTypes.length)
        ) {
          pushConfig(issuers, businessTypes)
        }
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

  // 共有設定（請求者・事業種別）をスプレッドシートへ保存（オーナーのみ有効）
  const pushConfig = (issuers: IssuerProfile[], businessTypes: string[]) => {
    push((url, auth) => gasSaveConfig(url, auth, { issuers, businessTypes }))
  }

  // 全請求書を対象に次の請求書番号を採番（同期時のみ）
  const fetchNextInvoiceNumber = useCallback(
    async (base: Date = new Date()): Promise<string | null> => {
      const url = gasRef.current
      const s = sessionRef.current
      if (!url || !s) return null
      try {
        return await gasNextInvoiceNumber(
          url,
          { email: s.email, pin: s.pin },
          compactDate(base)
        )
      } catch {
        return null
      }
    },
    []
  )

  // 全領収書を対象に次の領収書番号を採番（同期時のみ）
  const fetchNextReceiptNumber = useCallback(
    async (base: Date = new Date()): Promise<string | null> => {
      const url = gasRef.current
      const s = sessionRef.current
      if (!url || !s) return null
      try {
        return await gasNextReceiptNumber(
          url,
          { email: s.email, pin: s.pin },
          compactDate(base)
        )
      } catch {
        return null
      }
    },
    []
  )

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

  // 顧客は全アカウント共有の台帳。GAS側が企業名の重複を検出した場合、
  // 新規idではなく既存の顧客idへ統合して書き込むため、
  // 返ってきたidが異なれば手元のidをそちらへ差し替える（自分の請求書の
  // 参照も含めて）。これにより同じ会社が2件に増えるのを防ぐ。
  const reconcileCustomerId = (localId: string, canonicalId?: string) => {
    if (!canonicalId || canonicalId === localId) return
    setData((d) => ({
      ...d,
      customers: d.customers.map((x) => (x.id === localId ? { ...x, id: canonicalId } : x)),
      invoices: d.invoices.map((inv) =>
        inv.customerId === localId ? { ...inv, customerId: canonicalId } : inv
      ),
    }))
  }

  const addCustomer = useCallback((c: Omit<Customer, 'id'>): Customer => {
    const saved: Customer = { ...c, id: newId() }
    setData((d) => ({ ...d, customers: [...d.customers, saved] }))
    const url = gasRef.current
    const s = sessionRef.current
    if (url && s) {
      remote
        .saveCustomer(url, { email: s.email, pin: s.pin }, saved)
        .then((res) => reconcileCustomerId(saved.id, res?.id))
        .catch((e) => console.warn('[keiri] スプレッドシート同期に失敗しました', e))
    }
    return saved
  }, [])

  const updateCustomer = useCallback((c: Customer) => {
    setData((d) => ({
      ...d,
      customers: d.customers.map((x) => (x.id === c.id ? c : x)),
    }))
    const url = gasRef.current
    const s = sessionRef.current
    if (url && s) {
      remote
        .saveCustomer(url, { email: s.email, pin: s.pin }, c)
        .then((res) => reconcileCustomerId(c.id, res?.id))
        .catch((e) => console.warn('[keiri] スプレッドシート同期に失敗しました', e))
    }
  }, [])

  const deleteCustomer = useCallback((id: string) => {
    setData((d) => ({ ...d, customers: d.customers.filter((c) => c.id !== id) }))
    push((url, auth) => remote.deleteCustomer(url, auth, id))
  }, [])

  // GASから最新の顧客・請求書・領収書・共有設定を再取得する
  const refreshFromServer = useCallback(async () => {
    const url = gasRef.current
    const s = sessionRef.current
    if (!url || !s) return
    try {
      const remoteState = await fetchState(url, { email: s.email, pin: s.pin })
      const localIssuers = dataRef.current.issuers
      const localBiz = dataRef.current.businessTypes
      const issuers = remoteState.issuers.length ? remoteState.issuers : localIssuers
      const businessTypes = remoteState.businessTypes.length
        ? remoteState.businessTypes
        : localBiz
      setData((d) => ({
        ...d,
        customers: remoteState.customers,
        invoices: remoteState.invoices,
        receipts: remoteState.receipts,
        issuers,
        businessTypes,
      }))
    } catch (e) {
      console.warn('[keiri] 再取得に失敗しました', e)
    }
  }, [])

  // 同名の重複顧客をGAS側で統合し、最新データを再取得する（オーナーのみ）
  const mergeDuplicateCustomers = useCallback(async (): Promise<number | null> => {
    const url = gasRef.current
    const s = sessionRef.current
    if (!url || !s) return null
    try {
      const merged = await gasMergeCustomers(url, { email: s.email, pin: s.pin })
      if (merged > 0) await refreshFromServer()
      return merged
    } catch (e) {
      console.warn('[keiri] 重複統合に失敗しました', e)
      return null
    }
  }, [refreshFromServer])

  const getIssuer = useCallback(
    (id: string) => data.issuers.find((i) => i.id === id),
    [data.issuers]
  )

  const addIssuer = useCallback((i: Omit<IssuerProfile, 'id'>): IssuerProfile => {
    const saved: IssuerProfile = { ...i, id: newId() }
    const issuers = [...dataRef.current.issuers, saved]
    setData((d) => ({ ...d, issuers }))
    pushConfig(issuers, dataRef.current.businessTypes)
    return saved
  }, [])

  const updateIssuer = useCallback((issuer: IssuerProfile) => {
    const issuers = dataRef.current.issuers.map((x) => (x.id === issuer.id ? issuer : x))
    setData((d) => ({ ...d, issuers }))
    pushConfig(issuers, dataRef.current.businessTypes)
  }, [])

  const deleteIssuer = useCallback((id: string) => {
    const issuers = dataRef.current.issuers.filter((i) => i.id !== id)
    setData((d) => ({ ...d, issuers }))
    pushConfig(issuers, dataRef.current.businessTypes)
  }, [])

  const addBusinessType = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed || dataRef.current.businessTypes.includes(trimmed)) return
    const businessTypes = [...dataRef.current.businessTypes, trimmed]
    setData((d) => ({ ...d, businessTypes }))
    pushConfig(dataRef.current.issuers, businessTypes)
  }, [])

  const removeBusinessType = useCallback((name: string) => {
    const businessTypes = dataRef.current.businessTypes.filter((b) => b !== name)
    setData((d) => ({ ...d, businessTypes }))
    pushConfig(dataRef.current.issuers, businessTypes)
  }, [])

  const getReceipt = useCallback(
    (id: string) => data.receipts.find((r) => r.id === id),
    [data.receipts]
  )

  const addReceipt = useCallback((r: Receipt): Receipt => {
    const saved: Receipt = { ...r, id: r.id || newId(), updatedAt: new Date().toISOString() }
    setData((d) => ({ ...d, receipts: [saved, ...d.receipts] }))
    push((url, auth) => remote.saveReceipt(url, auth, saved))
    return saved
  }, [])

  const updateReceipt = useCallback((r: Receipt) => {
    const saved: Receipt = { ...r, updatedAt: new Date().toISOString() }
    setData((d) => ({
      ...d,
      receipts: d.receipts.map((x) => (x.id === saved.id ? saved : x)),
    }))
    push((url, auth) => remote.saveReceipt(url, auth, saved))
  }, [])

  const deleteReceipt = useCallback((id: string) => {
    setData((d) => ({ ...d, receipts: d.receipts.filter((r) => r.id !== id) }))
    push((url, auth) => remote.deleteReceipt(url, auth, id))
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
      mergeDuplicateCustomers,
      getIssuer,
      addIssuer,
      updateIssuer,
      deleteIssuer,
      addBusinessType,
      removeBusinessType,
      fetchNextInvoiceNumber,
      getReceipt,
      addReceipt,
      updateReceipt,
      deleteReceipt,
      fetchNextReceiptNumber,
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
      mergeDuplicateCustomers,
      getIssuer,
      addIssuer,
      updateIssuer,
      deleteIssuer,
      addBusinessType,
      removeBusinessType,
      fetchNextInvoiceNumber,
      getReceipt,
      addReceipt,
      updateReceipt,
      deleteReceipt,
      fetchNextReceiptNumber,
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
