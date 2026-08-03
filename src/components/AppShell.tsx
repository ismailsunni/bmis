import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3, Users, HandCoins, HeartHandshake, FolderKanban, Wallet,
  FileSpreadsheet, ScrollText, UserCog, Settings, LogOut, Menu, X, CheckCircle2,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { can } from '@/auth/permissions'
import { roleLabels } from '@/lib/labels'
import { cn } from '@/lib/cn'
import type { UserRole } from '@/types/db'

interface NavItem {
  to: string
  label: string
  icon: typeof BarChart3
  allow?: (r: UserRole) => boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dasbor', icon: BarChart3 },
  { to: '/donasi', label: 'Donasi', icon: HandCoins },
  { to: '/verifikasi', label: 'Verifikasi', icon: CheckCircle2, allow: can.verifyDonation },
  { to: '/donatur', label: 'Donatur', icon: Users, allow: can.readDonorPII },
  { to: '/mustahik', label: 'Mustahik', icon: HeartHandshake, allow: can.readDonorPII },
  { to: '/penyaluran', label: 'Penyaluran', icon: HeartHandshake },
  { to: '/program', label: 'Program', icon: FolderKanban },
  { to: '/rekening', label: 'Kas & Bank', icon: Wallet, allow: can.manageAccounts },
  { to: '/laporan', label: 'Laporan', icon: FileSpreadsheet },
  { to: '/audit', label: 'Log Audit', icon: ScrollText, allow: can.readAuditLog },
  { to: '/pengguna', label: 'Pengguna', icon: UserCog, allow: can.manageUsers },
  { to: '/pengaturan', label: 'Pengaturan', icon: Settings, allow: can.manageUsers },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { role, user, signOut, roleClaimMissing } = useAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const items = NAV.filter((i) => !i.allow || i.allow(role))

  const nav = (
    <nav className="space-y-0.5">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={() => setOpen(false)}
          className={({ isActive }) => cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
            isActive
              ? 'bg-brand-700 text-white'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
          )}
        >
          <Icon size={18} aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen lg:flex">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden dark:border-slate-700 dark:bg-slate-800 no-print">
        <span className="font-semibold text-brand-800 dark:text-brand-300">BMIS</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300"
          aria-label={open ? 'Tutup menu' : 'Buka menu'}
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      <aside className={cn(
        'no-print border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800',
        'lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-r',
        open ? 'block border-b' : 'hidden lg:block',
      )}>
        <div className="mb-4 hidden px-2 lg:block">
          <p className="text-lg font-bold text-brand-800 dark:text-brand-300">BMIS</p>
          <p className="text-xs text-slate-500">Sistem Informasi Baitul Maal</p>
        </div>

        {nav}

        <div className="mt-4 border-t border-slate-200 px-2 pt-3 dark:border-slate-700">
          <p className="truncate text-sm font-medium">{user?.email}</p>
          <p className="mb-2 text-xs text-slate-500">{roleLabels[role]}</p>
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-red-600 dark:text-slate-300"
          >
            <LogOut size={16} aria-hidden /> Keluar
          </button>
        </div>
      </aside>

      <main key={location.pathname} className="min-w-0 flex-1 p-4 lg:p-6">
        {/* Without the claim, RLS applies viewer to every query no matter what
            this UI renders, so say so rather than showing a half-working app. */}
        {roleClaimMissing && (
          <div role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/25 dark:text-amber-100">
            <p className="font-semibold">Peran tidak terbaca dari sesi</p>
            <p className="mt-0.5">
              Token masuk tidak memuat <code>app_metadata.user_role</code>, sehingga basis
              data memperlakukan Anda sebagai <strong>Relawan</strong> dan sebagian besar
              data akan tampak kosong. Aktifkan <em>Custom Access Token hook</em> ke fungsi{' '}
              <code>public.custom_access_token_hook</code> pada pengaturan Auth, lalu keluar
              dan masuk kembali.
            </p>
          </div>
        )}
        {children}
      </main>
    </div>
  )
}

export function PageHeader({
  title, subtitle, action,
}: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="no-print flex gap-2">{action}</div>}
    </div>
  )
}
