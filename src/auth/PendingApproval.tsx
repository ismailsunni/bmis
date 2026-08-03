import { useAuth } from './AuthProvider'
import { Button, Card } from '@/components/ui'

/**
 * Where an authenticated but unadmitted account lands. Signing in with Google
 * creates an account; it does not grant membership, and the database will refuse
 * every query until an admin activates the profile. Saying that plainly beats
 * rendering an app whose every panel reports a permission error.
 */
export function PendingApproval() {
  const { user, signOut } = useAuth()
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm text-center">
        <h1 className="text-lg font-bold text-brand-800 dark:text-brand-300">
          Akun belum diaktifkan
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Anda berhasil masuk sebagai <strong className="break-all">{user?.email}</strong>,
          namun akun ini belum diberi peran oleh pengurus. Silakan hubungi pengurus
          Baitul Maal agar akses Anda diaktifkan.
        </p>
        <Button variant="secondary" className="mt-5 w-full" onClick={signOut}>
          Keluar
        </Button>
      </Card>
    </div>
  )
}
