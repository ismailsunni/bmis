-- BMIS seed — master data (fund types, asnaf, settings, default account).
-- Fund-type rules here encode sharia constraints and must be reviewed with the
-- Dewan Pengawas Syariah before they are trusted (PRD risk register).

insert into public.asnaf_categories (code, name, description, sort_order) values
  ('fakir',        'Fakir',        'Tidak memiliki harta dan penghasilan untuk kebutuhan pokok', 1),
  ('miskin',       'Miskin',       'Berpenghasilan namun tidak mencukupi kebutuhan pokok', 2),
  ('amil',         'Amil',         'Pengelola zakat', 3),
  ('muallaf',      'Muallaf',      'Baru memeluk Islam atau dilunakkan hatinya', 4),
  ('riqab',        'Riqab',        'Memerdekakan budak / pembebasan dari belenggu', 5),
  ('gharimin',     'Gharimin',     'Terlilit utang untuk kebutuhan halal', 6),
  ('fisabilillah', 'Fisabilillah', 'Berjuang di jalan Allah', 7),
  ('ibnu_sabil',   'Ibnu Sabil',   'Musafir yang kehabisan bekal', 8)
on conflict (code) do nothing;

-- transfer_code is the 3-digit code a donor appends to the amount; only the
-- fund types that appear on the published poster carry one.
insert into public.fund_types
  (code, name, transfer_code, is_zakat, allowed_asnaf, preserve_principal,
   requires_program, amil_share_max, sort_order)
values
  ('zakat_maal', 'Zakat Maal', '101', true,
   '{fakir,miskin,amil,muallaf,riqab,gharimin,fisabilillah,ibnu_sabil}', false, false, 0.1250, 1),
  ('zakat_fitrah', 'Zakat Fitrah', null, true,
   '{fakir,miskin,amil}', false, false, 0.0625, 2),
  ('zakat_profesi', 'Zakat Penghasilan', null, true,
   '{fakir,miskin,amil,muallaf,riqab,gharimin,fisabilillah,ibnu_sabil}', false, false, 0.1250, 3),
  ('infaq_terikat', 'Infaq Terikat', null, false, '{}', false, true,  0.1000, 4),
  ('infaq_tidak_terikat', 'Infaq Tidak Terikat', null, false, '{}', false, false, 0.1000, 5),
  ('sedekah', 'Sedekah', null, false, '{}', false, false, 0.1000, 6),
  -- principal preserved: only the yield may ever be distributed
  ('wakaf_uang', 'Wakaf Uang', null, false, '{}', true, false, 0.1000, 7),
  ('fidyah', 'Fidyah', '112', false, '{fakir,miskin}', false, false, 0, 8),
  ('kurban', 'Kurban', null, false, '{}', false, false, 0, 9),
  ('dana_sosial', 'Dana Sosial Keagamaan Lainnya (DSKL)', null, false, '{}', false, false, 0.1000, 10),
  ('csr', 'CSR / Corporate', null, false, '{}', false, false, 0.1000, 11)
on conflict (code) do update set transfer_code = excluded.transfer_code;

insert into public.settings (key, value, description) values
  ('organization', jsonb_build_object(
     'name', 'Baitul Maal', 'short_name', 'BMIS', 'address', '', 'phone', '',
     'email', '', 'logo_url', null, 'receipt_footer',
     'Semoga Allah membalas kebaikan Anda dan menjadikannya amal jariyah.'),
   'Identitas lembaga untuk kop surat dan kwitansi'),
  ('fiscal', jsonb_build_object('year_start_month', 1, 'timezone', 'Asia/Jakarta'),
   'Tahun buku'),
  ('zakat', jsonb_build_object('nisab_gold_gram', 85, 'gold_price_idr', 1500000,
                               'amil_share_pct', 12.5),
   'Parameter perhitungan zakat'),
  ('targets', jsonb_build_object('annual_target', 0),
   'Target penghimpunan tahunan untuk dashboard'),
  ('rules', jsonb_build_object('duplicate_aid_days', 90),
   'Peringatan bantuan ganda bila mustahik menerima dari program sama dalam N hari')
on conflict (key) do nothing;

insert into public.accounts (name, type, opening_balance)
select 'Kas Utama', 'cash', 0
where not exists (select 1 from public.accounts);

-- ---------------------------------------------------------------------------
-- Organisation data for Baitul Maal Muhajirin, taken from the published
-- programme poster. Edit these for a different Baitul Maal — unlike the fund
-- types and asnaf above, this block is not master data.
-- ---------------------------------------------------------------------------

update public.settings set value = value || jsonb_build_object(
  'name', 'Baitul Maal Muhajirin',
  'short_name', 'BMM',
  'phone', '0821-184-2727',
  'website', 'masjidmuhajiringta.com'
) where key = 'organization';

insert into public.accounts (name, type, bank_name, account_number, opening_balance)
select 'BSI 96.00000.664', 'bank', 'Bank Syariah Indonesia', '9600000664', 0
where not exists (select 1 from public.accounts where account_number = '9600000664');

-- The twelve poster codes that name a programme. Zakat Maal (101) and Fidyah
-- (112) are fund types and carry their codes on fund_types instead.
insert into public.programs (name, slug, code, fund_type_id, status, description)
select v.name, v.slug, v.code,
       (select id from public.fund_types where code = v.fund_code),
       'active', v.description
from (values
  ('Sedekah Lansia',                   'sedekah-lansia',        '120', 'sedekah',
   'Santunan dan pendampingan untuk warga lanjut usia'),
  ('Sedekah Yatim',                    'sedekah-yatim',         '122', 'sedekah',
   'Santunan anak yatim'),
  ('Bantuan Palestina',                'bantuan-palestina',     '138', 'infaq_terikat',
   'Penyaluran bantuan kemanusiaan untuk Palestina'),
  ('Sedekah Jumat Berkah',             'sedekah-jumat-berkah',  '150', 'sedekah',
   'Program berbagi makanan setiap Jumat'),
  ('Sedekah Bantu Petani',             'sedekah-bantu-petani',  '153', 'sedekah',
   'Bantuan sarana produksi untuk petani'),
  ('Sedekah Pengembangan Sekolah',     'sedekah-sekolah',       '155', 'sedekah',
   'Pengembangan sarana dan mutu sekolah'),
  ('Sedekah TPAQ',                     'sedekah-tpaq',          '160', 'sedekah',
   'Operasional dan pengembangan TPA/TPQ'),
  ('Sedekah Pembinaan Pemuda & Remaja','sedekah-pemuda-remaja', '165', 'sedekah',
   'Pembinaan pemuda dan remaja masjid'),
  ('Sedekah UMKM',                     'sedekah-umkm',          '170', 'sedekah',
   'Modal dan pendampingan usaha mikro'),
  ('Sedekah Dakwah Kajian',            'sedekah-dakwah-kajian', '175', 'sedekah',
   'Penyelenggaraan kajian dan kegiatan dakwah'),
  ('Sedekah Pembangunan Masjid',       'sedekah-pembangunan-masjid', '200', 'sedekah',
   'Pembangunan dan pemeliharaan masjid'),
  ('Sedekah ATM Beras',                'sedekah-atm-beras',     '210', 'sedekah',
   'Pengisian ATM beras untuk warga membutuhkan')
) as v(name, slug, code, fund_code, description)
on conflict (slug) do update
  set code = excluded.code,
      description = excluded.description,
      fund_type_id = excluded.fund_type_id;
