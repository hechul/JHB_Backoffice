import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildClientConfig,
  parseEnvFile,
  restRequest,
} from './sync-master-data.mjs'

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url))
const APP_ROOT = resolve(SCRIPT_DIR, '..')
const DEFAULT_ENV = resolve(APP_ROOT, '.env')

function printHelp() {
  console.log(`
Usage:
  node scripts/seed-coupang-product-mappings.mjs

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

async function fetchProducts(targetConfig) {
  const rows = await restRequest(
    targetConfig,
    'products?select=product_id,product_name,option_name&deleted_at=is.null&order=product_name.asc,option_name.asc',
    { method: 'GET' },
  )
  return Array.isArray(rows) ? rows : []
}

function resolveInternalProduct(index, definition) {
  const key = `${String(definition.internalProductName || '').trim()}::${normalizeOption(definition.internalOptionName)}`
  const product = index.get(key)
  if (!product) {
    throw new Error(`Unable to find Coupang mapping target product: ${key}`)
  }
  return product
}

function buildDefinition(
  sourceFulfillmentType,
  commerceProductId,
  commerceProductName,
  commerceOptionName,
  internalProductName,
  internalOptionName,
  matchingMode = 'product_id_only',
) {
  return {
    sourceFulfillmentType,
    commerceProductId: String(commerceProductId),
    commerceProductName,
    commerceOptionName,
    internalProductName,
    internalOptionName,
    // 쿠팡 vendorItemId는 이미 SKU 고유값이라 옵션 텍스트 비교보다 product_id_only가 안전하다.
    matchingMode: 'product_id_only',
    canonicalVariant: normalizeOption(internalOptionName),
  }
}

const DEFINITIONS = [
  buildDefinition('marketplace', '94054315326', '미니 트릿백', '1개 민트', '미니 트릿백', '민트', 'product_id_option'),
  buildDefinition('rocket_growth', '94165163695', '미니 트릿백', '1개 민트', '미니 트릿백', '민트', 'product_id_option'),
  buildDefinition('marketplace', '94054315325', '미니 트릿백', '1개 퍼플', '미니 트릿백', '퍼플', 'product_id_option'),
  buildDefinition('rocket_growth', '94165163696', '미니 트릿백', '1개 퍼플', '미니 트릿백', '퍼플', 'product_id_option'),
  buildDefinition('marketplace', '94855858568', '미니 트릿백', '1개 민트+퍼플', '미니 트릿백', '자율', 'product_id_option'),
  buildDefinition('rocket_growth', '94855858569', '미니 트릿백', '1개 민트+퍼플', '미니 트릿백', '자율', 'product_id_option'),
  buildDefinition('rocket_growth', '94659189888', '미니 트릿백', '2개 민트', '미니 트릿백', '민트', 'product_id_option'),
  buildDefinition('rocket_growth', '94659189884', '미니 트릿백', '2개 퍼플', '미니 트릿백', '퍼플', 'product_id_option'),
  buildDefinition('rocket_growth', '94659189887', '미니 트릿백', '3개 민트', '미니 트릿백', '민트', 'product_id_option'),
  buildDefinition('rocket_growth', '94659189882', '미니 트릿백', '3개 퍼플', '미니 트릿백', '퍼플', 'product_id_option'),

  buildDefinition('marketplace', '94054186931', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '1개 블루', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '컬러: 블루', 'product_id_option'),
  buildDefinition('rocket_growth', '94165160425', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '1개 블루', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '컬러: 블루', 'product_id_option'),
  buildDefinition('marketplace', '94054186932', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '1개 옐로', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '컬러: 옐로', 'product_id_option'),
  buildDefinition('rocket_growth', '94165160424', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '1개 옐로', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '컬러: 옐로', 'product_id_option'),
  buildDefinition('marketplace', '94054186933', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '1개 퍼플', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '컬러: 퍼플', 'product_id_option'),
  buildDefinition('rocket_growth', '94165160423', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '1개 퍼플', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '컬러: 퍼플', 'product_id_option'),
  buildDefinition('marketplace', '94782798347', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '1개 블루+옐로', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '자율', 'product_id_option'),
  buildDefinition('rocket_growth', '94782798352', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '1개 블루+옐로', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '자율', 'product_id_option'),
  buildDefinition('marketplace', '94782798348', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '1개 블루+퍼플', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '자율', 'product_id_option'),
  buildDefinition('rocket_growth', '94782798354', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '1개 블루+퍼플', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '자율', 'product_id_option'),
  buildDefinition('marketplace', '94782798351', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '1개 옐로+퍼플', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '자율', 'product_id_option'),
  buildDefinition('rocket_growth', '94782798353', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '1개 옐로+퍼플', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '자율', 'product_id_option'),
  buildDefinition('marketplace', '94782798349', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '1개 블루+옐로+퍼플', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '자율', 'product_id_option'),
  buildDefinition('rocket_growth', '94782798350', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '1개 블루+옐로+퍼플', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '자율', 'product_id_option'),
  buildDefinition('rocket_growth', '94659189252', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '2개 블루', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '컬러: 블루', 'product_id_option'),
  buildDefinition('rocket_growth', '94659189253', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '2개 옐로', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '컬러: 옐로', 'product_id_option'),
  buildDefinition('rocket_growth', '94659189250', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '2개 퍼플', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '컬러: 퍼플', 'product_id_option'),
  buildDefinition('rocket_growth', '94659189248', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '3개 블루', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '컬러: 블루', 'product_id_option'),
  buildDefinition('rocket_growth', '94659189251', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '3개 옐로', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '컬러: 옐로', 'product_id_option'),
  buildDefinition('rocket_growth', '94659189249', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '3개 퍼플', '굿포펫 고양이 간식 디스펜서 (옐로/블루/퍼플)', '컬러: 퍼플', 'product_id_option'),

  buildDefinition('marketplace', '93923679757', '츄라잇', '14개 10g 종합영양제', '츄라잇', '데일리핏', 'product_id_option'),
  buildDefinition('rocket_growth', '94132827866', '츄라잇', '14개 10g 종합영양제', '츄라잇', '데일리핏', 'product_id_option'),
  buildDefinition('marketplace', '93923679755', '츄라잇', '14개 10g 유리너리+장건강', '츄라잇', '클린펫', 'product_id_option'),
  buildDefinition('rocket_growth', '94132827864', '츄라잇', '14개 10g 유리너리+장건강', '츄라잇', '클린펫', 'product_id_option'),
  buildDefinition('marketplace', '93923679756', '츄라잇', '14개 10g 눈물개선/눈건강', '츄라잇', '브라이트', 'product_id_option'),
  buildDefinition('rocket_growth', '94132827865', '츄라잇', '14개 10g 눈물개선/눈건강', '츄라잇', '브라이트', 'product_id_option'),
  buildDefinition('rocket_growth', '94363413994', '츄라잇', '28개 10g 종합영양제', '츄라잇', '데일리핏', 'product_id_option'),
  buildDefinition('rocket_growth', '94363413993', '츄라잇', '28개 10g 유리너리+장건강', '츄라잇', '클린펫', 'product_id_option'),
  buildDefinition('rocket_growth', '94363413992', '츄라잇', '28개 10g 눈물개선/눈건강', '츄라잇', '브라이트', 'product_id_option'),
  buildDefinition('rocket_growth', '94363315737', '츄라잇', '42개 10g 종합영양제', '츄라잇', '데일리핏', 'product_id_option'),
  buildDefinition('rocket_growth', '94363315736', '츄라잇', '42개 10g 유리너리+장건강', '츄라잇', '클린펫', 'product_id_option'),
  buildDefinition('rocket_growth', '94363315735', '츄라잇', '42개 10g 눈물개선/눈건강', '츄라잇', '브라이트', 'product_id_option'),
  buildDefinition('rocket_growth', '94879329297', '츄라잇', '84개 10g 종합영양제', '츄라잇', '데일리핏', 'product_id_option'),
  buildDefinition('rocket_growth', '94879329298', '츄라잇', '84개 10g 유리너리+장건강', '츄라잇', '클린펫', 'product_id_option'),
  buildDefinition('rocket_growth', '94879329299', '츄라잇', '84개 10g 눈물개선/눈건강', '츄라잇', '브라이트', 'product_id_option'),

  buildDefinition('marketplace', '93885445344', '이즈바이트', '1개 꿀고구마맛 91g', '이즈바이트', null, 'product_id_only'),
  buildDefinition('rocket_growth', '94165125993', '이즈바이트', '1개 꿀고구마맛 91g', '이즈바이트', null, 'product_id_only'),
  buildDefinition('rocket_growth', '94380472325', '이즈바이트', '2개 꿀고구마맛 91g', '이즈바이트', null, 'product_id_only'),
  buildDefinition('rocket_growth', '94879358700', '이즈바이트', '3개 꿀고구마맛 91g', '이즈바이트', null, 'product_id_only'),
  buildDefinition('rocket_growth', '94879358699', '이즈바이트', '4개 꿀고구마맛 91g', '이즈바이트', null, 'product_id_only'),

  buildDefinition('marketplace', '93885404452', '엔자이츄', '1개 꿀고구마맛 100g', '엔자이츄', null, 'product_id_only'),
  buildDefinition('rocket_growth', '94132809744', '엔자이츄', '1개 꿀고구마맛 100g', '엔자이츄', null, 'product_id_only'),
  buildDefinition('rocket_growth', '94380474419', '엔자이츄', '2개 꿀고구마맛 100g', '엔자이츄', null, 'product_id_only'),
  buildDefinition('rocket_growth', '94380474418', '엔자이츄', '3개 꿀고구마맛 100g', '엔자이츄', null, 'product_id_only'),
  buildDefinition('rocket_growth', '94854392237', '엔자이츄', '4개 꿀고구마맛 100g', '엔자이츄', null, 'product_id_only'),
  buildDefinition('rocket_growth', '94854392236', '엔자이츄', '5개 꿀고구마맛 100g', '엔자이츄', null, 'product_id_only'),
  buildDefinition('rocket_growth', '94854392235', '엔자이츄', '6개 꿀고구마맛 100g', '엔자이츄', null, 'product_id_only'),

  buildDefinition('marketplace', '93671525655', '케어푸', '1개 60g 장건강/유산균', '케어푸', null, 'product_id_only'),
  buildDefinition('rocket_growth', '94165127355', '케어푸', '1개 60g 장건강/유산균', '케어푸', null, 'product_id_only'),
  buildDefinition('rocket_growth', '94380487590', '케어푸', '2개 60g 장건강/유산균', '케어푸', null, 'product_id_only'),
  buildDefinition('rocket_growth', '94380487588', '케어푸', '3개 60g 장건강/유산균', '케어푸', null, 'product_id_only'),

  buildDefinition('marketplace', '91677910749', '애착트릿 3종', '단일상품', '애착트릿', '3종세트', 'product_id_option'),

  buildDefinition('marketplace', '91677888252', '애착트릿 치킨', '1개 치킨 100g', '애착트릿', '치킨', 'product_id_option'),
  buildDefinition('rocket_growth', '94311402237', '애착트릿 치킨', '1개 치킨 100g', '애착트릿', '치킨', 'product_id_option'),
  buildDefinition('rocket_growth', '94362822522', '애착트릿 치킨', '2개 치킨 100g', '애착트릿', '치킨', 'product_id_option'),
  buildDefinition('marketplace', '91677888261', '애착트릿 치킨', '3개 치킨 100g', '애착트릿', '치킨', 'product_id_option'),
  buildDefinition('rocket_growth', '94311402236', '애착트릿 치킨', '3개 치킨 100g', '애착트릿', '치킨', 'product_id_option'),
  buildDefinition('marketplace', '91677888265', '애착트릿 치킨', '6개 치킨 100g', '애착트릿', '치킨', 'product_id_option'),
  buildDefinition('rocket_growth', '94311402240', '애착트릿 치킨', '6개 치킨 100g', '애착트릿', '치킨', 'product_id_option'),
  buildDefinition('marketplace', '91677888256', '애착트릿 치킨', '12개 치킨 100g', '애착트릿', '치킨', 'product_id_option'),
  buildDefinition('rocket_growth', '94311402238', '애착트릿 치킨', '12개 치킨 100g', '애착트릿', '치킨', 'product_id_option'),
  buildDefinition('marketplace', '94285648516', '애착트릿 치킨', '1개 치킨 120g', '애착트릿', '치킨', 'product_id_option'),
  buildDefinition('rocket_growth', '94311402239', '애착트릿 치킨', '1개 치킨 120g', '애착트릿', '치킨', 'product_id_option'),
  buildDefinition('rocket_growth', '94492529867', '애착트릿 치킨', '2개 치킨 120g', '애착트릿', '치킨', 'product_id_option'),
  buildDefinition('marketplace', '94285648517', '애착트릿 치킨', '3개 치킨 120g', '애착트릿', '치킨', 'product_id_option'),
  buildDefinition('rocket_growth', '94311402234', '애착트릿 치킨', '3개 치킨 120g', '애착트릿', '치킨', 'product_id_option'),
  buildDefinition('marketplace', '94285648518', '애착트릿 치킨', '6개 치킨 120g', '애착트릿', '치킨', 'product_id_option'),
  buildDefinition('rocket_growth', '94311402235', '애착트릿 치킨', '6개 치킨 120g', '애착트릿', '치킨', 'product_id_option'),
  buildDefinition('marketplace', '94285648519', '애착트릿 치킨', '12개 치킨 120g', '애착트릿', '치킨', 'product_id_option'),
  buildDefinition('rocket_growth', '94311402233', '애착트릿 치킨', '12개 치킨 120g', '애착트릿', '치킨', 'product_id_option'),

  buildDefinition('marketplace', '91677861362', '애착트릿 연어', '1개 연어 90g', '애착트릿', '연어', 'product_id_option'),
  buildDefinition('rocket_growth', '94311465300', '애착트릿 연어', '1개 연어 90g', '애착트릿', '연어', 'product_id_option'),
  buildDefinition('rocket_growth', '94362984875', '애착트릿 연어', '2개 연어 90g', '애착트릿', '연어', 'product_id_option'),
  buildDefinition('marketplace', '91677861356', '애착트릿 연어', '3개 연어 90g', '애착트릿', '연어', 'product_id_option'),
  buildDefinition('rocket_growth', '94311465302', '애착트릿 연어', '3개 연어 90g', '애착트릿', '연어', 'product_id_option'),
  buildDefinition('marketplace', '91677861369', '애착트릿 연어', '6개 연어 90g', '애착트릿', '연어', 'product_id_option'),
  buildDefinition('rocket_growth', '94311465305', '애착트릿 연어', '6개 연어 90g', '애착트릿', '연어', 'product_id_option'),
  buildDefinition('marketplace', '91677861350', '애착트릿 연어', '12개 연어 90g', '애착트릿', '연어', 'product_id_option'),
  buildDefinition('rocket_growth', '94311465306', '애착트릿 연어', '12개 연어 90g', '애착트릿', '연어', 'product_id_option'),
  buildDefinition('marketplace', '94285608620', '애착트릿 연어', '1개 연어 110g', '애착트릿', '연어', 'product_id_option'),
  buildDefinition('rocket_growth', '94311465299', '애착트릿 연어', '1개 연어 110g', '애착트릿', '연어', 'product_id_option'),
  buildDefinition('rocket_growth', '94380460125', '애착트릿 연어', '2개 연어 110g', '애착트릿', '연어', 'product_id_option'),
  buildDefinition('marketplace', '94285608619', '애착트릿 연어', '3개 연어 110g', '애착트릿', '연어', 'product_id_option'),
  buildDefinition('rocket_growth', '94311465304', '애착트릿 연어', '3개 연어 110g', '애착트릿', '연어', 'product_id_option'),
  buildDefinition('marketplace', '94285608622', '애착트릿 연어', '6개 연어 110g', '애착트릿', '연어', 'product_id_option'),
  buildDefinition('rocket_growth', '94311465301', '애착트릿 연어', '6개 연어 110g', '애착트릿', '연어', 'product_id_option'),
  buildDefinition('marketplace', '94285608621', '애착트릿 연어', '12개 연어 110g', '애착트릿', '연어', 'product_id_option'),
  buildDefinition('rocket_growth', '94311465303', '애착트릿 연어', '12개 연어 110g', '애착트릿', '연어', 'product_id_option'),

  buildDefinition('marketplace', '91677861786', '애착트릿 북어', '1개 북어 80g', '애착트릿', '북어', 'product_id_option'),
  buildDefinition('rocket_growth', '94311404991', '애착트릿 북어', '1개 북어 80g', '애착트릿', '북어', 'product_id_option'),
  buildDefinition('marketplace', '91677861797', '애착트릿 북어', '3개 북어 80g', '애착트릿', '북어', 'product_id_option'),
  buildDefinition('rocket_growth', '94311404989', '애착트릿 북어', '3개 북어 80g', '애착트릿', '북어', 'product_id_option'),
  buildDefinition('marketplace', '91677861803', '애착트릿 북어', '6개 북어 80g', '애착트릿', '북어', 'product_id_option'),
  buildDefinition('rocket_growth', '94311404992', '애착트릿 북어', '6개 북어 80g', '애착트릿', '북어', 'product_id_option'),
  buildDefinition('marketplace', '91677861791', '애착트릿 북어', '12개 북어 80g', '애착트릿', '북어', 'product_id_option'),
  buildDefinition('rocket_growth', '94311404986', '애착트릿 북어', '12개 북어 80g', '애착트릿', '북어', 'product_id_option'),
  buildDefinition('marketplace', '94285626060', '애착트릿 북어', '1개 북어 100g', '애착트릿', '북어', 'product_id_option'),
  buildDefinition('rocket_growth', '94311404987', '애착트릿 북어', '1개 북어 100g', '애착트릿', '북어', 'product_id_option'),
  buildDefinition('rocket_growth', '94380451365', '애착트릿 북어', '2개 북어 100g', '애착트릿', '북어', 'product_id_option'),
  buildDefinition('marketplace', '94285626059', '애착트릿 북어', '3개 북어 100g', '애착트릿', '북어', 'product_id_option'),
  buildDefinition('rocket_growth', '94311404988', '애착트릿 북어', '3개 북어 100g', '애착트릿', '북어', 'product_id_option'),
  buildDefinition('marketplace', '94285626057', '애착트릿 북어', '6개 북어 100g', '애착트릿', '북어', 'product_id_option'),
  buildDefinition('rocket_growth', '94311404990', '애착트릿 북어', '6개 북어 100g', '애착트릿', '북어', 'product_id_option'),
  buildDefinition('marketplace', '94285626058', '애착트릿 북어', '12개 북어 100g', '애착트릿', '북어', 'product_id_option'),
  buildDefinition('rocket_growth', '94311404993', '애착트릿 북어', '12개 북어 100g', '애착트릿', '북어', 'product_id_option'),
]

function buildRows(products) {
  const productIndex = buildProductIndex(products)

  return DEFINITIONS.map((definition) => {
    const product = resolveInternalProduct(productIndex, definition)
    return {
      source_channel: 'coupang',
      source_fulfillment_type: definition.sourceFulfillmentType,
      source_account_key: 'default',
      commerce_product_id: definition.commerceProductId,
      commerce_option_code: '',
      commerce_product_name: definition.commerceProductName,
      commerce_option_name: definition.commerceOptionName || '',
      internal_product_id: product.product_id,
      matching_mode: definition.matchingMode,
      canonical_variant: definition.canonicalVariant,
      rule_json: {},
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
  const rows = buildRows(products)

  console.log(`[coupang-mapping-seed] products=${products.length} rows=${rows.length} dryRun=${args.dryRun}`)

  if (args.dryRun) {
    console.log(JSON.stringify(rows.slice(0, 10), null, 2))
    return
  }

  await restRequest(
    targetConfig,
    'commerce_product_mappings?on_conflict=source_channel,source_fulfillment_type,source_account_key,commerce_product_id,commerce_option_code,canonical_variant',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    },
  )

  console.log(`[coupang-mapping-seed] upserted ${rows.length} rows`)
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}

export {
  DEFINITIONS,
  buildRows,
}
