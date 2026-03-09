import { createClient } from '@supabase/supabase-js'

function normalizeLoginId(raw: string) {
  const value = String(raw || '').trim().toLowerCase()
  if (!value) return ''
  if (value.includes('@')) return value
  return `${value}@jhbiofarm.local`
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const rawEmail = String(body?.email || '')
  const password = String(body?.password || '')
  const fullName = String(body?.fullName || '').trim()

  if (!fullName) {
    throw createError({ statusCode: 400, message: '이름을 입력해주세요.' })
  }

  if (password.length < 8) {
    throw createError({ statusCode: 400, message: '비밀번호는 8자 이상이어야 합니다.' })
  }

  const email = normalizeLoginId(rawEmail)
  if (!email) {
    throw createError({ statusCode: 400, message: '아이디를 입력해주세요.' })
  }

  const supabaseUrl = process.env.NUXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !serviceKey) {
    throw createError({ statusCode: 500, message: '회원가입 서버 환경변수가 설정되지 않았습니다.' })
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role: 'modifier',
      status: 'active',
    },
    app_metadata: {
      role: 'modifier',
      status: 'active',
    },
  })

  if (error || !data.user?.id) {
    const message = String(error?.message || '')
    if (message.toLowerCase().includes('already')) {
      throw createError({ statusCode: 409, message: '이미 가입된 아이디입니다.' })
    }
    console.error('register user create failed:', error)
    throw createError({ statusCode: 500, message: message || '회원가입에 실패했습니다.' })
  }

  const { error: profileError } = await adminClient
    .from('profiles')
    .upsert({
      id: data.user.id,
      email,
      full_name: fullName,
      role: 'modifier',
      status: 'active',
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'id',
    })

  if (profileError) {
    console.error('register profile upsert failed:', profileError)
    throw createError({ statusCode: 500, message: '프로필 생성에 실패했습니다.' })
  }

  return {
    ok: true,
    email,
    role: 'modifier',
    status: 'active',
  }
})
