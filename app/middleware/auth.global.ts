export default defineNuxtRouteMiddleware((to) => {
    const user = useSupabaseUser()

    // 로그인 페이지는 누구나 접근 가능
    if (to.path === '/login') {
        // 이미 로그인된 상태면 홈으로
        if (user.value) {
            return navigateTo('/')
        }
        return
    }

    // 비로그인 → 로그인 페이지로 리디렉트
    if (!user.value) {
        return navigateTo('/login')
    }
})
