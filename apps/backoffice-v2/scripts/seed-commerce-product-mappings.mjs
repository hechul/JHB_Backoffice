import { resolve } from 'node:path'

import {
  buildClientConfig,
  parseEnvFile,
  restRequest,
} from './sync-master-data.mjs'

const DEFAULT_ENV = resolve(process.cwd(), '.env')

const ATTACH_TREAT_VARIANT_RULES = {
  북어: { variantKeywords: ['북어', '황태'], preferOptionInfo: true },
  연어: { variantKeywords: ['연어'], preferOptionInfo: true },
  치킨: { variantKeywords: ['치킨', '닭가슴살', '닭고기'], preferOptionInfo: true },
}

const SEED_DEFINITIONS = [
  { commerceProductId: '11749388704', productName: '두부모래', optionName: null, matchingMode: 'product_id_only' },
  { commerceProductId: '11750103214', productName: '두부모래', optionName: null, matchingMode: 'product_id_only' },
  { commerceProductId: '11750107226', productName: '두부모래', optionName: null, matchingMode: 'product_id_only' },
  { commerceProductId: '12320752331', productName: '케어푸', optionName: null, matchingMode: 'product_id_only' },
  { commerceProductId: '13041293177', productName: '케어푸', optionName: null, matchingMode: 'product_id_only' },
  { commerceProductId: '12565154404', productName: '이즈바이트', optionName: null, matchingMode: 'product_id_only' },
  { commerceProductId: '13035043593', productName: '이즈바이트', optionName: null, matchingMode: 'product_id_only' },
  { commerceProductId: '13035043594', productName: '이즈바이트', optionName: null, matchingMode: 'product_id_only' },
  { commerceProductId: '12565223228', productName: '엔자이츄', optionName: null, matchingMode: 'product_id_only' },
  { commerceProductId: '13031643891', productName: '엔자이츄', optionName: null, matchingMode: 'product_id_only' },
  { commerceProductId: '13031643892', productName: '엔자이츄', optionName: null, matchingMode: 'product_id_only' },

  { commerceProductId: '12417368947', productName: '츄라잇', optionName: '데일리핏', matchingMode: 'product_id_option', canonicalVariant: '데일리핏' },
  { commerceProductId: '12417368947', productName: '츄라잇', optionName: '브라이트', matchingMode: 'product_id_option', canonicalVariant: '브라이트' },
  { commerceProductId: '12417368947', productName: '츄라잇', optionName: '클린펫', matchingMode: 'product_id_option', canonicalVariant: '클린펫' },

  { commerceProductId: '13074780587', productName: '츄라잇', optionName: '맛 선택: 데일리펫(참치) 1개 / 맛 선택 2: 데일리펫(참치) 1개 / 맛 선택 3: 데일리펫(참치) 1개', matchingMode: 'product_id_option', canonicalVariant: '맛 선택: 데일리펫(참치) 1개 / 맛 선택 2: 데일리펫(참치) 1개 / 맛 선택 3: 데일리펫(참치) 1개' },
  { commerceProductId: '13074780587', productName: '츄라잇', optionName: '맛 선택: 데일리펫(참치) 1개 / 맛 선택 2: 데일리펫(참치) 1개 / 맛 선택 3: 브라이트(연어) 1개', matchingMode: 'product_id_option', canonicalVariant: '맛 선택: 데일리펫(참치) 1개 / 맛 선택 2: 데일리펫(참치) 1개 / 맛 선택 3: 브라이트(연어) 1개' },
  { commerceProductId: '13074780587', productName: '츄라잇', optionName: '맛 선택: 데일리펫(참치) 1개 / 맛 선택 2: 브라이트(연어) 1개 / 맛 선택 3: 브라이트(연어) 1개', matchingMode: 'product_id_option', canonicalVariant: '맛 선택: 데일리펫(참치) 1개 / 맛 선택 2: 브라이트(연어) 1개 / 맛 선택 3: 브라이트(연어) 1개' },
  { commerceProductId: '13074780587', productName: '츄라잇', optionName: '맛 선택: 데일리펫(참치) 1개 / 맛 선택 2: 브라이트(연어) 1개 / 맛 선택 3: 클린펫(닭가슴살) 1개', matchingMode: 'product_id_option', canonicalVariant: '맛 선택: 데일리펫(참치) 1개 / 맛 선택 2: 브라이트(연어) 1개 / 맛 선택 3: 클린펫(닭가슴살) 1개' },
  { commerceProductId: '13074780587', productName: '츄라잇', optionName: '맛 선택: 브라이트(연어) 1개 / 맛 선택 2: 브라이트(연어) 1개 / 맛 선택 3: 브라이트(연어) 1개', matchingMode: 'product_id_option', canonicalVariant: '맛 선택: 브라이트(연어) 1개 / 맛 선택 2: 브라이트(연어) 1개 / 맛 선택 3: 브라이트(연어) 1개' },
  { commerceProductId: '13074780587', productName: '츄라잇', optionName: '맛 선택: 브라이트(연어) 1개 / 맛 선택 2: 클린펫(닭가슴살) 1개 / 맛 선택 3: 클린펫(닭가슴살) 1개', matchingMode: 'product_id_option', canonicalVariant: '맛 선택: 브라이트(연어) 1개 / 맛 선택 2: 클린펫(닭가슴살) 1개 / 맛 선택 3: 클린펫(닭가슴살) 1개' },
  { commerceProductId: '13074780587', productName: '츄라잇', optionName: '맛 선택: 클린펫(닭가슴살) 1개 / 맛 선택 2: 데일리펫(참치) 1개 / 맛 선택 3: 데일리펫(참치) 1개', matchingMode: 'product_id_option', canonicalVariant: '맛 선택: 클린펫(닭가슴살) 1개 / 맛 선택 2: 데일리펫(참치) 1개 / 맛 선택 3: 데일리펫(참치) 1개' },

  { commerceProductId: '12668256525', productName: '전제품 맛보기 샘플', optionName: '샘플: 애착트릿 3종', matchingMode: 'product_id_option', canonicalVariant: '애착트릿 3종' },
  { commerceProductId: '12668256525', productName: '전제품 맛보기 샘플', optionName: '샘플: 엔자이츄 츄잉 덴탈껌 1개', matchingMode: 'product_id_option', canonicalVariant: '엔자이츄' },
  { commerceProductId: '12668256525', productName: '전제품 맛보기 샘플', optionName: '샘플: 이즈바이트 버블 덴탈껌 1개', matchingMode: 'product_id_option', canonicalVariant: '이즈바이트' },
  { commerceProductId: '12668256525', productName: '전제품 맛보기 샘플', optionName: '샘플: 츄라잇 3종', matchingMode: 'product_id_option', canonicalVariant: '츄라잇 3종' },
  { commerceProductId: '12668256525', productName: '전제품 맛보기 샘플', optionName: '샘플: 케어푸 강아지 유산균 3개', matchingMode: 'product_id_option', canonicalVariant: '케어푸' },

  { commerceProductId: '12668454235', productName: '도시락 샘플팩', optionName: '옵션: 고양이 도시락', matchingMode: 'product_id_option', canonicalVariant: '고양이용' },

  { commerceProductId: '12668877332', productName: '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', optionName: '컬러: 옐로', matchingMode: 'product_id_option', canonicalVariant: '옐로' },
  { commerceProductId: '12668877332', productName: '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', optionName: '컬러: 블루', matchingMode: 'product_id_option', canonicalVariant: '블루' },
  { commerceProductId: '12668877332', productName: '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', optionName: '컬러: 퍼플', matchingMode: 'product_id_option', canonicalVariant: '퍼플' },

  { commerceProductId: '12673164727', productName: '미니 트릿백', optionName: '민트', matchingMode: 'product_id_option', canonicalVariant: '민트' },
  { commerceProductId: '12673164727', productName: '미니 트릿백', optionName: '퍼플', matchingMode: 'product_id_option', canonicalVariant: '퍼플' },

  { commerceProductId: '12825519864', productName: '애착트릿', optionName: '북어', matchingMode: 'name_option_rule', canonicalVariant: '북어', ruleJson: ATTACH_TREAT_VARIANT_RULES.북어 },
  { commerceProductId: '12825519864', productName: '애착트릿', optionName: '연어', matchingMode: 'name_option_rule', canonicalVariant: '연어', ruleJson: ATTACH_TREAT_VARIANT_RULES.연어 },
  { commerceProductId: '12825519864', productName: '애착트릿', optionName: '치킨', matchingMode: 'name_option_rule', canonicalVariant: '치킨', ruleJson: ATTACH_TREAT_VARIANT_RULES.치킨 },
  { commerceProductId: '12825541776', productName: '애착트릿', optionName: '북어', matchingMode: 'name_option_rule', canonicalVariant: '북어', ruleJson: ATTACH_TREAT_VARIANT_RULES.북어 },
  { commerceProductId: '12825541776', productName: '애착트릿', optionName: '연어', matchingMode: 'name_option_rule', canonicalVariant: '연어', ruleJson: ATTACH_TREAT_VARIANT_RULES.연어 },
  { commerceProductId: '12825541776', productName: '애착트릿', optionName: '치킨', matchingMode: 'name_option_rule', canonicalVariant: '치킨', ruleJson: ATTACH_TREAT_VARIANT_RULES.치킨 },
  { commerceProductId: '12825547641', productName: '애착트릿', optionName: '북어', matchingMode: 'name_option_rule', canonicalVariant: '북어', ruleJson: ATTACH_TREAT_VARIANT_RULES.북어 },
  { commerceProductId: '12825547641', productName: '애착트릿', optionName: '연어', matchingMode: 'name_option_rule', canonicalVariant: '연어', ruleJson: ATTACH_TREAT_VARIANT_RULES.연어 },
  { commerceProductId: '12825547641', productName: '애착트릿', optionName: '치킨', matchingMode: 'name_option_rule', canonicalVariant: '치킨', ruleJson: ATTACH_TREAT_VARIANT_RULES.치킨 },
  { commerceProductId: '12825618625', productName: '애착트릿', optionName: '3종세트', matchingMode: 'product_id_only', canonicalVariant: '3종세트' },

  { commerceProductId: '11034170709', productName: '동결건조(리뉴얼전)', optionName: '북어', matchingMode: 'name_option_rule', canonicalVariant: '북어', ruleJson: ATTACH_TREAT_VARIANT_RULES.북어 },
  { commerceProductId: '11034170709', productName: '동결건조(리뉴얼전)', optionName: '연어', matchingMode: 'name_option_rule', canonicalVariant: '연어', ruleJson: ATTACH_TREAT_VARIANT_RULES.연어 },
  { commerceProductId: '11034170709', productName: '동결건조(리뉴얼전)', optionName: '치킨', matchingMode: 'name_option_rule', canonicalVariant: '치킨', ruleJson: ATTACH_TREAT_VARIANT_RULES.치킨 },
  { commerceProductId: '11034374158', productName: '동결건조(리뉴얼전)', optionName: '북어', matchingMode: 'name_option_rule', canonicalVariant: '북어', ruleJson: ATTACH_TREAT_VARIANT_RULES.북어 },
  { commerceProductId: '11034374158', productName: '동결건조(리뉴얼전)', optionName: '연어', matchingMode: 'name_option_rule', canonicalVariant: '연어', ruleJson: ATTACH_TREAT_VARIANT_RULES.연어 },
  { commerceProductId: '11034374158', productName: '동결건조(리뉴얼전)', optionName: '치킨', matchingMode: 'name_option_rule', canonicalVariant: '치킨', ruleJson: ATTACH_TREAT_VARIANT_RULES.치킨 },
  { commerceProductId: '11034381845', productName: '동결건조(리뉴얼전)', optionName: '북어', matchingMode: 'name_option_rule', canonicalVariant: '북어', ruleJson: ATTACH_TREAT_VARIANT_RULES.북어 },
  { commerceProductId: '11034381845', productName: '동결건조(리뉴얼전)', optionName: '연어', matchingMode: 'name_option_rule', canonicalVariant: '연어', ruleJson: ATTACH_TREAT_VARIANT_RULES.연어 },
  { commerceProductId: '11034381845', productName: '동결건조(리뉴얼전)', optionName: '치킨', matchingMode: 'name_option_rule', canonicalVariant: '치킨', ruleJson: ATTACH_TREAT_VARIANT_RULES.치킨 },
  { commerceProductId: '11687327189', productName: '동결건조(리뉴얼전)', optionName: '북어', matchingMode: 'name_option_rule', canonicalVariant: '북어', ruleJson: ATTACH_TREAT_VARIANT_RULES.북어 },
  { commerceProductId: '11687327189', productName: '동결건조(리뉴얼전)', optionName: '연어', matchingMode: 'name_option_rule', canonicalVariant: '연어', ruleJson: ATTACH_TREAT_VARIANT_RULES.연어 },
  { commerceProductId: '11687327189', productName: '동결건조(리뉴얼전)', optionName: '치킨', matchingMode: 'name_option_rule', canonicalVariant: '치킨', ruleJson: ATTACH_TREAT_VARIANT_RULES.치킨 },
]

function printHelp() {
  console.log(`
Usage:
  node scripts/seed-commerce-product-mappings.mjs

Options:
  --env=PATH      Env file path (default: ./.env)
  --dry-run       Build rows without DB writes
  --help          Show this help
`.trim())
}

function parseArgs(argv) {
  const args = {
    envPath: DEFAULT_ENV,
    dryRun: false,
    help: false,
  }

  for (const rawArg of argv) {
    if (rawArg === '--dry-run') {
      args.dryRun = true
      continue
    }
    if (rawArg === '--help' || rawArg === '-h') {
      args.help = true
      continue
    }
    if (rawArg.startsWith('--env=')) {
      args.envPath = resolve(process.cwd(), rawArg.slice('--env='.length))
      continue
    }
    throw new Error(`Unknown argument: ${rawArg}`)
  }

  return args
}

async function fetchProducts(targetConfig) {
  const rows = await restRequest(
    targetConfig,
    'products?select=product_id,product_name,option_name&deleted_at=is.null&order=product_name.asc,option_name.asc',
    { method: 'GET' },
  )
  return Array.isArray(rows) ? rows : []
}

function normalizeOption(value) {
  const normalized = String(value ?? '').trim()
  return normalized.length > 0 ? normalized : ''
}

function buildProductIndex(products) {
  const index = new Map()
  for (const product of products) {
    const key = `${String(product.product_name || '').trim()}::${normalizeOption(product.option_name)}`
    index.set(key, product)
  }
  return index
}

function resolveInternalProduct(index, definition) {
  const key = `${String(definition.productName || '').trim()}::${normalizeOption(definition.optionName)}`
  const product = index.get(key)
  if (!product) {
    throw new Error(`Unable to find product for mapping seed: ${key}`)
  }
  return product
}

function buildSeedRows(products) {
  const productIndex = buildProductIndex(products)
  return SEED_DEFINITIONS.map((definition) => {
    const product = resolveInternalProduct(productIndex, definition)
    return {
      source_channel: 'naver',
      source_account_key: 'default',
      commerce_product_id: definition.commerceProductId,
      commerce_option_code: String(definition.commerceOptionCode || '').trim(),
      commerce_product_name: definition.commerceProductName || definition.productName,
      commerce_option_name: definition.commerceOptionName || normalizeOption(definition.optionName),
      internal_product_id: product.product_id,
      matching_mode: definition.matchingMode,
      canonical_variant: String(definition.canonicalVariant || '').trim(),
      rule_json: definition.ruleJson || {},
      mapping_source: 'imported',
      priority: 10,
      is_active: true,
      last_seen_at: new Date().toISOString(),
    }
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const env = await parseEnvFile(args.envPath)
  const targetConfig = buildClientConfig(env, 'target')
  const products = await fetchProducts(targetConfig)
  const rows = buildSeedRows(products)

  console.log(`[commerce-mapping-seed] products=${products.length} rows=${rows.length} dryRun=${args.dryRun}`)

  if (args.dryRun) {
    console.log(JSON.stringify(rows.slice(0, 10), null, 2))
    return
  }

  await restRequest(
    targetConfig,
    'commerce_product_mappings?on_conflict=source_channel,source_account_key,commerce_product_id,commerce_option_code,canonical_variant',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    },
  )

  console.log(`[commerce-mapping-seed] upserted ${rows.length} rows`)
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}

export {
  SEED_DEFINITIONS,
  buildSeedRows,
  buildProductIndex,
  normalizeOption,
}
