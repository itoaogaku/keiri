import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import InvoiceList from './pages/InvoiceList'
import InvoiceForm from './pages/InvoiceForm'
import InvoiceDetail from './pages/InvoiceDetail'
import CustomerList from './pages/CustomerList'
import Settings from './pages/Settings'
import Login from './pages/Login'
import { useApp } from './store/AppContext'

export default function App() {
  const { needsLogin } = useApp()
  if (needsLogin) return <Login />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/invoices" element={<InvoiceList />} />
        <Route path="/invoices/new" element={<InvoiceForm />} />
        <Route path="/invoices/:id" element={<InvoiceDetail />} />
        <Route path="/invoices/:id/edit" element={<InvoiceForm />} />
        <Route path="/customers" element={<CustomerList />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
