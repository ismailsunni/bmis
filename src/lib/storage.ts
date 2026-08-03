import { supabase } from './supabase'

export type Bucket = 'donation-proofs' | 'beneficiary-docs' | 'distribution-proofs'

/**
 * Storage RLS keys writes on the first path segment, so every upload goes to
 * <uid>/… . Nothing is public; reads go through short-lived signed URLs.
 */
export async function uploadProof(bucket: Bucket, file: File) {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Sesi berakhir, silakan masuk kembali')

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${uid}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw new Error(error.message)
  return path
}

const SIGNED_URL_TTL_SECONDS = 60

export async function signedUrl(bucket: Bucket, path: string | null) {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error) return null
  return data.signedUrl
}
