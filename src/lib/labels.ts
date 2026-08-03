import type {
  Asnaf, DistributionStatus, DistributionType, DonationStatus,
  DonorType, PaymentMethod, ProgramStatus, UserRole, VerificationStatus,
} from '@/types/db'

export const roleLabels: Record<UserRole, string> = {
  super_admin: 'Ketua / Pengurus Inti',
  finance: 'Bendahara',
  amil: 'Amil',
  auditor: 'Dewan Pengawas',
  viewer: 'Relawan',
  none: 'Belum diaktifkan',
}

export const donationStatusLabels: Record<DonationStatus, string> = {
  draft: 'Draf', pending: 'Menunggu verifikasi', verified: 'Terverifikasi',
  rejected: 'Ditolak', voided: 'Dibatalkan',
}

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Tunai', transfer: 'Transfer', qris: 'QRIS',
  ewallet: 'E-Wallet', in_kind: 'Barang',
}

export const donorTypeLabels: Record<DonorType, string> = {
  individual: 'Perorangan', organization: 'Lembaga', anonymous: 'Anonim',
}

export const asnafLabels: Record<Asnaf, string> = {
  fakir: 'Fakir', miskin: 'Miskin', amil: 'Amil', muallaf: 'Muallaf',
  riqab: 'Riqab', gharimin: 'Gharimin', fisabilillah: 'Fisabilillah',
  ibnu_sabil: 'Ibnu Sabil',
}

export const verificationStatusLabels: Record<VerificationStatus, string> = {
  unverified: 'Belum disurvei', survey_scheduled: 'Survei dijadwalkan',
  verified: 'Terverifikasi', rejected: 'Ditolak',
}

export const distributionStatusLabels: Record<DistributionStatus, string> = {
  requested: 'Diajukan', approved: 'Disetujui', disbursed: 'Tersalurkan',
  rejected: 'Ditolak',
}

export const distributionTypeLabels: Record<DistributionType, string> = {
  cash: 'Tunai', goods: 'Barang', service: 'Layanan', scholarship: 'Beasiswa',
}

export const programStatusLabels: Record<ProgramStatus, string> = {
  draft: 'Draf', active: 'Aktif', completed: 'Selesai', cancelled: 'Dibatalkan',
}
