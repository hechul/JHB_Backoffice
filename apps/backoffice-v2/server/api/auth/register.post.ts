import { createClient } from '@supabase/supabase-js'

function normalizeLoginId(raw: string) {
  const value = String(raw || '').trim().toLowerCase()
  if (!value) return ''
  if (value.includes('@')) return value
  return `${value}@jhbiofarm.local`
}

function readJwtRole(token?: string) {
  const value = String(token || '').trim()
  if (!value || value.split('.').length !== 3) return ''
  try {
    const payload = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8'))
    return String(payload?.role || '').trim().toLowerCase()
  } catch {
    return ''
  }
}

function isLikelyServiceKey(token?: string) {
  const value = String(token || '').trim()
  if (!value) return false
  if (value.startsWith('sb_secret_')) return true
  return readJwtRole(value) === 'service_role'
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

  const supabaseUrl = process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const genericKey = process.env.SUPABASE_KEY
  const explicitServiceKey =
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY

  const serviceKey =
    explicitServiceKey ||
    (isLikelyServiceKey(genericKey) ? genericKey : '')

  if (!supabaseUrl || !serviceKey) {
    throw createError({
      statusCode: 500,
      message: '회원가입 서버 환경변수가 설정되지 않았습니다. 로컬 개발도 SUPABASE_SERVICE_KEY가 필요합니다.',
    })
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  async function ensureActiveModifierProfile(userId: string) {
    const { error: authMetaError } = await adminClient.auth.admin.updateUserById(userId, {
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

    if (authMetaError) {
      console.error('register auth metadata update failed:', authMetaError)
      throw createError({ statusCode: 500, message: '가입 계정 메타데이터 설정에 실패했습니다.' })
    }

    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert({
        id: userId,
        email,
        full_name: fullName,
        role: 'modifier',
        status: 'active',
      }, {
        onConflict: 'id',
      })

    if (profileError) {
      console.error('register profile upsert failed:', profileError)
      throw createError({ statusCode: 500, message: `프로필 생성에 실패했습니다: ${profileError.message || '알 수 없는 오류'}` })
    }

    const { data: profileRow, error: profileVerifyError } = await adminClient
      .from('profiles')
      .select('id, role, status')
      .eq('id', userId)
      .maybeSingle()

    if (profileVerifyError) {
      console.error('register profile verify failed:', profileVerifyError)
      throw createError({ statusCode: 500, message: '프로필 상태 확인에 실패했습니다.' })
    }

    let role = String((profileRow as any)?.role || '').toLowerCase()
    let status = String((profileRow as any)?.status || '').toLowerCase()

    if (role !== 'modifier' || status !== 'active') {
      const { error: repairError } = await adminClient
        .from('profiles')
        .update({
          role: 'modifier',
          status: 'active',
          full_name: fullName,
          email,
        })
        .eq('id', userId)

      if (repairError) {
        console.error('register profile repair failed:', repairError)
        throw createError({
          statusCode: 500,
          message: '회원가입은 생성되었지만 활성 상태 보정에 실패했습니다. profiles 자동승인 SQL 패치를 확인해주세요.',
        })
      }

      const { data: repairedProfile, error: repairedProfileError } = await adminClient
        .from('profiles')
        .select('id, role, status')
        .eq('id', userId)
        .maybeSingle()

      if (repairedProfileError) {
        console.error('register profile repair verify failed:', repairedProfileError)
        throw createError({
          statusCode: 500,
          message: '회원가입은 생성되었지만 활성 상태 확인에 실패했습니다. profiles 자동승인 SQL 패치를 확인해주세요.',
        })
      }

      role = String((repairedProfile as any)?.role || '').toLowerCase()
      status = String((repairedProfile as any)?.status || '').toLowerCase()
    }

    if (role !== 'modifier' || status !== 'active') {
      console.error('register profile verify mismatch:', profileRow)
      throw createError({
        statusCode: 500,
        message: '회원가입은 생성되었지만 활성 상태 반영에 실패했습니다. profiles 자동승인 SQL 패치를 확인해주세요.',
      })
    }
  }

  async function findUserIdByEmail(targetEmail: string) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

    if (error) {
      console.error('register listUsers failed:', error)
      return ''
    }

    return String(data.users.find((candidate) => String(candidate.email || '').toLowerCase() === targetEmail)?.id || '')
  }

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
      const existingUserId = await findUserIdByEmail(email)
      if (existingUserId) {
        await ensureActiveModifierProfile(existingUserId)
        return {
          ok: true,
          email,
          role: 'modifier',
          status: 'active',
          mode: 'repair-existing-user',
        }
      }
      throw createError({ statusCode: 409, message: '이미 가입된 아이디입니다.' })
    }
    console.error('register user create failed:', error)
    throw createError({ statusCode: 500, message: message || '회원가입에 실패했습니다.' })
  }

  const userId = data.user.id
  await ensureActiveModifierProfile(userId)

  return {
    ok: true,
    email,
    role: 'modifier',
    status: 'active',
  }
})
