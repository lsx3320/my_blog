// Cloudflare 数据看板 API：访问统计（GraphQL Analytics）+ Pages 部署记录
// Token 只存在于服务端环境变量，通过本 Function 代理，不暴露给前端。
//
// 所需环境变量（Cloudflare Pages → Settings → Environment variables）：
//   CF_API_TOKEN   Cloudflare API Token（Analytics:Read + Pages:Read 权限）
//   CF_ACCOUNT_ID  Cloudflare 账号 ID
//   CF_ZONE_ID     lushixiao.cn 的 Zone ID（域名解析所在 zone）

const CF_API = 'https://api.cloudflare.com/client/v4';
// Cloudflare Web Analytics 站点 Token（Beacon 脚本里那个，公开值）
const WA_SITE_TOKEN = 'f4d73c96a23447129d942007e81492d3';

interface StatsPayload {
  analytics: {
    days: { date: string; requests: number; visits: number; pageViews: number; uniques: number }[];
    totalRequests: number;
    totalVisits: number;
    totalUniques: number;
    avgDailyRequests: number;
  } | null;
  deployments: {
    id: string;
    url: string;
    createdOn: string;
    status: string;
    commitMessage: string;
    buildTimeMs: number | null;
  }[];
  error?: string;
}

function fmtDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const onRequestGet = async ({
  env,
}: {
  env: Record<string, string | undefined>;
}): Promise<Response> => {
  const token = env.CF_API_TOKEN;
  const accountId = env.CF_ACCOUNT_ID;
  const zoneId = env.CF_ZONE_ID;
  const project = env.CF_PAGES_PROJECT || 'my-blog';

  if (!token || !accountId || !zoneId) {
    return Response.json(
      { error: '服务端未配置 CF_API_TOKEN / CF_ACCOUNT_ID / CF_ZONE_ID' },
      { status: 500 },
    );
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const payload: StatsPayload = { analytics: null, deployments: [] };

  // ---------- 0. 诊断：验证 Zone ID 与账号 ----------
  try {
    const zoneCheck = await fetch(`${CF_API}/zones/${zoneId}`, { headers });
    const zoneJson = (await zoneCheck.json()) as {
      success?: boolean;
      errors?: { message?: string }[];
      result?: { name?: string };
    };
    if (zoneCheck.status === 401 || zoneCheck.status === 403) {
      payload.error = `Zone 接口认证失败（${zoneCheck.status}）：token 权限或账号信息有问题`;
    } else if (zoneCheck.ok && zoneJson?.result?.name) {
      payload.error = `Zone 验证通过：${zoneJson.result.name}`;
    } else {
      payload.error = `Zone ID 可能不对（HTTP ${zoneCheck.status}）：${(zoneJson?.errors?.[0]?.message || '').slice(0, 200)}`;
    }
  } catch {
    payload.error = 'Zone 验证请求失败';
  }

  // ---------- 1. 访问统计（GraphQL Web Analytics，近 30 天每日） ----------
  const end = new Date();
  const start = new Date(Date.now() - 29 * 86400000);
  const siteToken = env.CF_WA_SITE_TOKEN || WA_SITE_TOKEN;
  const query = `
    query($accountTag: String!, $siteToken: String!, $start: String!, $end: String!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          webAnalyticsAdaptiveGroups(
            limit: 31
            filter: { date_geq: $start, date_leq: $end, siteToken: $siteToken }
            orderBy: [date_ASC]
          ) {
            dimensions { date }
            sum { requests visits pageViews }
            uniq { uniques }
          }
        }
      }
    }`;

  try {
    const gql = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        variables: { accountTag: accountId, siteToken, start: fmtDate(start), end: fmtDate(end) },
      }),
    });
    const gqlJson = (await gql.json()) as {
      errors?: { message: string }[];
      data?: {
        viewer?: {
          accounts?: {
            webAnalyticsAdaptiveGroups?: {
              dimensions: { date: string };
              sum: { requests: number; visits: number; pageViews: number };
              uniq: { uniques: number };
            }[];
          }[];
        };
      };
    };
    // 诊断：GraphQL 报错（多为权限不足）原样带回
    if (gqlJson?.errors?.length) {
      payload.error = payload.error ? payload.error + '；' : '';
      payload.error += '统计: ' + gqlJson.errors.map((e) => e.message).join(' / ').slice(0, 300);
    }
    const groups = gqlJson?.data?.viewer?.accounts?.[0]?.webAnalyticsAdaptiveGroups || [];
    if (!gqlJson?.errors?.length && !groups.length) {
      payload.error = payload.error ? payload.error + '；' : '';
      payload.error += '统计: Web Analytics 近 30 天暂无数据（Beacon 刚接入，需等流量产生）';
    }
    const days = groups.map((g) => ({
      date: String(g.dimensions.date).slice(5), // MM-DD
      requests: g.sum.requests,
      visits: g.sum.visits,
      pageViews: g.sum.pageViews,
      uniques: g.uniq.uniques,
    }));
    const totalRequests = days.reduce((a, d) => a + d.requests, 0);
    const totalVisits = days.reduce((a, d) => a + d.visits, 0);
    const totalUniques = days.reduce((a, d) => a + d.uniques, 0);
    payload.analytics = {
      days,
      totalRequests,
      totalVisits,
      totalUniques,
      avgDailyRequests: days.length ? Math.round(totalRequests / days.length) : 0,
    };
  } catch {
    payload.error = payload.error ? payload.error + '；' : '';
    payload.error += '访问统计获取失败';
  }

  // ---------- 2. Pages 部署记录（最近 10 条） ----------
  try {
    const dep = await fetch(
      `${CF_API}/accounts/${accountId}/pages/projects/${project}/deployments?per_page=10`,
      { headers },
    );
    const depJson = (await dep.json()) as {
      success?: boolean;
      errors?: { message?: string }[];
      result?: {
        id: string;
        url: string;
        created_on: string;
        environment?: string;
        build?: { status?: string; start_time?: string; end_time?: string; commit_message?: string };
        deployment_trigger?: { metadata?: { commit_message?: string; commit_hash?: string } };
        latest_stage?: { name?: string; started_on?: string; ended_on?: string };
        source?: { config?: Record<string, unknown> };
      }[];
    };
    // 诊断：Pages API 报错（区分 401 权限 / 404 项目名或账号）
    payload.error = payload.error ? payload.error + '；' : '';
    payload.error += `部署接口 HTTP ${dep.status}`;
    if (depJson?.errors?.length) {
      payload.error += ' - ' + depJson.errors.map((e) => e.message || '').join(' / ').slice(0, 200);
    }
    const list = depJson?.result || [];
    payload.deployments = list.map((d) => {
      const b = d.build || {};
      const meta = d.deployment_trigger?.metadata || {};
      const stage = d.latest_stage || {};
      const startT = b.start_time || stage.started_on ? new Date(b.start_time || stage.started_on || '').getTime() : null;
      const endT = b.end_time || stage.ended_on ? new Date(b.end_time || stage.ended_on || '').getTime() : null;
      return {
        id: d.id,
        url: d.url,
        createdOn: d.created_on,
        status: b.status || (stage.name === 'deploy' ? 'success' : stage.name || 'unknown'),
        commitMessage: b.commit_message || meta.commit_message || '',
        buildTimeMs: startT && endT ? endT - startT : null,
      };
    });
  } catch {
    payload.error = payload.error ? payload.error + '；' : '';
    payload.error += '部署记录获取失败';
  }

  return Response.json(payload);
};
