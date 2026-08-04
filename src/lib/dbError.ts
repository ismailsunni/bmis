/**
 * Turns a Postgres or PostgREST message into something an amil can act on.
 *
 * Constraint names are the contract here: the database is the thing enforcing
 * these rules, so its errors are the ones users actually hit. Anything
 * unrecognised passes through unchanged rather than being flattened into a
 * generic apology that hides what went wrong.
 */
const RULES: [RegExp, string][] = [
  [
    /donors_phone_uniq/,
    'Nomor telepon ini sudah terdaftar pada donatur lain. Cari donatur tersebut, ' +
      'atau kosongkan nomor telepon di sini.',
  ],
  [/donations_payment_ref_uniq/, 'Referensi pembayaran ini sudah pernah dicatat.'],
  [/donors_donor_code_key/, 'Kode donatur ini sudah dipakai.'],
  [
    /violates row-level security|insufficient_privilege|permission denied/i,
    'Anda tidak berwenang melakukan perubahan ini.',
  ],
]

export function friendlyDbError(message: string): string {
  for (const [pattern, text] of RULES) {
    if (pattern.test(message)) return text
  }
  return message
}
