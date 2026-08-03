import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/auth/AuthProvider'
import { isConfigured } from '@/lib/supabase'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
      // field connections are unreliable; keep cached data usable offline
      gcTime: 24 * 60 * 60 * 1000,
      networkMode: 'offlineFirst',
    },
  },
})

/** A build without Supabase credentials should say so, not render blank. */
function NotConfigured() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md space-y-2 text-center">
        <h1 className="text-xl font-bold text-brand-800">BMIS belum dikonfigurasi</h1>
        <p className="text-sm text-slate-600">
          <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code> belum
          tersedia saat aplikasi dibangun. Setel keduanya di <code>.env</code> untuk
          pengembangan lokal, atau sebagai secret repositori untuk penerapan.
        </p>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigured ? (
      <QueryClientProvider client={queryClient}>
        {/* basename follows Vite's base so the router works under /<repo>/ */}
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    ) : (
      <NotConfigured />
    )}
  </StrictMode>,
)
