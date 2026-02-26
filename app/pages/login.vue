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

      <!-- Form -->
      <form class="login-form" @submit.prevent="handleLogin">
        <div class="field">
          <label class="label" for="email">이메일</label>
          <div class="input-with-icon">
            <Mail :size="16" :stroke-width="1.8" class="input-icon" />
            <input
              id="email"
              v-model="email"
              type="email"
              class="input"
              placeholder="admin@jhbiofarm.co.kr"
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
              autocomplete="current-password"
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

        <div v-if="errorMsg" class="login-error">
          <AlertCircle :size="14" :stroke-width="2" />
          {{ errorMsg }}
        </div>

        <button type="submit" class="btn btn-primary btn-lg login-btn" :class="{ 'btn-loading': isLoading }">
          로그인
        </button>

        <p class="login-note">
          <Info :size="12" :stroke-width="2" />
          계정이 없으시면 관리자에게 초대를 요청하세요.
        </p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Mail, Lock, Eye, EyeOff, AlertCircle, Info } from 'lucide-vue-next'

definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const { fetchProfile } = useCurrentUser()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const errorMsg = ref('')
const isLoading = ref(false)

async function handleLogin() {
  errorMsg.value = ''
  isLoading.value = true

  try {
    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })

    if (error) {
      if (error.message.includes('Invalid login')) {
        errorMsg.value = '이메일 또는 비밀번호가 올바르지 않습니다.'
      } else if (error.message.includes('Email not confirmed')) {
        errorMsg.value = '이메일 인증이 완료되지 않았습니다.'
      } else {
        errorMsg.value = '로그인에 실패했습니다. 다시 시도해주세요.'
      }
    } else {
      await fetchProfile(signInData.user?.id)
      navigateTo('/')
    }
  } catch {
    errorMsg.value = '네트워크 오류가 발생했습니다.'
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
