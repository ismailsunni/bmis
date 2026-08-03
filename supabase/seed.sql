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

insert into public.fund_types
  (code, name, is_zakat, allowed_asnaf, preserve_principal, requires_program, amil_share_max, sort_order)
values
  ('zakat_maal', 'Zakat Maal', true,
   '{fakir,miskin,amil,muallaf,riqab,gharimin,fisabilillah,ibnu_sabil}', false, false, 0.1250, 1),
  ('zakat_fitrah', 'Zakat Fitrah', true,
   '{fakir,miskin,amil}', false, false, 0.0625, 2),
  ('zakat_profesi', 'Zakat Penghasilan', true,
   '{fakir,miskin,amil,muallaf,riqab,gharimin,fisabilillah,ibnu_sabil}', false, false, 0.1250, 3),
  ('infaq_terikat', 'Infaq Terikat', false, '{}', false, true,  0.1000, 4),
  ('infaq_tidak_terikat', 'Infaq Tidak Terikat', false, '{}', false, false, 0.1000, 5),
  ('sedekah', 'Sedekah', false, '{}', false, false, 0.1000, 6),
  -- principal preserved: only the yield may ever be distributed
  ('wakaf_uang', 'Wakaf Uang', false, '{}', true, false, 0.1000, 7),
  ('fidyah', 'Fidyah', false, '{fakir,miskin}', false, false, 0, 8),
  ('kurban', 'Kurban', false, '{}', false, false, 0, 9),
  ('dana_sosial', 'Dana Sosial Keagamaan Lainnya (DSKL)', false, '{}', false, false, 0.1000, 10),
  ('csr', 'CSR / Corporate', false, '{}', false, false, 0.1000, 11)
on conflict (code) do nothing;

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
