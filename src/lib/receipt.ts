import { formatDate, formatHijri, formatIDR } from './format'
import type { DonationRow } from '@/types/db'

interface Org {
  name?: string
  receipt_footer?: string
  phone?: string
}

/**
 * WhatsApp is where the amil already works, so the MVP "sends" a receipt by
 * putting the text on the clipboard behind a wa.me link — no Business API.
 */
export function receiptText(d: DonationRow, org: Org = {}) {
  return [
    `*${org.name ?? 'Baitul Maal'}*`,
    `Kwitansi: ${d.receipt_no}`,
    '',
    `Donatur : ${d.is_anonymous ? 'Hamba Allah' : (d.donor_name ?? '-')}`,
    `Jenis   : ${d.fund_type_name}`,
    d.program_name ? `Program : ${d.program_name}` : null,
    `Jumlah  : ${formatIDR(d.amount)}`,
    `Tanggal : ${formatDate(d.donated_at)} / ${formatHijri(d.donated_at)}`,
    '',
    org.receipt_footer ?? 'Semoga Allah membalas kebaikan Anda.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function whatsappLink(text: string, phone?: string | null) {
  const digits = phone?.replace(/\D/g, '')
  const target = digits ? `62${digits.replace(/^0|^62/, '')}` : ''
  return `https://wa.me/${target}?text=${encodeURIComponent(text)}`
}

export async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text)
}

/**
 * Bukti Setor Zakat — printed from a plain window so no PDF dependency ships
 * in the bundle. The browser's own "Save as PDF" produces the file.
 */
export function printBSZ(html: string) {
  const w = window.open('', '_blank', 'width=800,height=900')
  if (!w) return
  w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8">
    <title>Bukti Setor Zakat</title>
    <style>
      body{font-family:system-ui,sans-serif;padding:40px;color:#0f172a;line-height:1.6}
      h1{font-size:18px;text-align:center;margin-bottom:4px}
      .sub{text-align:center;color:#475569;font-size:13px;margin-bottom:28px}
      table{width:100%;border-collapse:collapse;margin:16px 0}
      td{padding:6px 0;vertical-align:top}
      td:first-child{width:180px;color:#475569}
      .total{font-size:20px;font-weight:700}
      .foot{margin-top:48px;font-size:13px;color:#475569}
      @media print{@page{margin:16mm}}
    </style></head><body>${html}
    <script>window.onload=()=>window.print()</script></body></html>`)
  w.document.close()
}
