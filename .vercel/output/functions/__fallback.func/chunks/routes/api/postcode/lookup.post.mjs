import { d as defineEventHandler, u as useRuntimeConfig, r as readBody, c as createError } from '../../../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';

function findInlinePostcode(address) {
  const matched = String(address || "").trim().match(/(?:^|\s|\(|\[)(\d{5})(?:\)|\]|\s|$)/);
  return (matched == null ? void 0 : matched[1]) || "";
}
function normalizeAddress(address) {
  return String(address || "").replace(/^\s*[\[(]?\d{5}[\])]?\s+/, "").replace(/^대한민국\s+/u, "").replace(/[\r\n\t]+/g, " ").replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
}
function stripParentheses(address) {
  return String(address || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}
function stripUnitDetail(address) {
  return String(address || "").replace(/\/.*$/, "").replace(/,\s*[^,]+$/, "").replace(/\s+-\s+.*$/, "").replace(/\s+\d+동\s*\d+호.*$/u, "").replace(/\s+\d+동.*$/u, "").replace(/\s+\d+호.*$/u, "").replace(/\s+\d+층.*$/u, "").replace(/\s+상세주소.*$/u, "").replace(/\s+/g, " ").trim();
}
function shortenTokenAddress(address, tokenCount = 5) {
  const tokens = String(address || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= tokenCount) return tokens.join(" ");
  return tokens.slice(0, tokenCount).join(" ");
}
function buildAddressCandidates(rawAddress) {
  const base = normalizeAddress(rawAddress);
  const noParen = stripParentheses(base);
  const noUnit = stripUnitDetail(noParen);
  const noComma = noUnit.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const shortened6 = shortenTokenAddress(noComma, 6);
  const shortened5 = shortenTokenAddress(noComma, 5);
  const shortened4 = shortenTokenAddress(noComma, 4);
  const candidates = [base, noParen, noUnit, noComma, shortened6, shortened5, shortened4].map((value) => value.trim()).filter((value) => value.length >= 6);
  return Array.from(new Set(candidates));
}
function normalizePostcode(value) {
  const digits = String(value || "").replace(/[^0-9]/g, "");
  return digits.length === 5 ? digits : "";
}
async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
const lookup_post = defineEventHandler(async (event) => {
  var _a, _b, _c;
  const runtimeConfig = useRuntimeConfig(event);
  const body = await readBody(event);
  const addresses = Array.from(new Set(((body == null ? void 0 : body.addresses) || []).map((address) => String(address || "").trim()).filter(Boolean)));
  const result = {};
  const meta = {
    provider: "none",
    keyConfigured: false,
    attempted: 0,
    success: 0,
    rateLimited: 0
  };
  if (addresses.length === 0) {
    return { postcodes: result, unresolved: [], meta };
  }
  if (addresses.length > 300) {
    throw createError({ statusCode: 400, statusMessage: "\uC8FC\uC18C\uB294 \uCD5C\uB300 300\uAC1C\uAE4C\uC9C0 \uC870\uD68C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  }
  for (const address of addresses) {
    const inline = findInlinePostcode(address);
    if (inline) result[address] = inline;
  }
  const unresolved = addresses.filter((address) => !result[address]);
  if (unresolved.length === 0) {
    return { postcodes: result, unresolved: [], meta };
  }
  const kakaoKey = String(runtimeConfig.kakaoRestApiKey || "").trim();
  meta.keyConfigured = Boolean(kakaoKey);
  if (!kakaoKey) {
    return { postcodes: result, unresolved, meta };
  }
  meta.provider = "kakao";
  const postcodeCache = /* @__PURE__ */ new Map();
  for (const address of unresolved) {
    const candidates = buildAddressCandidates(address);
    let found = "";
    for (const candidate of candidates) {
      if (postcodeCache.has(candidate)) {
        const cached = postcodeCache.get(candidate);
        if (cached) found = cached;
        break;
      }
      try {
        meta.attempted += 1;
        const response = await $fetch("https://dapi.kakao.com/v2/local/search/address.json", {
          method: "GET",
          query: {
            query: candidate,
            size: 5,
            analyze_type: "similar"
          },
          headers: {
            Authorization: `KakaoAK ${kakaoKey}`
          }
        });
        const docs = (response == null ? void 0 : response.documents) || [];
        for (const doc of docs) {
          const postcode = normalizePostcode(
            ((_a = doc == null ? void 0 : doc.road_address) == null ? void 0 : _a.zone_no) || ((_b = doc == null ? void 0 : doc.address) == null ? void 0 : _b.zip_code) || ""
          );
          if (!postcode) continue;
          postcodeCache.set(candidate, postcode);
          found = postcode;
          meta.success += 1;
          break;
        }
        if (!found) postcodeCache.set(candidate, null);
        if (found) break;
      } catch (error) {
        const statusCode = Number((error == null ? void 0 : error.statusCode) || ((_c = error == null ? void 0 : error.response) == null ? void 0 : _c.status) || 0);
        if (statusCode === 429) {
          meta.rateLimited += 1;
          await sleep(150);
        }
        postcodeCache.set(candidate, null);
        console.warn("[postcode lookup] failed:", candidate, statusCode || error);
      }
    }
    if (found) {
      result[address] = found;
    }
  }
  return {
    postcodes: result,
    unresolved: addresses.filter((address) => !result[address]),
    meta
  };
});

export { lookup_post as default };
//# sourceMappingURL=lookup.post.mjs.map
