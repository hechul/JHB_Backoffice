import { d as defineEventHandler, a as getRouterParam, c as createError, g as getHeader, u as useRuntimeConfig } from '../../../../nitro/nitro.mjs';
import { createClient } from '@supabase/supabase-js';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';

const _jobId__get = defineEventHandler(async (event) => {
  var _a;
  const jobId = getRouterParam(event, "jobId");
  if (!jobId) {
    throw createError({ statusCode: 400, message: "jobId\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." });
  }
  const config = useRuntimeConfig();
  const supabase = createClient(
    config.public.supabaseUrl,
    config.public.supabaseKey
  );
  const authHeader = getHeader(event, "authorization") || "";
  const accessToken = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken);
  if (authErr || !user) {
    throw createError({ statusCode: 401, message: "\uB85C\uADF8\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  }
  const { data: job, error } = await supabase.from("automation_jobs").select("id, status, total_urls, success_count, fail_count, download_url, expires_at, summary_json, completed_at, created_at").eq("id", jobId).eq("created_by", user.id).single();
  if (error || !job) {
    throw createError({ statusCode: 404, message: "job\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  }
  const isExpired = job.expires_at ? new Date(job.expires_at) < /* @__PURE__ */ new Date() : false;
  return {
    jobId: job.id,
    status: job.status,
    totalUrls: job.total_urls,
    successCount: job.success_count,
    failCount: job.fail_count,
    downloadUrl: isExpired ? null : job.download_url,
    isExpired,
    expiresAt: job.expires_at,
    failures: ((_a = job.summary_json) == null ? void 0 : _a.failures) || [],
    completedAt: job.completed_at,
    createdAt: job.created_at
  };
});

export { _jobId__get as default };
//# sourceMappingURL=_jobId_.get.mjs.map
