import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { AuthCallback } from '@/auth/AuthCallback'
import { can } from '@/auth/permissions'
import { LoginPage } from '@/features/LoginPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { DonationsPage } from '@/features/donations/DonationsPage'
import { DonationDetailPage } from '@/features/donations/DonationDetailPage'
import { DonationImportPage } from '@/features/donations/DonationImportPage'
import { BulkDonationPage } from '@/features/donations/BulkDonationPage'
import { VerificationQueue } from '@/features/donations/VerificationQueue'
import { DonorsPage } from '@/features/donors/DonorsPage'
import { DonorDetailPage } from '@/features/donors/DonorDetailPage'
import { BeneficiariesPage } from '@/features/beneficiaries/BeneficiariesPage'
import { DistributionsPage } from '@/features/distributions/DistributionsPage'
import { DistributionDetailPage } from '@/features/distributions/DistributionDetailPage'
import { ProgramsPage } from '@/features/programs/ProgramsPage'
import { AccountsPage } from '@/features/accounts/AccountsPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { AuditLogPage } from '@/features/audit/AuditLogPage'
import { UsersPage } from '@/features/users/UsersPage'
import { SettingsPage } from '@/features/settings/SettingsPage'

// The guide ships the markdown renderer with it, so it loads on demand rather
// than weighing down every other page.
const HelpPage = lazy(() =>
  import('@/features/help/HelpPage').then((m) => ({ default: m.HelpPage })),
)

const shell = (element: React.ReactNode, allow?: Parameters<typeof ProtectedRoute>[0]['allow']) => (
  <ProtectedRoute allow={allow}>
    <AppShell>{element}</AppShell>
  </ProtectedRoute>
)

export default function App() {
  return (
    <Routes>
      <Route path="/masuk" element={<LoginPage />} />
      {/* Outside the guards on purpose — a guard here would navigate away
          before the session can be read out of the URL. */}
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/" element={shell(<DashboardPage />)} />
      <Route path="/donasi" element={shell(<DonationsPage />)} />
      <Route path="/donasi/massal" element={shell(<BulkDonationPage />, can.recordDonation)} />
      <Route path="/donasi/impor" element={shell(<DonationImportPage />, can.recordDonation)} />
      {/* after the static /donasi/* routes: react-router ranks a literal
          segment above a dynamic one, so massal and impor still win */}
      <Route path="/donasi/:id" element={shell(<DonationDetailPage />)} />
      <Route path="/verifikasi" element={shell(<VerificationQueue />, can.verifyDonation)} />
      <Route path="/donatur" element={shell(<DonorsPage />, can.readDonorPII)} />
      <Route path="/donatur/:id" element={shell(<DonorDetailPage />, can.readDonorPII)} />
      <Route path="/mustahik" element={shell(<BeneficiariesPage />, can.readDonorPII)} />
      <Route path="/penyaluran" element={shell(<DistributionsPage />)} />
      <Route path="/penyaluran/:id" element={shell(<DistributionDetailPage />)} />
      <Route path="/program" element={shell(<ProgramsPage />)} />
      <Route path="/rekening" element={shell(<AccountsPage />, can.manageAccounts)} />
      <Route path="/laporan" element={shell(<ReportsPage />)} />
      <Route path="/audit" element={shell(<AuditLogPage />, can.readAuditLog)} />
      <Route path="/pengguna" element={shell(<UsersPage />, can.manageUsers)} />
      <Route path="/pengaturan" element={shell(<SettingsPage />, can.manageUsers)} />
      <Route
        path="/bantuan"
        element={shell(
          <Suspense fallback={<p className="text-slate-500">Memuat panduan…</p>}>
            <HelpPage />
          </Suspense>,
        )}
      />
      <Route path="*" element={shell(<p className="text-slate-500">Halaman tidak ditemukan.</p>)} />
    </Routes>
  )
}
