# Alur Kerja BMIS

Panduan operasional untuk amil, bendahara, dan pengurus. Ditulis dalam bahasa
Indonesia karena pembacanya adalah pengguna sistem, bukan pengembang. Untuk
dokumentasi teknis lihat [`README.md`](../README.md).

## Isi

1. [Siapa melakukan apa](#1-siapa-melakukan-apa)
2. [Menerima donasi](#2-menerima-donasi)
3. [Kode program pada nominal transfer](#3-kode-program-pada-nominal-transfer)
4. [Verifikasi oleh bendahara](#4-verifikasi-oleh-bendahara)
5. [Koreksi dan pembatalan](#5-koreksi-dan-pembatalan)
6. [Menyalurkan dana](#6-menyalurkan-dana)
7. [Aturan yang ditegakkan sistem](#7-aturan-yang-ditegakkan-sistem)
8. [Laporan bulanan dan tutup buku](#8-laporan-bulanan-dan-tutup-buku)
9. [Laporan tahunan dan Bukti Setor Zakat](#9-laporan-tahunan-dan-bukti-setor-zakat)
10. [Mengelola pengguna](#10-mengelola-pengguna)
11. [Log audit](#11-log-audit)
12. [Yang tidak dapat dilakukan siapa pun](#12-yang-tidak-dapat-dilakukan-siapa-pun)
13. [Batasan versi saat ini](#13-batasan-versi-saat-ini)

---

## 1. Siapa melakukan apa

| Peran         | Sebutan               | Tugas utama dalam sistem                                                                                |
| ------------- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| `super_admin` | Ketua / Pengurus Inti | Semua hal, termasuk mengundang pengguna, mengatur peran, master data, dan membuka periode yang terkunci |
| `finance`     | Bendahara             | Memverifikasi donasi, menyetujui penyaluran, mengelola rekening, menutup periode, seluruh laporan       |
| `amil`        | Petugas lapangan      | Mencatat donasi, mendaftarkan donatur dan mustahik, mengajukan penyaluran                               |
| `auditor`     | Dewan Pengawas        | Melihat seluruh data termasuk log audit. Tidak dapat mengubah apa pun                                   |
| `viewer`      | Relawan               | Melihat dasbor agregat saja. Tidak dapat melihat data pribadi donatur atau mustahik                     |

Dua hal penting sejak awal:

- **Pemisahan tugas.** Orang yang mencatat donasi tidak boleh menjadi orang yang
  memverifikasinya. Demikian pula pengaju penyaluran tidak boleh menyetujuinya
  sendiri. Aturan ini ditegakkan basis data, bukan hanya tampilan — jadi tidak
  ada cara mengakalinya. Ketua boleh menerobos, tetapi wajib menuliskan alasan
  yang tersimpan permanen.
- **Peran menentukan data yang terbaca.** Seorang amil hanya melihat donasi yang
  ia catat sendiri, bukan milik amil lain.

---

## 2. Menerima donasi

Semua donasi masuk berstatus **Menunggu verifikasi** dan **belum dihitung dalam
saldo maupun laporan** sampai bendahara memverifikasinya.

### 2a. Donasi tunai di depan orang

1. Buka **Donasi → Catat donasi**.
2. Pilih donatur. Bila belum terdaftar, ketik namanya lalu pilih
   **“+ Buat donatur baru”** — tidak perlu keluar dari formulir.
3. Isi **Jumlah**. Pemisah ribuan muncul otomatis.
4. Pilih **Jenis dana** (Zakat Maal, Infaq, Sedekah, dan seterusnya) dan
   **Program** bila donasi ditujukan untuk program tertentu.
5. **Metode**: Tunai. **Tanggal**: hari ini secara bawaan; ubah bila donasi
   diterima pada hari sebelumnya.
6. **Rekening penerima**: kas mana yang menerima uangnya.
7. Foto bukti bila ada, lalu **Simpan**.

Nomor kwitansi terbentuk otomatis dengan format `KW/2026/08/0001`.

### 2b. Donasi anonim (Hamba Allah)

Aktifkan tombol **“Donasi anonim”** di bagian atas formulir. Pemilihan donatur
dilewati dan donasi tercatat sebagai _Hamba Allah_. Gunakan ini untuk kotak amal,
donasi tanpa identitas, dan mutasi QRIS yang tidak dapat ditelusuri.

### 2c. Transfer bank atau QRIS satu per satu

Sama seperti 2a, dengan dua tambahan:

- **Metode**: Transfer, QRIS, atau E-Wallet.
- **Referensi pembayaran**: nomor transaksi dari mutasi bank atau QRIS. Kolom ini
  penting — sistem memakainya untuk menolak donasi ganda, sehingga satu mutasi
  tidak dapat tercatat dua kali.

Untuk QRIS anonim: aktifkan **Donasi anonim**, pilih metode **QRIS**, dan isi
nomor transaksi QRIS pada Referensi pembayaran.

### 2d. Mencatat banyak donasi sekaligus

Untuk kotak amal Jumat, kegiatan, atau setumpuk slip yang perlu dientri
sekaligus — tanpa berkas mutasi bank.

1. Buka **Donasi → Catat massal**.
2. Isi bagian atas satu kali: **Tanggal donasi**, **Rekening penerima**,
   **Jenis dana bawaan**, dan **Metode bawaan**. Nilai bawaan dipakai untuk
   setiap baris baru; **Terapkan ke semua baris** menyamakan jenis dana pada
   seluruh baris yang sudah ada.
3. Isi barisnya. Setiap baris punya donatur (atau centang **Anonim**), jumlah,
   jenis dana, program, metode, dan referensi. Baris baru muncul sendiri begitu
   baris terakhir diisi. Di ponsel setiap baris tampil sebagai kartu bertumpuk
   dengan label pada tiap kolom, jadi tidak perlu menggeser tabel ke samping.
4. Bila nominal memuat kode program, muncul tautan kecil di bawah kolom jumlah
   seperti “kode 153 → Sedekah Bantu Petani”. Tekan untuk menerapkannya.
5. Perhatikan **jumlah baris dan total** di bagian bawah — cocokkan dengan uang
   yang Anda hitung sebelum menyimpan.
6. Tekan **Simpan N donasi**.

Baris yang bermasalah diberi latar merah dan alasannya tercantum di bawah tabel,
misalnya donatur belum dipilih atau referensi dipakai dua kali. Tombol simpan
tetap terkunci sampai semuanya beres.

Seluruh baris tersimpan dalam satu kali proses: bila ada satu yang gagal, tidak
ada yang tersimpan. Jadi tidak akan ada setoran yang setengah tercatat.

### 2e. Impor mutasi bank sekaligus

Cara tercepat menangani banyak transfer dan QRIS sekaligus.

1. Unduh mutasi rekening dari internet banking sebagai CSV atau XLSX.
2. Buka **Donasi → Impor**, unggah berkasnya.
3. Sistem mencoba memetakan kolom sendiri. Periksa dan perbaiki: **Tanggal** dan
   **Jumlah** wajib; Referensi, Nama pengirim, dan Keterangan sangat dianjurkan.
4. Pilih **Jenis dana bila kode tidak dikenali** dan **Rekening tujuan**.
   Pilihan ini hanya berlaku untuk baris yang tidak memiliki kode program.
5. Klik **Pratinjau**. Setiap baris ditandai:
   - **Siap** — akan diimpor
   - **Sudah ada** — nomor referensinya sudah tercatat, baris dilewati
   - **Bermasalah** — tanggal atau jumlah tidak terbaca
     Kolom **Kode / tujuan** memperlihatkan program hasil pembacaan kode.
6. Klik **Impor**. Semua baris masuk sebagai donasi anonim berstatus menunggu
   verifikasi, siap dicocokkan bendahara.

Tidak ada data yang tersimpan sebelum Anda menekan Impor.

### 2f. Mengirim kwitansi ke donatur

Pada daftar **Donasi**, baris yang sudah terverifikasi memiliki ikon WhatsApp.
Menekannya menyalin teks kwitansi ke papan klip dan membuka WhatsApp; pilih
kontak donatur lalu tempel. Kwitansi memuat nomor, jenis dana, jumlah, serta
tanggal Masehi dan Hijriah.

---

## 3. Kode program pada nominal transfer

Poster BMM meminta donatur menambahkan kode 3 angka di akhir nominal:
**Rp100.153** berarti donasi Rp 100.000 untuk kode **153** (Sedekah Bantu
Petani). Pada mutasi bank, kode inilah satu-satunya petunjuk niat donatur.

Sistem membaca tiga angka terakhir nominal:

- **Pada formulir Catat donasi**, saat Anda mengetik nominal, muncul keterangan
  “Kode 153 pada nominal ini merujuk Sedekah Bantu Petani”. Tekan **Terapkan**
  agar jenis dana dan program terisi sendiri. Ini hanya usulan — Anda tetap dapat
  memilih tujuan lain bila donatur memberi tahu maksud yang berbeda.
- **Pada impor mutasi bank**, setiap baris diarahkan menurut kodenya
  masing-masing. Baris tanpa kode yang dikenali memakai jenis dana cadangan yang
  Anda pilih.

Nominal tanpa kode yang terdaftar dianggap **sedekah umum** — sistem tidak
menebak-nebak.

Kode 101 (Zakat Maal) dan 112 (Fidyah) menunjuk jenis dana; dua belas kode
lainnya menunjuk program. Menambah program baru beserta kodenya dilakukan di
**Program → Program baru**, kolom **Kode transfer**. Satu kode tidak dapat
dipakai dua tujuan.

---

## 4. Verifikasi oleh bendahara

Ini gerbang antara “tercatat” dan “dihitung”.

1. Buka **Verifikasi**. Setiap donasi yang menunggu tampil berdampingan dengan
   foto buktinya.
2. Cocokkan jumlah dan tanggal dengan mutasi rekening atau uang yang diterima.
3. **Verifikasi** bila sesuai. Donasi langsung masuk saldo, dasbor, dan laporan.
4. **Tolak** bila tidak sesuai — alasan wajib diisi dan tersimpan di log audit.

Untuk satu batch mutasi bank yang sudah dicocokkan, centang beberapa baris lalu
tekan **Verifikasi N terpilih**.

Donasi yang menunggu lebih dari tiga hari ditandai merah, dan jumlahnya muncul
sebagai peringatan di dasbor.

> Bendahara tidak dapat memverifikasi donasi yang ia catat sendiri. Bila
> bendahara yang menerima uangnya, mintalah bendahara lain atau ketua yang
> memverifikasi.

**Bila Anda ketua atau bendahara dan mencatat sendiri donasinya**, tombolnya
berubah menjadi **Verifikasi dengan alasan**. Sistem meminta alasan singkat, lalu alasan itu
tersimpan pada donasi dan di log audit. Ini jalan keluar untuk keadaan
tertentu, bukan kebiasaan: selama pengurus masih satu orang, setiap entri akan
menempuh jalur ini dan seluruhnya tercatat. Begitu ada bendahara kedua,
undanglah lewat menu Pengguna agar alur normal berjalan.

Hanya ketua dan bendahara yang boleh menerobos. Amil, Dewan Pengawas, dan
relawan tidak bisa — bukan hanya tombolnya disembunyikan, tetapi basis data
menolaknya, termasuk bila seseorang mencoba lewat API langsung. Alasannya juga
wajib bermakna: minimal 10 karakter, sebab catatan audit tidak ada gunanya bila
alasannya satu huruf.

Verifikasi massal sengaja tidak dapat dipakai untuk entri sendiri — satu batch
tidak punya tempat untuk mencatat alasan per baris.

---

## 5. Koreksi dan pembatalan

| Keadaan                                                | Yang dilakukan                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| Salah isi, **belum diverifikasi**, entri milik sendiri | Amil dapat memperbaikinya langsung                              |
| Salah **jenis dana atau program**, sudah terverifikasi | Bendahara dapat memperbaikinya; perubahan tercatat di log audit |
| Salah **jumlah**, sudah terverifikasi                  | **Batalkan** donasi lalu catat ulang dengan jumlah benar        |
| Donasi tercatat dua kali                               | Batalkan salah satunya, alasan: duplikat                        |
| Uang dikembalikan ke donatur                           | Batalkan dengan alasan pengembalian                             |

Membatalkan (_void_) selalu memerlukan alasan. Donasi yang dibatalkan tetap
tersimpan lengkap dengan alasannya dan berhenti dihitung dalam saldo — inilah
sebabnya tidak ada tombol hapus di sistem ini.

Donatur ganda digabungkan di **Donatur → Gabungkan**. Seluruh donasi berpindah
ke donatur yang dipertahankan, data yang digabung diarsipkan, dan alasannya
tercatat.

---

## 6. Menyalurkan dana

### 6a. Mendaftarkan mustahik lebih dahulu

1. **Mustahik → Daftarkan mustahik**.
2. Isi nama dan **Asnaf** — ini menentukan dana zakat apa yang berhak ia terima,
   jadi pastikan tepat.
3. Lengkapi alamat, jumlah tanggungan, dan penghasilan bila diketahui.
4. Status awal **Belum disurvei**.

Alur survei: buka baris mustahik lalu tekan tombol status untuk maju dari
**Belum disurvei → Survei dijadwalkan → Terverifikasi**.

**Dana zakat hanya boleh disalurkan kepada mustahik berstatus Terverifikasi.**
Selesaikan survei sebelum menyalurkan.

Bila mustahik pernah menerima bantuan dari program yang sama dalam 90 hari
terakhir (dapat diatur di Pengaturan), peringatan bantuan ganda muncul saat
Anda membuka datanya.

### 6b. Tiga langkah penyaluran

**Langkah 1 — Pengajuan** (amil atau bendahara)

1. **Penyaluran → Ajukan penyaluran**.
2. Pilih **Sumber dana**. Wakaf uang tidak muncul di daftar: pokoknya wajib
   dipertahankan.
3. Pilih **Mustahik**. Untuk dana zakat, daftar sudah disaring hanya pada
   mustahik terverifikasi yang asnafnya berhak atas dana tersebut.
4. Isi jumlah, bentuk bantuan, tanggal, dan rekening sumber. Simpan sebagai
   **Diajukan**.

**Langkah 2 — Persetujuan** (bendahara atau ketua)

Pada daftar Penyaluran, tekan **Setujui**. Saat inilah sistem memeriksa saldo
jenis dana tersebut dan menolak bila tidak mencukupi. **Tolak** memerlukan
alasan.

Pengaju tidak dapat menyetujui pengajuannya sendiri.

**Langkah 3 — Penyerahan** (amil di lapangan)

Setelah disetujui, tekan **Serahkan**, lalu unggah foto penyerahan dan tanda
tangan penerima. Status menjadi **Tersalurkan** dan barulah dihitung sebagai
penyaluran dalam laporan.

---

## 7. Aturan yang ditegakkan sistem

Aturan berikut tidak dapat dilanggar dari tampilan mana pun, karena ditegakkan
di basis data:

| Aturan                              | Akibatnya                                                      |
| ----------------------------------- | -------------------------------------------------------------- |
| Zakat hanya untuk 8 asnaf           | Penyaluran zakat ke penerima di luar asnaf yang berhak ditolak |
| Zakat Fitrah lebih sempit           | Hanya fakir, miskin, dan amil                                  |
| Mustahik harus terverifikasi        | Penyaluran zakat ke mustahik belum disurvei ditolak            |
| Pokok wakaf tidak boleh disalurkan  | Wakaf uang tidak dapat dipilih sebagai sumber                  |
| Infaq Terikat wajib berprogram      | Donasi tanpa program ditolak                                   |
| Saldo tidak boleh minus             | Persetujuan yang melebihi saldo jenis dana ditolak             |
| Hak amil terbatas                   | Penyaluran kepada asnaf amil dibatasi porsinya per jenis dana  |
| Pencatat bukan pemverifikasi        | Ditolak, kecuali ketua dengan alasan tertulis                  |
| Periode terkunci                    | Entri bertanggal dalam periode itu ditolak                     |
| Hanya donasi terverifikasi dihitung | Donasi menunggu tidak memengaruhi saldo maupun laporan         |

Bila salah satu aturan menghalangi pekerjaan yang menurut Anda benar, jangan
mencari jalan pintas — kemungkinan datanya perlu diperbaiki lebih dulu
(misalnya menyelesaikan survei mustahik).

---

## 8. Laporan bulanan dan tutup buku

Lakukan pada awal bulan untuk bulan sebelumnya.

**Langkah 1 — Bersihkan antrean.** Buka **Verifikasi** dan pastikan kosong.
Donasi yang masih menunggu tidak akan masuk laporan bulan itu.

**Langkah 2 — Cocokkan saldo dengan rekening.** Buka **Laporan → Saldo dana**,
pilih rentang bulan tersebut. Tabelnya menyajikan per jenis dana:

| Kolom       | Arti                                 |
| ----------- | ------------------------------------ |
| Saldo awal  | Sisa sebelum periode                 |
| Penerimaan  | Donasi terverifikasi dalam periode   |
| Penyaluran  | Penyaluran tersalurkan dalam periode |
| Saldo akhir | Saldo awal + penerimaan − penyaluran |

Total saldo akhir harus sama dengan saldo kas dan rekening bank Anda. Bila
selisih, cari sebabnya sekarang — biasanya donasi belum diverifikasi, penyaluran
disetujui tapi belum ditandai diserahkan, atau mutasi bank yang belum diimpor.

**Langkah 3 — Cetak laporan pengurus.**

- **Laporan → Penghimpunan**: rincian menurut jenis dana, metode pembayaran, dan
  amil.
- **Laporan → Penyaluran**: rincian menurut jenis dana, asnaf, dan program.
- Tombol **XLSX** mengunduh setiap tabel; tombol **Cetak** menghasilkan versi
  cetak berkop lembaga untuk disimpan sebagai PDF.

**Langkah 4 — Periksa dasbor.** Pada **Dasbor**, pilih rentang bulan tersebut
dan perhatikan **ACR** (penyaluran ÷ penghimpunan). Di bawah 70% berarti dana
menumpuk belum tersalurkan; di atas 100% berarti bulan itu memakai saldo bulan
sebelumnya. Keduanya perlu penjelasan dalam laporan pengurus.

**Langkah 5 — Kunci periode.** Buka **Kas & Bank → Tutup periode**, pilih bulan
`YYYY-MM`, beri catatan seperti “tutup buku Agustus”, lalu **Kunci periode**.

Setelah terkunci, tidak seorang pun dapat menambah atau mengubah donasi dan
penyaluran bertanggal dalam bulan itu — kecuali ketua. Inilah yang membuat
laporan yang sudah diserahkan tidak berubah di belakang.

> Angka pada dasbor diperbarui setiap 15 menit, dan waktu pembaruan terakhir
> tertulis di bawah judul Dasbor. Laporan pada menu Laporan selalu dihitung
> langsung, jadi gunakan Laporan sebagai acuan resmi.

---

## 9. Laporan tahunan dan Bukti Setor Zakat

Donatur memerlukan **Bukti Setor Zakat (BSZ)** sebagai pengurang penghasilan
kena pajak.

1. **Donatur** → buka data donatur.
2. Tekan **Cetak BSZ** untuk tahun berjalan.
3. Simpan sebagai PDF dari dialog cetak peramban, lalu kirimkan ke donatur.

Isi BSZ diambil dari donasi terverifikasi tahun tersebut, jadi pastikan NPWP
donatur sudah terisi lebih dahulu.

Halaman donatur juga menampilkan total seumur hidup, rincian per jenis dana,
riwayat donasi, serta penanda **Berisiko berhenti** untuk donatur tetap yang
belum berdonasi dua bulan terakhir.

---

## 10. Mengelola pengguna

Hanya ketua yang dapat melakukannya, di menu **Pengguna**.

- **Undang pengguna**: masukkan email dan pilih peran. Undangan terkirim dan akun
  langsung aktif.
- **Ubah peran**: pilih peran baru pada baris pengguna. Peran baru berlaku setelah
  pengguna keluar dan masuk kembali, karena peran dibawa di dalam token sesi.
- **Nonaktifkan**: pengguna tidak dapat lagi membaca data apa pun, tanpa data
  historisnya hilang. Gunakan ini untuk amil yang berhenti — jangan menghapus
  akunnya.
- **Reset sandi**: mengirim tautan atur ulang ke emailnya.

Masuk dapat memakai kata sandi, tautan email, atau **Google**. Yang perlu
dipahami: berhasil masuk **bukan** berarti mendapat akses. Akun yang belum
diberi peran oleh pengurus akan melihat pesan “Akun belum diaktifkan” dan tidak
dapat membaca data apa pun. Jadi bila seorang amil masuk dengan Google sebelum
diundang, ia tidak melihat apa-apa sampai Anda mengaktifkannya di menu Pengguna.

---

## 11. Log audit

**Log Audit** mencatat setiap perubahan data: siapa, kapan, tabel apa, dan nilai
sebelum serta sesudahnya. Dapat disaring menurut pelaku, tabel, aksi, dan
tanggal. Menekan satu baris memperlihatkan perbandingan nilai lama dan baru.

Catatan ini hanya dapat ditambah. Tidak ada peran — termasuk ketua — yang dapat
mengubah atau menghapusnya. Inilah yang dapat ditunjukkan kepada Dewan Pengawas
atau auditor eksternal.

Alasan yang Anda tuliskan saat menolak, membatalkan, atau menggabungkan data
muncul di sini. Tulislah alasan yang bermakna bagi orang yang membacanya setahun
kemudian.

---

## 12. Yang tidak dapat dilakukan siapa pun

- **Menghapus donasi.** Batalkan saja; jejaknya harus tetap ada.
- **Menghapus catatan log audit.**
- **Memverifikasi donasi sendiri** (kecuali ketua dengan alasan tertulis).
- **Menyetujui penyaluran yang diajukan sendiri** (syarat yang sama).
- **Menyalurkan pokok wakaf.**
- **Menyalurkan melebihi saldo jenis dana.**
- **Melihat data pribadi donatur atau mustahik sebagai relawan.**

---

## 13. Batasan versi saat ini

Jujur mengenai yang belum ada, agar tidak dicari-cari:

- **Autentikasi dua faktor belum dapat diaktifkan.** Belum ada layar
  pendaftarannya, sehingga ketua dan bendahara belum dapat memasangnya meski
  seharusnya wajib.
- **Membuka periode yang terkunci belum ada tombolnya.** Perlu bantuan
  pengembang melalui basis data.
- **Belum ada mode luring penuh.** Data yang sudah dibuka tetap terlihat tanpa
  jaringan, tetapi entri baru belum dapat disimpan untuk dikirim nanti.
- **Kwitansi dan rekap belum dikirim otomatis lewat email**; kwitansi WhatsApp
  sudah berfungsi.
- **Belum ada dukungan multi-cabang.**
- **Penggabungan donatur masih meminta ID**, belum pencarian nama.
