import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { can } from '@/auth/permissions'
import { LoginPage } from '@/features/LoginPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { DonationsPage } from '@/features/donations/DonationsPage'
import { DonationImportPage } from '@/features/donations/DonationImportPage'
import { VerificationQueue } from '@/features/donations/VerificationQueue'
import { DonorsPage } from '@/features/donors/DonorsPage'
import { DonorDetailPage } from '@/features/donors/DonorDetailPage'
import { BeneficiariesPage } from '@/features/beneficiaries/BeneficiariesPage'
import { DistributionsPage } from '@/features/distributions/DistributionsPage'
import { ProgramsPage } from '@/features/programs/ProgramsPage'
import { AccountsPage } from '@/features/accounts/AccountsPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { AuditLogPage } from '@/features/audit/AuditLogPage'
import { UsersPage } from '@/features/users/UsersPage'
import { SettingsPage } from '@/features/settings/SettingsPage'

const shell = (element: React.ReactNode, allow?: Parameters<typeof ProtectedRoute>[0]['allow']) => (
  <ProtectedRoute allow={allow}>
    <AppShell>{element}</AppShell>
  </ProtectedRoute>
)

export default function App() {
  return (
    <Routes>
      <Route path="/masuk" element={<LoginPage />} />
      <Route path="/" element={shell(<DashboardPage />)} />
      <Route path="/donasi" element={shell(<DonationsPage />)} />
      <Route path="/donasi/impor" element={shell(<DonationImportPage />, can.recordDonation)} />
      <Route path="/verifikasi" element={shell(<VerificationQueue />, can.verifyDonation)} />
      <Route path="/donatur" element={shell(<DonorsPage />, can.readDonorPII)} />
      <Route path="/donatur/:id" element={shell(<DonorDetailPage />, can.readDonorPII)} />
      <Route path="/mustahik" element={shell(<BeneficiariesPage />, can.readDonorPII)} />
      <Route path="/penyaluran" element={shell(<DistributionsPage />)} />
      <Route path="/program" element={shell(<ProgramsPage />)} />
      <Route path="/rekening" element={shell(<AccountsPage />, can.manageAccounts)} />
      <Route path="/laporan" element={shell(<ReportsPage />)} />
      <Route path="/audit" element={shell(<AuditLogPage />, can.readAuditLog)} />
      <Route path="/pengguna" element={shell(<UsersPage />, can.manageUsers)} />
      <Route path="/pengaturan" element={shell(<SettingsPage />, can.manageUsers)} />
      <Route path="*" element={shell(<p className="text-slate-500">Halaman tidak ditemukan.</p>)} />
    </Routes>
  )
}
