export type ProductStageValue = 1 | 2 | 3 | 4 | null
export type CustomerStageCode = 'Entry' | 'Growth' | 'Core' | 'Premium' | 'Other'

const PRODUCT_STAGE_LABELS: Record<Exclude<ProductStageValue, null>, string> = {
  1: '입문',
  2: '성장',
  3: '핵심',
  4: '프리미엄',
}

const CUSTOMER_STAGE_LABELS: Record<CustomerStageCode, string> = {
  Entry: '입문',
  Growth: '성장',
  Core: '핵심',
  Premium: '프리미엄',
  Other: '기타',
}

const PRODUCT_STAGE_TO_CODE: Record<Exclude<ProductStageValue, null>, CustomerStageCode> = {
  1: 'Entry',
  2: 'Growth',
  3: 'Core',
  4: 'Premium',
}

const CUSTOMER_STAGE_TO_VALUE: Record<Exclude<CustomerStageCode, 'Other'>, number> = {
  Entry: 1,
  Growth: 2,
  Core: 3,
  Premium: 4,
}

export function productStageLabel(stage: number | null | undefined): string {
  if (stage === null || stage === undefined) return '기타'
  return PRODUCT_STAGE_LABELS[stage as Exclude<ProductStageValue, null>] || '-'
}

export function customerStageLabel(stage: string | null | undefined): string {
  if (!stage) return '기타'
  return CUSTOMER_STAGE_LABELS[stage as CustomerStageCode] || stage
}

export function stageCodeFromValue(stage: number | null | undefined): CustomerStageCode {
  if (stage === null || stage === undefined) return 'Other'
  return PRODUCT_STAGE_TO_CODE[stage as Exclude<ProductStageValue, null>] || 'Other'
}

export function stageValueFromCode(stage: string | null | undefined): number | null {
  if (!stage) return null
  return CUSTOMER_STAGE_TO_VALUE[stage as Exclude<CustomerStageCode, 'Other'>] || null
}

export function customerStagePercent(stage: string | null | undefined): number {
  const value = stageValueFromCode(stage)
  if (!value) return 0
  return value * 25
}

export function highestCustomerStage(stages: Array<number | null | undefined>): CustomerStageCode {
  let maxStage: number | null = null
  for (const stage of stages) {
    if (stage === null || stage === undefined) continue
    if (maxStage === null || stage > maxStage) maxStage = stage
  }
  return stageCodeFromValue(maxStage)
}

export function progressiveCustomerStage(stageEvents: Array<number | null | undefined>): CustomerStageCode {
  if (!stageEvents.length) return 'Other'

  let currentStage = 1
  let hasPurchase = false

  for (const rawStage of stageEvents) {
    const observedStage = Number.isFinite(Number(rawStage)) ? Number(rawStage) : null

    if (!hasPurchase) {
      hasPurchase = true
      currentStage = 1
      continue
    }

    if (currentStage === 1 && observedStage !== null && observedStage >= 2) {
      currentStage = 2
      continue
    }

    if (currentStage === 2 && observedStage !== null && observedStage >= 3) {
      currentStage = 3
      continue
    }

    if (currentStage === 3 && observedStage !== null && observedStage >= 4) {
      currentStage = 4
    }
  }

  return stageCodeFromValue(currentStage)
}
