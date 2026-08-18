// Cloudflare Pages Function：把日记写入 GitHub 仓库 src/content/diaries/
// 触发 Cloudflare Pages 自动重建（push → rebuild → 部署）。
//
// 所需环境变量（Cloudflare Pages → Settings → Environment variables）：
//   GITHUB_TOKEN  GitHub Personal Access Token（repo 权限），必须设为 secret
//   GITHUB_REPO   可选，默认 lsx3320/my_blog（格式 owner/repo）
//
// 安全说明：token 只存在于服务端环境变量，绝不进入前端代码。

const DEFAULT_REPO = 'lsx3320/my_blog';
const GITHUB_API = 'https://api.github.com';

interface DiaryPayload {
  title?: string;
  mood?: string;
  weather?: string;
  body?: string;
}

function base64utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function todayCN(): string {
  // 中国时区的 YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function buildMarkdown(payload: DiaryPayload, date: string): string {
  const lines: string[] = ['---', `date: ${date}`];
  if (payload.title) lines.push(`title: ${payload.title}`);
  if (payload.mood) lines.push(`mood: ${payload.mood}`);
  if (payload.weather) lines.push(`weather: ${payload.weather}`);
  lines.push('---', '', payload.body ?? '');
  return lines.join('\n');
}

export const onRequestPost = async ({
  request,
  env,
}: {
  request: Request;
  env: Record<string, string | undefined>;
}): Promise<Response> => {
  const token = env.GITHUB_TOKEN;
  if (!token) {
    return Response.json({ error: '服务端未配置 GITHUB_TOKEN' }, { status: 500 });
  }

  let payload: DiaryPayload;
  try {
    payload = (await request.json()) as DiaryPayload;
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }

  if (!payload.body || !payload.body.trim()) {
    return Response.json({ error: '日记内容不能为空' }, { status: 400 });
  }

  const repo = env.GITHUB_REPO || DEFAULT_REPO;
  const date = todayCN();
  const path = `src/content/diaries/${date}.md`;
  const content = base64utf8(buildMarkdown(payload, date));

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // 当天已存在则先取 sha（用于更新）
  let sha: string | undefined;
  const getRes = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`, {
    headers: authHeaders,
  });
  if (getRes.ok) {
    const existing = (await getRes.json()) as { sha: string };
    sha = existing.sha;
  }

  const putRes = await fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: sha ? `diary: 更新 ${date}` : `diary: ${date}`,
      content,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!putRes.ok) {
    const detail = (await putRes.json().catch(() => ({}))) as { message?: string };
    return Response.json(
      { error: `GitHub 写入失败（${putRes.status}）：${detail.message ?? '未知错误'}` },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, path, date });
};
