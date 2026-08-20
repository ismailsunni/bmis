import { useEffect, useState } from 'react'
import { signedUrl, type Bucket } from '@/lib/storage'
import { Spinner } from '@/components/ui'

/**
 * An image out of a private bucket. Signed URLs live 60 seconds, so one is
 * fetched per view and never stored — which is also why this cannot be a plain
 * <img src>.
 */
export function SignedImage({
  bucket,
  path,
  alt,
  empty = 'Tidak ada berkas yang diunggah.',
}: {
  bucket: Bucket
  path: string | null
  alt: string
  empty?: string
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setUrl(null)
    signedUrl(bucket, path).then((u) => {
      if (alive) setUrl(u)
    })
    return () => {
      alive = false
    }
  }, [bucket, path])

  if (!path) return <p className="text-sm text-slate-400">{empty}</p>
  if (!url) return <Spinner />

  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img src={url} alt={alt} className="max-h-64 w-full rounded-lg object-contain" />
    </a>
  )
}
