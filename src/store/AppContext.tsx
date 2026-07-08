import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AppData, Customer, Invoice, IssuerInfo } from '../types'
import { loadData, saveData } from '../lib/storage'
import { newId } from '../lib/invoice'

interface AppContextValue {
  data: AppData
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
  // 請求元
  updateIssuer: (issuer: IssuerInfo) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData())

  useEffect(() => {
    saveData(data)
  }, [data])

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
    return saved
  }, [])

  const updateInvoice = useCallback((inv: Invoice) => {
    setData((d) => ({
      ...d,
      invoices: d.invoices.map((i) =>
        i.id === inv.id ? { ...inv, updatedAt: new Date().toISOString() } : i
      ),
    }))
  }, [])

  const deleteInvoice = useCallback((id: string) => {
    setData((d) => ({ ...d, invoices: d.invoices.filter((i) => i.id !== id) }))
  }, [])

  const getCustomer = useCallback(
    (id: string) => data.customers.find((c) => c.id === id),
    [data.customers]
  )

  const addCustomer = useCallback((c: Omit<Customer, 'id'>): Customer => {
    const saved: Customer = { ...c, id: newId() }
    setData((d) => ({ ...d, customers: [...d.customers, saved] }))
    return saved
  }, [])

  const updateCustomer = useCallback((c: Customer) => {
    setData((d) => ({
      ...d,
      customers: d.customers.map((x) => (x.id === c.id ? c : x)),
    }))
  }, [])

  const deleteCustomer = useCallback((id: string) => {
    setData((d) => ({ ...d, customers: d.customers.filter((c) => c.id !== id) }))
  }, [])

  const updateIssuer = useCallback((issuer: IssuerInfo) => {
    setData((d) => ({ ...d, issuer }))
  }, [])

  const value = useMemo<AppContextValue>(
    () => ({
      data,
      getInvoice,
      addInvoice,
      updateInvoice,
      deleteInvoice,
      getCustomer,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      updateIssuer,
    }),
    [
      data,
      getInvoice,
      addInvoice,
      updateInvoice,
      deleteInvoice,
      getCustomer,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      updateIssuer,
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
