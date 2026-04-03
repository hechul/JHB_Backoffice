<template>
  <div class="stress-page">
    <div class="stress-orb stress-orb--blue" aria-hidden="true" />
    <div class="stress-orb stress-orb--mint" aria-hidden="true" />

    <section class="stress-shell">
      <div class="stress-topbar">
        <NuxtLink to="/" class="stress-topbar-link">홈으로</NuxtLink>
        <span class="stress-topbar-badge">{{ phaseLabel }}</span>
      </div>

      <div class="stress-hero">
        <div class="stress-copy">
          <p class="stress-eyebrow">Cat Runner</p>
          <h1 class="stress-title">
            고양이가 3차선 도로를
            <br />
            전력 질주합니다
          </h1>
          <p class="stress-description">
            좌우로 차선을 바꾸고, 점프하거나 숙이면서 청소기와 장난감 바를 피하세요.
            귀여운 픽셀 감성과 입체적인 러너 시점을 같이 담았습니다.
          </p>
          <p class="stress-guide">
            방향키 또는 <strong>W A S D</strong>로 조작할 수 있어요.
          </p>
        </div>

        <div class="stress-actions">
          <button type="button" class="stress-primary-btn" @click="handlePrimaryAction">
            {{ primaryActionLabel }}
          </button>
          <button
            type="button"
            class="stress-secondary-btn"
            :disabled="phase !== 'running'"
            @click="resetRun"
          >
            판 비우기
          </button>
        </div>
      </div>

      <div class="stress-stats">
        <article class="stress-stat">
          <span class="stress-stat-label">달린 거리</span>
          <strong class="stress-stat-value">{{ distanceLabel }}</strong>
        </article>
        <article class="stress-stat">
          <span class="stress-stat-label">연속 회피</span>
          <strong class="stress-stat-value">{{ dodgeStreak }}회</strong>
        </article>
        <article class="stress-stat">
          <span class="stress-stat-label">속도감</span>
          <strong class="stress-stat-value">{{ speedLabel }}</strong>
        </article>
        <article class="stress-stat">
          <span class="stress-stat-label">최고 기록</span>
          <strong class="stress-stat-value">{{ bestScoreLabel }}</strong>
        </article>
      </div>

      <div class="runner-frame">
        <div class="runner-canvas-shell">
          <div class="runner-canvas-topline">
            <span>3차선 러너</span>
            <span>{{ currentLaneLabel }}</span>
          </div>

          <canvas
            ref="canvasRef"
            class="runner-canvas"
            width="1000"
            height="620"
            @click="focusCanvas"
          />

          <div v-if="phase !== 'running'" class="runner-overlay">
            <strong class="runner-overlay-title">
              {{ phase === 'crashed' ? '장애물에 부딪혔어요' : '달릴 준비 완료' }}
            </strong>
            <p class="runner-overlay-copy">
              {{
                phase === 'crashed'
                  ? `이번 기록은 ${distanceLabel}예요. 다시 달려볼까요?`
                  : '왼쪽, 오른쪽, 점프, 숙이기로 장애물을 피하세요.'
              }}
            </p>
          </div>
        </div>

        <div class="runner-mobile-controls">
          <button type="button" class="runner-control-btn" @click="moveLane(-1)">←</button>
          <button
            type="button"
            class="runner-control-btn"
            @mousedown.prevent="holdDuck(true)"
            @mouseup.prevent="holdDuck(false)"
            @mouseleave.prevent="holdDuck(false)"
            @touchstart.prevent="holdDuck(true)"
            @touchend.prevent="holdDuck(false)"
            @touchcancel.prevent="holdDuck(false)"
          >
            ↓
          </button>
          <button
            type="button"
            class="runner-control-btn runner-control-btn--primary"
            @click="startJump()"
          >
            ↑
          </button>
          <button type="button" class="runner-control-btn" @click="moveLane(1)">→</button>
        </div>
      </div>

      <section class="stress-leaderboard">
        <div class="stress-leaderboard-header">
          <div>
            <p class="stress-leaderboard-eyebrow">오늘의 랭킹</p>
            <h2 class="stress-leaderboard-title">오늘 제일 멀리 달린 3명</h2>
          </div>
          <span class="stress-leaderboard-state">{{ leaderboardStateLabel }}</span>
        </div>

        <div v-if="leaderboardTableMissing" class="stress-leaderboard-empty">
          랭킹 테이블이 아직 준비되지 않았어요.
        </div>
        <div v-else-if="!leaderboardRows.length" class="stress-leaderboard-empty">
          아직 기록이 없어요. 첫 번째로 달려보세요.
        </div>
        <ol v-else class="stress-leaderboard-list">
          <li
            v-for="row in leaderboardRows"
            :key="row.userId"
            class="stress-leaderboard-item"
            :class="{ 'stress-leaderboard-item--me': row.userId === user.id }"
          >
            <span class="stress-leaderboard-rank">{{ row.rank }}</span>
            <div class="stress-leaderboard-user">
              <strong class="stress-leaderboard-name">{{ row.userName }}</strong>
              <span v-if="row.userId === user.id" class="stress-leaderboard-me">나</span>
            </div>
            <strong class="stress-leaderboard-score">{{ formatMeters(row.bestScore) }}</strong>
          </li>
        </ol>
      </section>

      <p class="stress-footnote">
        너무 힘들 때 한 판만 달리고 다시 업무로 돌아오세요.
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import {
  CAT_DUCK_SVG,
  CAT_JUMP_SVG,
  CAT_RUN_A_SVG,
  CAT_RUN_B_SVG,
  OBSTACLE_BEAM_SVG,
  OBSTACLE_CRATE_SVG,
  createSvgDataUrl,
} from '../utils/stressSprites'

definePageMeta({ layout: 'home' })

type PlayPhase = 'idle' | 'running' | 'crashed'
type ObstacleType = 'crate' | 'beam'

type Obstacle = {
  id: number
  lane: number
  type: ObstacleType
  z: number
  passed: boolean
}

type LeaderboardRow = {
  rank: number
  userId: string
  userName: string
  bestScore: number
}

type StressSpriteImages = {
  runA: HTMLImageElement | null
  runB: HTMLImageElement | null
  jump: HTMLImageElement | null
  duck: HTMLImageElement | null
  crate: HTMLImageElement | null
  beam: HTMLImageElement | null
}

const CANVAS_WIDTH = 1000
const CANVAS_HEIGHT = 620
const MAX_OBSTACLE_Z = 120
const PLAYER_COLLISION_Z_MIN = 6
const PLAYER_COLLISION_Z_MAX = 14
const BASE_SPEED = 28
const MAX_SPEED = 54
const ROAD_HORIZON_Y = 108
const ROAD_BOTTOM_Y = 590
const PLAYER_BASE_Y = 528

const supabase = useSupabaseClient()
const { user } = useCurrentUser()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const phase = ref<PlayPhase>('idle')
const distance = ref(0)
const dodgeStreak = ref(0)
const bestScore = ref(0)
const currentSpeed = ref(BASE_SPEED)

const leaderboardRows = ref<LeaderboardRow[]>([])
const leaderboardLoading = ref(false)
const leaderboardSaving = ref(false)
const leaderboardTableMissing = ref(false)

const targetLane = ref(1)
const lanePosition = ref(1)
const jumpOffset = ref(0)
const jumpVelocity = ref(0)
const duckHeld = ref(false)
const duckTimer = ref(0)
const duckProgress = ref(0)
const runTime = ref(0)
const obstacles = ref<Obstacle[]>([])
const spriteImages = shallowRef<StressSpriteImages>({
  runA: null,
  runB: null,
  jump: null,
  duck: null,
  crate: null,
  beam: null,
})

let frameHandle = 0
let previousFrame = 0
let obstacleSequence = 0
let spawnTimer = 0

const phaseLabel = computed(() => {
  if (phase.value === 'running') return '주행중'
  if (phase.value === 'crashed') return '충돌'
  return '준비됨'
})

const primaryActionLabel = computed(() => {
  if (phase.value === 'running') return '다시 시작'
  if (phase.value === 'crashed') return '다시 달리기'
  return '달리기 시작'
})

const leaderboardStateLabel = computed(() => {
  if (leaderboardTableMissing.value) return '준비중'
  if (leaderboardSaving.value) return '기록 저장 중'
  if (leaderboardLoading.value) return '불러오는 중'
  return '실시간'
})

const distanceLabel = computed(() => formatMeters(distance.value))
const bestScoreLabel = computed(() => formatMeters(bestScore.value))
const speedLabel = computed(() => `${Math.round(currentSpeed.value * 2.1)} km/h`)
const duckActive = computed(() => duckProgress.value > 0.58)
const currentLaneLabel = computed(() => `${Math.round(lanePosition.value) + 1}차선`)

function formatMeters(value: number) {
  return `${Math.floor(value)}m`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3)
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = (event) => reject(event)
    image.src = url
  })
}

async function preloadSprites() {
  try {
    const [runA, runB, jump, duck, crate, beam] = await Promise.all([
      loadImage(createSvgDataUrl(CAT_RUN_A_SVG)),
      loadImage(createSvgDataUrl(CAT_RUN_B_SVG)),
      loadImage(createSvgDataUrl(CAT_JUMP_SVG)),
      loadImage(createSvgDataUrl(CAT_DUCK_SVG)),
      loadImage(createSvgDataUrl(OBSTACLE_CRATE_SVG)),
      loadImage(createSvgDataUrl(OBSTACLE_BEAM_SVG)),
    ])

    spriteImages.value = { runA, runB, jump, duck, crate, beam }
  } catch (error) {
    console.error('Failed to preload stress runner sprites:', error)
  }
}

function getBestScoreStorageKey() {
  const userId = String(user.value.id || 'guest')
  return `goodforpat-runner-best:${userId}`
}

function readBestScore() {
  if (!import.meta.client) return
  const raw = window.localStorage.getItem(getBestScoreStorageKey())
  const parsed = Number(raw || 0)
  bestScore.value = Number.isFinite(parsed) ? parsed : 0
}

function persistBestScore() {
  if (!import.meta.client) return
  window.localStorage.setItem(getBestScoreStorageKey(), String(Math.floor(bestScore.value)))
}

function isMissingObjectError(error: any, objectName: string) {
  const code = String(error?.code || '').toUpperCase()
  const message = String(error?.message || '').toLowerCase()
  return code === '42P01' || code === '42883' || message.includes(objectName.toLowerCase())
}

async function loadLeaderboard() {
  leaderboardLoading.value = true
  try {
    const { data, error } = await supabase
      .from('stress_game_scores')
      .select('user_id, user_name, best_score, updated_at')
      .order('best_score', { ascending: false })
      .order('updated_at', { ascending: true })
      .limit(3)

    if (error) {
      if (isMissingObjectError(error, 'stress_game_scores')) {
        leaderboardTableMissing.value = true
        leaderboardRows.value = []
        return
      }
      throw error
    }

    leaderboardTableMissing.value = false
    leaderboardRows.value = (data || []).map((row: any, index: number) => ({
      rank: index + 1,
      userId: String(row.user_id || ''),
      userName: String(row.user_name || '이름 없음'),
      bestScore: Number(row.best_score || 0),
    }))

    if (user.value.id) {
      const { data: myRow, error: myError } = await supabase
        .from('stress_game_scores')
        .select('best_score')
        .eq('user_id', user.value.id)
        .maybeSingle()

      if (myError) {
        if (isMissingObjectError(myError, 'stress_game_scores')) {
          leaderboardTableMissing.value = true
          leaderboardRows.value = []
          return
        }
        throw myError
      }

      if (myRow?.best_score) {
        bestScore.value = Math.max(bestScore.value, Number(myRow.best_score || 0))
        persistBestScore()
      }
    }
  } catch (error) {
    console.error('Failed to load stress leaderboard:', error)
  } finally {
    leaderboardLoading.value = false
  }
}

async function persistLeaderboardScore(nextScore: number) {
  if (!user.value.id || leaderboardTableMissing.value) return
  if (nextScore <= 0) return

  leaderboardSaving.value = true
  try {
    const { error } = await supabase.rpc('submit_stress_game_score', {
      p_score: Math.floor(nextScore),
      p_user_name: user.value.name || '이름 없음',
    })

    if (error) {
      if (isMissingObjectError(error, 'stress_game_scores') || isMissingObjectError(error, 'submit_stress_game_score')) {
        leaderboardTableMissing.value = true
        return
      }
      throw error
    }

    bestScore.value = Math.max(bestScore.value, nextScore)
    persistBestScore()
    await loadLeaderboard()
  } catch (error) {
    console.error('Failed to save stress leaderboard score:', error)
  } finally {
    leaderboardSaving.value = false
  }
}

function createObstacle(): Obstacle {
  obstacleSequence += 1
  return {
    id: obstacleSequence,
    lane: Math.floor(Math.random() * 3),
    type: Math.random() > 0.48 ? 'crate' : 'beam',
    z: MAX_OBSTACLE_Z,
    passed: false,
  }
}

function spawnObstacle() {
  const blockedLanes = new Set(
    obstacles.value
      .filter((obstacle) => obstacle.z > MAX_OBSTACLE_Z - 28)
      .map((obstacle) => obstacle.lane),
  )

  const availableLanes = [0, 1, 2].filter((lane) => !blockedLanes.has(lane))
  if (!availableLanes.length) return

  const nextObstacle = createObstacle()
  nextObstacle.lane = availableLanes[Math.floor(Math.random() * availableLanes.length)]
  obstacles.value.push(nextObstacle)
}

function startJump() {
  if (phase.value !== 'running') return
  if (jumpOffset.value > 0 || duckActive.value) return
  jumpVelocity.value = 620
}

function holdDuck(active: boolean) {
  if (phase.value !== 'running') return
  if (jumpOffset.value > 0) {
    duckHeld.value = false
    return
  }
  if (!active && duckProgress.value > 0.36) {
    duckTimer.value = Math.max(duckTimer.value, 0.12)
  }
  duckHeld.value = active
}

function moveLane(direction: -1 | 1) {
  if (phase.value !== 'running') return
  targetLane.value = clamp(targetLane.value + direction, 0, 2)
}

function handleKeyDown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  if (event.key === 'ArrowLeft' || key === 'a') {
    event.preventDefault()
    moveLane(-1)
    return
  }
  if (event.key === 'ArrowRight' || key === 'd') {
    event.preventDefault()
    moveLane(1)
    return
  }
  if (event.key === 'ArrowUp' || key === 'w') {
    event.preventDefault()
    startJump()
    return
  }
  if (event.key === 'ArrowDown' || key === 's') {
    event.preventDefault()
    holdDuck(true)
  }
}

function handleKeyUp(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  if (event.key === 'ArrowDown' || key === 's') {
    duckHeld.value = false
  }
}

function focusCanvas() {
  canvasRef.value?.focus?.()
}

function resetDuckOnBlur() {
  duckHeld.value = false
}

function resetState() {
  distance.value = 0
  dodgeStreak.value = 0
  currentSpeed.value = BASE_SPEED
  targetLane.value = 1
  lanePosition.value = 1
  jumpOffset.value = 0
  jumpVelocity.value = 0
  duckHeld.value = false
  duckTimer.value = 0
  duckProgress.value = 0
  runTime.value = 0
  obstacles.value = []
  spawnTimer = 0
}

function stopLoop() {
  if (frameHandle) {
    window.cancelAnimationFrame(frameHandle)
    frameHandle = 0
  }
  previousFrame = 0
}

function finishRun() {
  const finalDistance = distance.value
  phase.value = 'crashed'
  duckHeld.value = false
  duckTimer.value = 0
  stopLoop()
  void persistLeaderboardScore(finalDistance)
  renderScene()
}

function startRun() {
  stopLoop()
  resetState()
  phase.value = 'running'
  renderScene()
  frameHandle = window.requestAnimationFrame(gameLoop)
}

function resetRun() {
  stopLoop()
  resetState()
  phase.value = 'idle'
  renderScene()
}

function handlePrimaryAction() {
  startRun()
}

function getProjectionForZ(z: number) {
  const normalized = 1 - clamp(z / MAX_OBSTACLE_Z, 0, 1)
  const progress = Math.pow(normalized, 1.55)
  const y = lerp(ROAD_HORIZON_Y, PLAYER_BASE_Y, progress)
  const roadWidth = lerp(170, 760, progress)
  const laneGap = roadWidth / 3
  return {
    progress,
    y,
    roadWidth,
    laneGap,
    roadLeft: CANVAS_WIDTH / 2 - roadWidth / 2,
  }
}

function getPlayerProjection() {
  const laneWorld = lanePosition.value - 1
  const playerScale = 1.08 + jumpOffset.value * 0.001
  const roadWidth = 760
  const centerX = CANVAS_WIDTH / 2 + laneWorld * (roadWidth / 3)
  return {
    x: centerX,
    y: PLAYER_BASE_Y - jumpOffset.value,
    scale: playerScale,
  }
}

function isCollision(obstacle: Obstacle) {
  const sameLane = Math.abs(obstacle.lane - lanePosition.value) < 0.34
  if (!sameLane) return false

  const collisionDepthMin = obstacle.type === 'beam' ? PLAYER_COLLISION_Z_MIN - 1.5 : PLAYER_COLLISION_Z_MIN
  const collisionDepthMax = obstacle.type === 'beam' ? PLAYER_COLLISION_Z_MAX + 2.5 : PLAYER_COLLISION_Z_MAX
  if (obstacle.z > collisionDepthMax || obstacle.z < collisionDepthMin) return false

  if (obstacle.type === 'crate') {
    return jumpOffset.value < 102
  }

  if (obstacle.type === 'beam') {
    return duckProgress.value < 0.72
  }

  return false
}

function updateGame(deltaSeconds: number) {
  currentSpeed.value = Math.min(MAX_SPEED, currentSpeed.value + deltaSeconds * 2.8)
  distance.value += currentSpeed.value * deltaSeconds
  runTime.value += deltaSeconds
  lanePosition.value += (targetLane.value - lanePosition.value) * Math.min(1, deltaSeconds * 10)

  if (jumpOffset.value > 0 || jumpVelocity.value > 0) {
    jumpOffset.value += jumpVelocity.value * deltaSeconds
    jumpVelocity.value -= 1450 * deltaSeconds
    if (jumpOffset.value <= 0) {
      jumpOffset.value = 0
      jumpVelocity.value = 0
    }
  }

  if (duckTimer.value > 0) {
    duckTimer.value = Math.max(0, duckTimer.value - deltaSeconds)
  }

  if (jumpOffset.value > 0) {
    duckHeld.value = false
  }

  const duckTarget = jumpOffset.value > 0 ? 0 : (duckHeld.value || duckTimer.value > 0 ? 1 : 0)
  duckProgress.value += (duckTarget - duckProgress.value) * Math.min(1, deltaSeconds * 14)

  spawnTimer += deltaSeconds
  const spawnInterval = Math.max(0.56, 1.15 - (currentSpeed.value - BASE_SPEED) * 0.016)
  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0
    spawnObstacle()
  }

  let crashed = false
  const nextObstacles: Obstacle[] = []

  for (const obstacle of obstacles.value) {
    const nextObstacle = {
      ...obstacle,
      z: obstacle.z - currentSpeed.value * deltaSeconds * 1.62,
    }

    if (!nextObstacle.passed && nextObstacle.z < 0) {
      nextObstacle.passed = true
      dodgeStreak.value += 1
    }

    if (isCollision(nextObstacle)) {
      crashed = true
    }

    if (nextObstacle.z > -0.4) {
      nextObstacles.push(nextObstacle)
    }
  }

  obstacles.value = nextObstacles

  if (crashed) {
    finishRun()
    return
  }

  renderScene()
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
}

function drawPixelBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  front: string,
  shadow: string,
) {
  const px = Math.round(x)
  const py = Math.round(y)
  const pw = Math.round(width)
  const ph = Math.round(height)
  ctx.fillStyle = shadow
  ctx.fillRect(px + 4, py + 4, pw, ph)
  ctx.fillStyle = front
  ctx.fillRect(px, py, pw, ph)
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (!image) return false
  ctx.drawImage(image, Math.round(x), Math.round(y), Math.round(width), Math.round(height))
  return true
}

function drawIsoBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  depth: number,
  front: string,
  side: string,
  top: string,
) {
  const px = Math.round(x)
  const py = Math.round(y)
  const pw = Math.round(width)
  const ph = Math.round(height)
  const pd = Math.round(depth)

  ctx.fillStyle = top
  ctx.beginPath()
  ctx.moveTo(px, py)
  ctx.lineTo(px + pd, py - pd)
  ctx.lineTo(px + pw + pd, py - pd)
  ctx.lineTo(px + pw, py)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = side
  ctx.beginPath()
  ctx.moveTo(px + pw, py)
  ctx.lineTo(px + pw + pd, py - pd)
  ctx.lineTo(px + pw + pd, py + ph - pd)
  ctx.lineTo(px + pw, py + ph)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = front
  ctx.fillRect(px, py, pw, ph)
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const skyGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
  skyGradient.addColorStop(0, '#dbeafe')
  skyGradient.addColorStop(0.42, '#eff6ff')
  skyGradient.addColorStop(1, '#f8fafc')
  ctx.fillStyle = skyGradient
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  ctx.fillStyle = 'rgba(59, 130, 246, 0.14)'
  ctx.beginPath()
  ctx.arc(820, 116, 78, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = 'rgba(34, 197, 94, 0.16)'
  ctx.beginPath()
  ctx.arc(190, 124, 56, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#cbd5e1'
  for (let i = 0; i < 7; i += 1) {
    const x = 70 + i * 132
    const width = 58 + (i % 3) * 16
    const height = 84 + (i % 4) * 18
    ctx.fillRect(x, ROAD_HORIZON_Y - height, width, height)
  }

  for (let i = 0; i < 10; i += 1) {
    const x = 24 + i * 104
    const y = 44 + (i % 2) * 18
    drawRoundedRect(ctx, x, y, 66, 18, 9, 'rgba(255,255,255,0.78)')
  }
}

function drawScenery(ctx: CanvasRenderingContext2D, offset: number) {
  for (let z = MAX_OBSTACLE_Z; z > 8; z -= 14) {
    const animatedZ = ((z - (offset * 0.7)) % MAX_OBSTACLE_Z + MAX_OBSTACLE_Z) % MAX_OBSTACLE_Z
    const projection = getProjectionForZ(animatedZ)
    const scale = lerp(0.18, 1.08, projection.progress)
    const leftX = projection.roadLeft - 36 * scale
    const rightX = projection.roadLeft + projection.roadWidth + 18 * scale
    const baseY = projection.y

    if (Math.floor(z / 14) % 2 === 0) {
      drawIsoBox(ctx, leftX, baseY - 40 * scale, 14 * scale, 40 * scale, 6 * scale, '#8b5cf6', '#5b21b6', '#c4b5fd')
      drawIsoBox(ctx, leftX - 12 * scale, baseY - 70 * scale, 36 * scale, 28 * scale, 8 * scale, '#34d399', '#0f766e', '#a7f3d0')

      drawIsoBox(ctx, rightX, baseY - 36 * scale, 14 * scale, 36 * scale, 6 * scale, '#92400e', '#78350f', '#fdba74')
      drawIsoBox(ctx, rightX - 10 * scale, baseY - 64 * scale, 34 * scale, 26 * scale, 8 * scale, '#22c55e', '#15803d', '#86efac')
    } else {
      drawIsoBox(ctx, leftX, baseY - 58 * scale, 14 * scale, 58 * scale, 6 * scale, '#94a3b8', '#475569', '#e2e8f0')
      drawIsoBox(ctx, leftX - 14 * scale, baseY - 88 * scale, 44 * scale, 24 * scale, 8 * scale, '#fef3c7', '#d97706', '#fde68a')

      drawIsoBox(ctx, rightX, baseY - 56 * scale, 14 * scale, 56 * scale, 6 * scale, '#94a3b8', '#475569', '#e2e8f0')
      drawIsoBox(ctx, rightX - 16 * scale, baseY - 86 * scale, 48 * scale, 24 * scale, 8 * scale, '#bfdbfe', '#2563eb', '#dbeafe')
    }
  }
}

function drawRoad(ctx: CanvasRenderingContext2D, stripeOffset: number) {
  const topWidth = 170
  const bottomWidth = 760
  const topLeft = CANVAS_WIDTH / 2 - topWidth / 2
  const topRight = CANVAS_WIDTH / 2 + topWidth / 2
  const bottomLeft = CANVAS_WIDTH / 2 - bottomWidth / 2
  const bottomRight = CANVAS_WIDTH / 2 + bottomWidth / 2

  ctx.fillStyle = '#4b5563'
  ctx.beginPath()
  ctx.moveTo(topLeft, ROAD_HORIZON_Y)
  ctx.lineTo(topRight, ROAD_HORIZON_Y)
  ctx.lineTo(bottomRight, ROAD_BOTTOM_Y)
  ctx.lineTo(bottomLeft, ROAD_BOTTOM_Y)
  ctx.closePath()
  ctx.fill()

  const asphaltGradient = ctx.createLinearGradient(0, ROAD_HORIZON_Y, 0, ROAD_BOTTOM_Y)
  asphaltGradient.addColorStop(0, '#5b6473')
  asphaltGradient.addColorStop(0.55, '#374151')
  asphaltGradient.addColorStop(1, '#1f2937')
  ctx.fillStyle = asphaltGradient
  ctx.beginPath()
  ctx.moveTo(topLeft + 8, ROAD_HORIZON_Y)
  ctx.lineTo(topRight - 8, ROAD_HORIZON_Y)
  ctx.lineTo(bottomRight - 12, ROAD_BOTTOM_Y)
  ctx.lineTo(bottomLeft + 12, ROAD_BOTTOM_Y)
  ctx.closePath()
  ctx.fill()

  for (let lane = 0; lane < 3; lane += 1) {
    const laneInsetTop = 12 + lane * ((topWidth - 24) / 3)
    const laneInsetBottom = 18 + lane * ((bottomWidth - 36) / 3)
    const nextTop = laneInsetTop + (topWidth - 24) / 3
    const nextBottom = laneInsetBottom + (bottomWidth - 36) / 3
    ctx.fillStyle = lane % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.08)'
    ctx.beginPath()
    ctx.moveTo(topLeft + laneInsetTop, ROAD_HORIZON_Y)
    ctx.lineTo(topLeft + nextTop, ROAD_HORIZON_Y)
    ctx.lineTo(bottomLeft + nextBottom, ROAD_BOTTOM_Y)
    ctx.lineTo(bottomLeft + laneInsetBottom, ROAD_BOTTOM_Y)
    ctx.closePath()
    ctx.fill()
  }

  ctx.fillStyle = '#86efac'
  ctx.beginPath()
  ctx.moveTo(0, ROAD_BOTTOM_Y)
  ctx.lineTo(bottomLeft, ROAD_BOTTOM_Y)
  ctx.lineTo(topLeft, ROAD_HORIZON_Y)
  ctx.lineTo(0, ROAD_HORIZON_Y)
  ctx.closePath()
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(CANVAS_WIDTH, ROAD_BOTTOM_Y)
  ctx.lineTo(bottomRight, ROAD_BOTTOM_Y)
  ctx.lineTo(topRight, ROAD_HORIZON_Y)
  ctx.lineTo(CANVAS_WIDTH, ROAD_HORIZON_Y)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#fef3c7'
  ctx.beginPath()
  ctx.moveTo(bottomLeft + 12, ROAD_BOTTOM_Y)
  ctx.lineTo(bottomLeft + 24, ROAD_BOTTOM_Y)
  ctx.lineTo(topLeft + 8, ROAD_HORIZON_Y)
  ctx.lineTo(topLeft + 3, ROAD_HORIZON_Y)
  ctx.closePath()
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(bottomRight - 24, ROAD_BOTTOM_Y)
  ctx.lineTo(bottomRight - 12, ROAD_BOTTOM_Y)
  ctx.lineTo(topRight - 3, ROAD_HORIZON_Y)
  ctx.lineTo(topRight - 8, ROAD_HORIZON_Y)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.beginPath()
  ctx.moveTo(CANVAS_WIDTH / 2 - 30, ROAD_HORIZON_Y)
  ctx.lineTo(CANVAS_WIDTH / 2 + 30, ROAD_HORIZON_Y)
  ctx.lineTo(CANVAS_WIDTH / 2 + 82, ROAD_BOTTOM_Y)
  ctx.lineTo(CANVAS_WIDTH / 2 - 82, ROAD_BOTTOM_Y)
  ctx.closePath()
  ctx.fill()

  for (let z = MAX_OBSTACLE_Z; z > 0; z -= 9) {
    const projection = getProjectionForZ(z)
    const next = getProjectionForZ(z - 4)
    const laneOneX = projection.roadLeft + projection.laneGap
    const laneTwoX = projection.roadLeft + projection.laneGap * 2
    const nextLaneOneX = next.roadLeft + next.laneGap
    const nextLaneTwoX = next.roadLeft + next.laneGap * 2
    const dashVisible = (Math.floor((z + stripeOffset * 0.34) / 9) % 2) === 0

    if (dashVisible) {
      ctx.fillStyle = 'rgba(255,255,255,0.86)'
      ctx.beginPath()
      ctx.moveTo(laneOneX - 3, projection.y)
      ctx.lineTo(laneOneX + 3, projection.y)
      ctx.lineTo(nextLaneOneX + 1, next.y)
      ctx.lineTo(nextLaneOneX - 1, next.y)
      ctx.closePath()
      ctx.fill()

      ctx.beginPath()
      ctx.moveTo(laneTwoX - 3, projection.y)
      ctx.lineTo(laneTwoX + 3, projection.y)
      ctx.lineTo(nextLaneTwoX + 1, next.y)
      ctx.lineTo(nextLaneTwoX - 1, next.y)
      ctx.closePath()
      ctx.fill()
    }
  }
}

function drawObstacle(ctx: CanvasRenderingContext2D, obstacle: Obstacle) {
  const projection = getProjectionForZ(obstacle.z)
  const centerX = projection.roadLeft + projection.laneGap * (obstacle.lane + 0.5)
  const scale = lerp(0.22, 1.2, projection.progress)
  const baseY = projection.y

  ctx.fillStyle = 'rgba(15, 23, 42, 0.14)'
  ctx.beginPath()
  ctx.ellipse(centerX, baseY + 4, 24 * scale, 8 * scale, 0, 0, Math.PI * 2)
  ctx.fill()

  if (obstacle.type === 'crate') {
    const width = 92 * scale
    const height = 92 * scale
    if (drawSprite(ctx, spriteImages.value.crate, centerX - width / 2, baseY - height + 12 * scale, width, height)) {
      return
    }

    drawIsoBox(ctx, centerX - 22 * scale, baseY - 34 * scale, 44 * scale, 34 * scale, 10 * scale, '#fb923c', '#9a3412', '#fdba74')
    drawPixelBlock(ctx, centerX - 15 * scale, baseY - 28 * scale, 30 * scale, 7 * scale, '#fef3c7', '#b45309')
    return
  }

  const width = 140 * scale
  const height = 108 * scale
  if (drawSprite(ctx, spriteImages.value.beam, centerX - width / 2, baseY - height + 14 * scale, width, height)) {
    return
  }

  const postWidth = 12 * scale
  const postHeight = 50 * scale
  const beamWidth = 64 * scale
  const beamHeight = 12 * scale
  drawIsoBox(ctx, centerX - beamWidth / 2, baseY - postHeight, postWidth, postHeight, 6 * scale, '#60a5fa', '#1d4ed8', '#bfdbfe')
  drawIsoBox(ctx, centerX + beamWidth / 2 - postWidth, baseY - postHeight, postWidth, postHeight, 6 * scale, '#60a5fa', '#1d4ed8', '#bfdbfe')
  drawIsoBox(ctx, centerX - beamWidth / 2, baseY - postHeight, beamWidth, beamHeight, 8 * scale, '#dbeafe', '#1e3a8a', '#ffffff')
}

function drawCat(ctx: CanvasRenderingContext2D) {
  const player = getPlayerProjection()
  const runSwing = Math.sin(runTime.value * 14)
  const bodyBob = Math.abs(runSwing) * 6 + duckProgress.value * 5
  const lean = (targetLane.value - lanePosition.value) * 0.16
  const bodyY = player.y - bodyBob + duckProgress.value * 10
  const jumpStretch = jumpOffset.value > 12 ? 1.08 : 1
  const jumpSquash = jumpOffset.value > 12 ? 0.92 : 1
  const laneShift = (targetLane.value - lanePosition.value) * 18
  const sprite =
    duckProgress.value > 0.52
      ? spriteImages.value.duck
      : jumpOffset.value > 10
        ? spriteImages.value.jump
        : Math.floor(runTime.value * 12) % 2 === 0
          ? spriteImages.value.runA
          : spriteImages.value.runB

  ctx.save()
  ctx.translate(player.x + laneShift, bodyY)
  ctx.rotate(lean)
  ctx.scale(player.scale * jumpSquash, player.scale * jumpStretch)

  ctx.fillStyle = 'rgba(15, 23, 42, 0.18)'
  ctx.beginPath()
  ctx.ellipse(0, PLAYER_BASE_Y - bodyY + 20, 48 - duckProgress.value * 8, 16 - duckProgress.value * 3, 0, 0, Math.PI * 2)
  ctx.fill()

  const spriteWidth = 176 - duckProgress.value * 18
  const spriteHeight = 176 - duckProgress.value * 46
  const spriteX = -spriteWidth / 2
  const spriteY = -spriteHeight + 26

  if (!drawSprite(ctx, sprite, spriteX, spriteY, spriteWidth, spriteHeight)) {
    drawIsoBox(ctx, -30, -54, 62, 34, 12, '#facc15', '#a16207', '#fde68a')
    drawIsoBox(ctx, -6, -86, 40, 34, 10, '#fff7ed', '#c2410c', '#ffffff')
  }

  ctx.restore()
}

function renderScene() {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  ctx.imageSmoothingEnabled = true

  drawBackground(ctx)
  drawScenery(ctx, distance.value)
  drawRoad(ctx, distance.value)

  const playerProjection = getPlayerProjection()
  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  ctx.beginPath()
  ctx.ellipse(playerProjection.x, PLAYER_BASE_Y + 8, 68, 18, 0, 0, Math.PI * 2)
  ctx.fill()

  for (let i = 0; i < 6; i += 1) {
    const speedLineY = 180 + i * 62 + ((distance.value * 3 + i * 11) % 52)
    const offset = (i % 2 === 0 ? -1 : 1) * (18 + i * 4)
    ctx.fillStyle = 'rgba(255,255,255,0.24)'
    ctx.fillRect(playerProjection.x + offset, speedLineY, 34 - i * 3, 3)
  }

  const sortedObstacles = [...obstacles.value].sort((a, b) => b.z - a.z)
  for (const obstacle of sortedObstacles) {
    drawObstacle(ctx, obstacle)
  }

  drawCat(ctx)

  const nextThreat = [...obstacles.value]
    .filter((obstacle) => obstacle.z > 16 && obstacle.z < 54)
    .sort((a, b) => a.z - b.z)[0]

  ctx.fillStyle = 'rgba(15, 23, 42, 0.12)'
  ctx.fillRect(24, 24, 196, 60)
  ctx.fillStyle = '#0f172a'
  ctx.font = '700 18px system-ui'
  ctx.fillText(`차선 ${Math.round(lanePosition.value) + 1}`, 40, 50)
  ctx.font = '600 14px system-ui'
  ctx.fillStyle = '#475569'
  ctx.fillText(duckActive.value ? '숙이는 중' : jumpOffset.value > 0 ? '점프 중' : '달리는 중', 40, 72)

  if (nextThreat) {
    drawRoundedRect(ctx, 774, 24, 202, 60, 18, 'rgba(255,255,255,0.82)')
    ctx.fillStyle = '#2563eb'
    ctx.font = '700 14px system-ui'
    ctx.fillText('다음 동작', 792, 46)
    ctx.fillStyle = '#0f172a'
    ctx.font = '800 20px system-ui'
    ctx.fillText(nextThreat.type === 'crate' ? '점프' : '숙이기', 792, 72)
    ctx.fillStyle = '#64748b'
    ctx.font = '600 13px system-ui'
    ctx.fillText(`${nextThreat.lane + 1}차선 장애물`, 878, 72)
  }
}

function gameLoop(timestamp: number) {
  if (phase.value !== 'running') return
  if (!previousFrame) previousFrame = timestamp

  const deltaSeconds = Math.min(0.032, (timestamp - previousFrame) / 1000)
  previousFrame = timestamp
  updateGame(deltaSeconds)

  if (phase.value === 'running') {
    frameHandle = window.requestAnimationFrame(gameLoop)
  }
}

onMounted(() => {
  readBestScore()
  void (async () => {
    await preloadSprites()
    renderScene()
    await loadLeaderboard()
  })()
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('blur', resetDuckOnBlur)
})

watch(
  () => user.value.id,
  async () => {
    bestScore.value = 0
    readBestScore()
    await loadLeaderboard()
  },
)

onBeforeUnmount(() => {
  stopLoop()
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('blur', resetDuckOnBlur)
})
</script>

<style scoped>
.stress-page {
  min-height: calc(100vh - 64px);
  position: relative;
  overflow: hidden;
  padding: 40px 28px 60px;
  background:
    radial-gradient(circle at top left, rgba(191, 219, 254, 0.8), transparent 30%),
    radial-gradient(circle at top right, rgba(167, 243, 208, 0.46), transparent 24%),
    linear-gradient(180deg, #f8fbff 0%, #f8fafc 100%);
}

.stress-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(18px);
  opacity: 0.72;
}

.stress-orb--blue {
  top: 70px;
  left: 40px;
  width: 180px;
  height: 180px;
  background: rgba(96, 165, 250, 0.25);
}

.stress-orb--mint {
  right: 68px;
  bottom: 90px;
  width: 220px;
  height: 220px;
  background: rgba(74, 222, 128, 0.18);
}

.stress-shell {
  position: relative;
  z-index: 1;
  width: min(1120px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 24px;
}

.stress-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.stress-topbar-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: #334155;
  text-decoration: none;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 12px 24px rgba(148, 163, 184, 0.12);
}

.stress-topbar-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 78px;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid rgba(191, 219, 254, 0.8);
  background: rgba(239, 246, 255, 0.95);
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
}

.stress-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  align-items: end;
}

.stress-copy {
  display: grid;
  gap: 12px;
}

.stress-eyebrow {
  color: #3b82f6;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.stress-title {
  color: #0f172a;
  font-size: clamp(2.6rem, 5vw, 4.4rem);
  line-height: 0.96;
  letter-spacing: -0.06em;
  font-weight: 900;
}

.stress-description {
  max-width: 660px;
  color: #64748b;
  font-size: 15px;
  line-height: 1.7;
}

.stress-guide {
  color: #94a3b8;
  font-size: 13px;
}

.stress-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.stress-primary-btn,
.stress-secondary-btn {
  border: 0;
  border-radius: 999px;
  padding: 14px 20px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
}

.stress-primary-btn {
  background: linear-gradient(135deg, #2563eb, #3b82f6 55%, #06b6d4);
  color: #fff;
  box-shadow: 0 18px 28px rgba(37, 99, 235, 0.25);
}

.stress-secondary-btn {
  background: rgba(255, 255, 255, 0.94);
  color: #475569;
  box-shadow: 0 10px 22px rgba(148, 163, 184, 0.12);
}

.stress-primary-btn:hover,
.stress-secondary-btn:hover {
  transform: translateY(-2px);
}

.stress-secondary-btn:disabled {
  cursor: default;
  opacity: 0.62;
  transform: none;
  box-shadow: none;
}

.stress-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.stress-stat {
  padding: 18px 20px;
  border-radius: 24px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 18px 38px rgba(148, 163, 184, 0.08);
}

.stress-stat-label {
  display: block;
  margin-bottom: 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.stress-stat-value {
  color: #0f172a;
  font-size: clamp(1.3rem, 3vw, 1.95rem);
  font-weight: 900;
  letter-spacing: -0.04em;
}

.runner-frame {
  display: grid;
  gap: 14px;
}

.runner-canvas-shell {
  position: relative;
  padding: 18px;
  border-radius: 34px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(226, 232, 240, 0.95);
  box-shadow: 0 28px 64px rgba(148, 163, 184, 0.14);
}

.runner-canvas-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  padding: 0 4px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.runner-canvas {
  display: block;
  width: 100%;
  aspect-ratio: 1000 / 620;
  border-radius: 28px;
  background: linear-gradient(180deg, #eef6ff 0%, #f8fafc 100%);
  outline: none;
}

.runner-overlay {
  position: absolute;
  left: 50%;
  bottom: 42px;
  transform: translateX(-50%);
  display: grid;
  gap: 8px;
  min-width: min(420px, calc(100% - 48px));
  padding: 18px 20px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 34px rgba(15, 23, 42, 0.12);
  text-align: center;
}

.runner-overlay-title {
  color: #0f172a;
  font-size: 18px;
  font-weight: 900;
}

.runner-overlay-copy {
  color: #64748b;
  font-size: 14px;
  line-height: 1.6;
}

.runner-mobile-controls {
  display: none;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.runner-control-btn {
  border: 0;
  border-radius: 22px;
  min-height: 54px;
  background: rgba(255, 255, 255, 0.94);
  color: #1f2937;
  font-size: 22px;
  font-weight: 900;
  box-shadow: 0 10px 24px rgba(148, 163, 184, 0.14);
}

.runner-control-btn--primary {
  background: linear-gradient(135deg, #2563eb, #38bdf8);
  color: #fff;
}

.stress-leaderboard {
  padding: 22px 24px;
  border-radius: 28px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 20px 44px rgba(148, 163, 184, 0.08);
  display: grid;
  gap: 16px;
}

.stress-leaderboard-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}

.stress-leaderboard-eyebrow {
  margin: 0 0 4px;
  color: #3b82f6;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.stress-leaderboard-title {
  margin: 0;
  color: #111827;
  font-size: clamp(1.2rem, 2vw, 1.45rem);
  font-weight: 900;
  letter-spacing: -0.03em;
}

.stress-leaderboard-state {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  padding: 8px 12px;
  border-radius: 999px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
}

.stress-leaderboard-empty {
  padding: 16px 18px;
  border-radius: 20px;
  background: #f8fafc;
  color: #64748b;
  font-size: 14px;
  line-height: 1.6;
}

.stress-leaderboard-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.stress-leaderboard-item {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 20px;
  background: #f8fafc;
  border: 1px solid rgba(226, 232, 240, 0.88);
}

.stress-leaderboard-item--me {
  background: #eff6ff;
  border-color: rgba(147, 197, 253, 0.9);
}

.stress-leaderboard-rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  background: #ffffff;
  color: #111827;
  font-size: 14px;
  font-weight: 900;
  box-shadow: inset 0 0 0 1px rgba(226, 232, 240, 0.8);
}

.stress-leaderboard-user {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.stress-leaderboard-name {
  color: #111827;
  font-size: 15px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stress-leaderboard-me {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.12);
  color: #2563eb;
  font-size: 11px;
  font-weight: 800;
}

.stress-leaderboard-score {
  color: #111827;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: -0.02em;
}

.stress-footnote {
  color: #94a3b8;
  font-size: 12px;
  text-align: center;
}

@media (max-width: 960px) {
  .stress-page {
    padding: 28px 18px 44px;
  }

  .stress-hero {
    grid-template-columns: minmax(0, 1fr);
  }

  .stress-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .runner-mobile-controls {
    display: grid;
  }

  .stress-leaderboard-header,
  .stress-topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .runner-canvas-shell {
    padding: 12px;
    border-radius: 26px;
  }

  .runner-overlay {
    left: 18px;
    right: 18px;
    bottom: 18px;
    min-width: auto;
    transform: none;
  }
}

@media (max-width: 560px) {
  .stress-stats {
    grid-template-columns: 1fr;
  }

  .stress-title {
    font-size: 2.3rem;
  }

  .stress-description {
    font-size: 14px;
  }
}
</style>
