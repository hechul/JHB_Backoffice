<template>
  <div class="login-page">
    <div class="login-bg"></div>
    <div class="login-card">
      <!-- Logo -->
      <div class="login-logo">
        <img src="/jhbiofarm-logo.png" alt="JHBioFarm 로고" class="login-logo-mark" />
        <div class="login-logo-text">
          <span class="login-brand">JHBioFarm</span>
          <span class="login-sub">백오피스</span>
        </div>
      </div>

      <div class="auth-tab">
        <button
          type="button"
          class="auth-tab-btn"
          :class="{ active: mode === 'login' }"
          @click="switchMode('login')"
        >
          로그인
        </button>
        <button
          type="button"
          class="auth-tab-btn"
          :class="{ active: mode === 'signup' }"
          @click="switchMode('signup')"
        >
          회원가입
        </button>
      </div>

      <!-- Form -->
      <form class="login-form" @submit.prevent="mode === 'login' ? handleLogin() : handleSignup()">
        <div v-if="mode === 'signup'" class="field">
          <label class="label" for="fullName">이름</label>
          <div class="input-with-icon">
            <User :size="16" :stroke-width="1.8" class="input-icon" />
            <input
              id="fullName"
              v-model="fullName"
              type="text"
              class="input"
              placeholder="홍길동"
              required
              autocomplete="name"
            />
          </div>
        </div>

        <div class="field">
          <label class="label" for="email">아이디</label>
          <div class="input-with-icon">
            <Mail :size="16" :stroke-width="1.8" class="input-icon" />
            <input
              id="email"
              v-model="email"
              type="text"
              class="input"
              placeholder="admin01 또는 admin@jhbiofarm.co.kr"
              required
              autocomplete="email"
            />
          </div>
        </div>

        <div class="field">
          <label class="label" for="password">비밀번호</label>
          <div class="input-with-icon">
            <Lock :size="16" :stroke-width="1.8" class="input-icon" />
            <input
              id="password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              class="input"
              placeholder="비밀번호 입력"
              required
              :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            />
            <button
              type="button"
              class="toggle-pw"
              :aria-label="showPassword ? '비밀번호 숨기기' : '비밀번호 보기'"
              @click="showPassword = !showPassword"
            >
              <Eye v-if="!showPassword" :size="16" :stroke-width="1.8" />
              <EyeOff v-else :size="16" :stroke-width="1.8" />
            </button>
          </div>
        </div>

        <div v-if="mode === 'signup'" class="field">
          <label class="label" for="passwordConfirm">비밀번호 확인</label>
          <div class="input-with-icon">
            <Lock :size="16" :stroke-width="1.8" class="input-icon" />
            <input
              id="passwordConfirm"
              v-model="passwordConfirm"
              :type="showPassword ? 'text' : 'password'"
              class="input"
              placeholder="비밀번호 다시 입력"
              required
              autocomplete="new-password"
            />
          </div>
        </div>

        <div v-if="infoMsg" class="login-info">
          <Info :size="14" :stroke-width="2" />
          {{ infoMsg }}
        </div>

        <div v-if="errorMsg" class="login-error">
          <AlertCircle :size="14" :stroke-width="2" />
          {{ errorMsg }}
        </div>

        <button type="submit" class="btn btn-primary btn-lg login-btn" :class="{ 'btn-loading': isLoading }">
          {{ mode === 'login' ? '로그인' : '회원가입' }}
        </button>

        <p class="login-note">
          <Info :size="12" :stroke-width="2" />
          {{ mode === 'login' ? '계정이 없으면 바로 회원가입 후 로그인할 수 있습니다.' : '회원가입 시 기본 역할은 수정자로 생성되며 즉시 이용 가능합니다.' }}
        </p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Mail, Lock, Eye, EyeOff, AlertCircle, Info, User } from 'lucide-vue-next'

definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const { fetchProfile } = useCurrentUser()

const email = ref('')
const password = ref('')
const fullName = ref('')
const passwordConfirm = ref('')
const showPassword = ref(false)
const errorMsg = ref('')
const infoMsg = ref('')
const isLoading = ref(false)
const mode = ref<'login' | 'signup'>('login')

function normalizeLoginId(raw: string) {
  const v = String(raw || '').trim().toLowerCase()
  if (!v) return ''
  if (v.includes('@')) return v
  return `${v}@jhbiofarm.local`
}

function formatAuthRequestError(prefix: string, error: any) {
  const message = String(error?.data?.message || error?.statusMessage || error?.message || '').trim()

  if (message.toLowerCase() === 'fetch failed') {
    return `${prefix}: 로컬 API 서버에 연결하지 못했습니다. \`apps/backoffice-v2\`에서 dev 서버를 완전히 재시작한 뒤 다시 시도해주세요.`
  }

  return message ? `${prefix}: ${message}` : `${prefix} 중 오류가 발생했습니다.`
}

function switchMode(next: 'login' | 'signup') {
  mode.value = next
  errorMsg.value = ''
  infoMsg.value = ''
}

async function handleLogin() {
  errorMsg.value = ''
  infoMsg.value = ''
  isLoading.value = true

  try {
    const normalizedEmail = normalizeLoginId(email.value)
    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: password.value,
    })

    if (error) {
      const msg = String(error.message || '')
      const lowerMsg = msg.toLowerCase()
      if (lowerMsg.includes('invalid login')) {
        errorMsg.value = '아이디 또는 비밀번호가 올바르지 않습니다.'
      } else if (lowerMsg.includes('email not confirmed')) {
        errorMsg.value = '로그인 실패: 계정 이메일 인증이 완료되지 않았습니다. 관리자 승인 후에도 동일하면 인증 패치 SQL을 먼저 실행해주세요.'
      } else {
        errorMsg.value = `로그인 실패: ${msg || '알 수 없는 오류'}`
      }
    } else {
      await fetchProfile(signInData.user?.id)
      navigateTo('/')
    }
  } catch (error: any) {
    errorMsg.value = formatAuthRequestError('로그인 실패', error)
  } finally {
    isLoading.value = false
  }
}

async function handleSignup() {
  errorMsg.value = ''
  infoMsg.value = ''
  isLoading.value = true

  try {
    if (!fullName.value.trim()) {
      errorMsg.value = '이름을 입력해주세요.'
      return
    }

    if (password.value.length < 8) {
      errorMsg.value = '비밀번호는 8자 이상으로 입력해주세요.'
      return
    }

    if (password.value !== passwordConfirm.value) {
      errorMsg.value = '비밀번호 확인이 일치하지 않습니다.'
      return
    }

    const normalizedEmail = normalizeLoginId(email.value)
    await $fetch('/api/auth/register', {
      method: 'POST',
      body: {
        email: normalizedEmail,
        password: password.value,
        fullName: fullName.value.trim(),
      },
    })

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: password.value,
    })

    if (signInError || !signInData.user?.id) {
      errorMsg.value = `회원가입 후 로그인에 실패했습니다: ${signInError?.message || '알 수 없는 오류'}`
      return
    }

    await fetchProfile(signInData.user.id)
    infoMsg.value = '회원가입이 완료되었습니다.'
    await navigateTo('/')
  } catch (error: any) {
    errorMsg.value = formatAuthRequestError('회원가입 실패', error)
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F8FAFC;
  position: relative;
  overflow: hidden;
  font-family: var(--font-sans);
}

.login-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 20% 50%, rgba(37, 99, 235, 0.06) 0%, transparent 60%),
    radial-gradient(ellipse at 80% 20%, rgba(99, 102, 241, 0.05) 0%, transparent 50%),
    radial-gradient(ellipse at 60% 80%, rgba(16, 185, 129, 0.04) 0%, transparent 50%);
}

.login-card {
  width: 400px;
  max-width: 90vw;
  background: #FFFFFF;
  border: 1px solid #E8E8E8;
  border-radius: 20px;
  padding: 48px 40px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.04), 0 1px 4px rgba(0,0,0,0.02);
  position: relative;
  z-index: 1;
}

.login-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 36px;
  justify-content: center;
}

.login-logo-mark {
  width: 40px;
  height: 40px;
  object-fit: contain;
}

.login-logo-text {
  display: flex;
  flex-direction: column;
}

.login-brand {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1A1A1A;
  line-height: 1.2;
}

.login-sub {
  font-size: 0.75rem;
  color: #9CA3AF;
  font-weight: 500;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.auth-tab {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 20px;
  padding: 4px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
}

.auth-tab-btn {
  height: 34px;
  border-radius: 8px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #6b7280;
}

.auth-tab-btn.active {
  background: #ffffff;
  color: #111827;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field .input {
  padding-left: 40px;
  height: 44px;
  font-size: 0.875rem;
}

.toggle-pw {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #9CA3AF;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
  transition: color 0.15s ease;
}
.toggle-pw:hover {
  color: #374151;
}

.login-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #FEF2F2;
  border: 1px solid #FECACA;
  border-radius: 8px;
  font-size: 0.8125rem;
  color: #991B1B;
}

.login-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  font-size: 0.8125rem;
  color: #1e40af;
}

.login-btn {
  width: 100%;
  justify-content: center;
  height: 46px;
  font-size: 0.9375rem;
  margin-top: 4px;
}

.login-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 0.75rem;
  color: #9CA3AF;
  text-align: center;
}
</style>
