import { d as defineEventHandler, r as readBody, c as createError, g as getHeader, u as useRuntimeConfig } from '../../../nitro/nitro.mjs';
import { createClient } from '@supabase/supabase-js';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';

const start_post = defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { urls } = body || {};
  if (!Array.isArray(urls) || urls.length === 0) {
    throw createError({ statusCode: 400, message: "urls \uBC30\uC5F4\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  }
  if (urls.length > 10) {
    throw createError({ statusCode: 400, message: "\uCD5C\uB300 10\uAC1C URL\uAE4C\uC9C0 \uCC98\uB9AC \uAC00\uB2A5\uD569\uB2C8\uB2E4." });
  }
  const validUrls = urls.filter((u) => {
    try {
      const parsed = new URL(u);
      return parsed.hostname.includes("blog.naver.com");
    } catch {
      return false;
    }
  });
  if (validUrls.length === 0) {
    throw createError({ statusCode: 400, message: "\uC720\uD6A8\uD55C \uB124\uC774\uBC84 \uBE14\uB85C\uADF8 URL\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
  }
  const config = useRuntimeConfig();
  const supabaseUrl = config.public.supabaseUrl;
  const supabaseKey = config.public.supabaseKey;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const authHeader = getHeader(event, "authorization") || "";
  const accessToken = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken);
  if (authErr || !user) {
    throw createError({ statusCode: 401, message: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  }
  const { data: job, error: insertErr } = await supabase.from("automation_jobs").insert({
    job_type: "blog_media",
    created_by: user.id,
    status: "pending",
    total_urls: validUrls.length,
    summary_json: { urls: validUrls }
  }).select("id").single();
  if (insertErr || !job) {
    console.error("[blog/start] job \uB4F1\uB85D \uC2E4\uD328:", insertErr == null ? void 0 : insertErr.message);
    throw createError({ statusCode: 500, message: "job \uB4F1\uB85D \uC2E4\uD328" });
  }
  const crawlerUrl = process.env.CRAWLER_SERVER_URL;
  if (crawlerUrl) {
    try {
      await $fetch(`${crawlerUrl}/ping`, {
        method: "GET",
        signal: AbortSignal.timeout(2e3)
      });
    } catch {
    }
  }
  return {
    jobId: job.id,
    totalUrls: validUrls.length,
    status: "pending"
  };
});

export { start_post as default };
//# sourceMappingURL=start.post.mjs.map
