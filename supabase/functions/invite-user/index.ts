// Invite a user and assign their role.
//
// This is one of the few operations that genuinely cannot happen in the
// browser: creating an auth user and writing app_metadata.user_role requires
// the service-role key, which must never ship to a client. The caller's own
// JWT is verified here first, so only a super_admin can reach the privileged
// client below.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const ALLOWED_ROLES = ['viewer', 'amil', 'auditor', 'finance', 'super_admin']

// Two different shapes, so two variables. A CORS origin is scheme and host
// only — the browser's Origin header never carries a path — while the invite
// redirect has to be the full app URL, including the /<repo>/ base on Pages.
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*'
const APP_URL = Deno.env.get('APP_URL') ?? undefined

const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Tidak terautentikasi' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const adminKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Step 1 — identify the caller with their own token, under RLS.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: auth } = await caller.auth.getUser()
  if (!auth.user) return json({ error: 'Sesi tidak valid' }, 401)

  const { data: profile } = await caller
    .from('profiles').select('role').eq('id', auth.user.id).single()

  if (profile?.role !== 'super_admin') {
    return json({ error: 'Hanya super admin yang dapat mengundang pengguna' }, 403)
  }

  const { email, full_name, role } = await req.json().catch(() => ({}))
  if (!email || !ALLOWED_ROLES.includes(role)) {
    return json({ error: 'Email dan peran yang valid wajib diisi' }, 400)
  }

  // Step 2 — only now use the privileged client, with a validated payload.
  const admin = createClient(url, adminKey, { auth: { persistSession: false } })

  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: full_name ?? '' },
    redirectTo: APP_URL,
  })
  if (error) return json({ error: error.message }, 400)

  // The role lives in app_metadata because the access-token hook reads it from
  // there into every JWT; profiles.role is the readable mirror.
  await admin.auth.admin.updateUserById(invited.user.id, {
    app_metadata: { user_role: role },
  })
  await admin.from('profiles')
    .update({ role, full_name: full_name ?? '', email })
    .eq('id', invited.user.id)

  return json({ id: invited.user.id, email, role })
})
