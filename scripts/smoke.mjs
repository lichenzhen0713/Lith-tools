/**
 * API smoke test — exercises the critical user journeys against a running server.
 * Usage: node scripts/smoke.mjs [baseUrl]
 */
const base = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
let cookie = '';
let failures = 0;

function pass(name, detail = '') {
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  failures += 1;
  console.log(`  ✗ ${name} — ${detail}`);
}

async function request(path, { method = 'GET', body, expect = [200, 201], auth = true } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth && cookie) headers.cookie = cookie;
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  for (const value of setCookie) {
    const pair = value.split(';')[0];
    if (pair.startsWith('lith_session=')) cookie = pair;
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data, headers: response.headers };
}

async function expectStatus(name, promise, expected = [200, 201]) {
  try {
    const result = await promise;
    if (expected.includes(result.status)) {
      pass(name, `HTTP ${result.status}`);
      return result;
    }
    fail(name, `expected ${expected.join('/')} got ${result.status}: ${JSON.stringify(result.data).slice(0, 200)}`);
    return result;
  } catch (error) {
    fail(name, error.message);
    return { status: 0, data: null };
  }
}

console.log(`\nLith Tools API smoke test → ${base}\n`);

// ---------------------------------------------------------------- public API
await expectStatus('health', request('/api/health'));
const tools = await expectStatus('tool catalogue', request('/api/tools'));
if (tools.data?.tools?.length >= 60) pass('catalogue size', `${tools.data.tools.length} tools`);
else fail('catalogue size', `only ${tools.data?.tools?.length ?? 0} tools`);

const stats = await expectStatus('public stats', request('/api/stats/public'));
if (stats.data?.blogs >= 1) pass('demo content seeded', `${stats.data.blogs} blogs / ${stats.data.threads} threads`);
else fail('demo content seeded', 'no demo blogs found');

// ---------------------------------------------------------------- auth flow
const email = `smoke-${Date.now()}@example.com`;
const codeResponse = await expectStatus('send verification code', request('/api/auth/send-code', {
  method: 'POST',
  body: { email },
  auth: false,
}));
const code = codeResponse.data?.devCode;
if (code) pass('dev verification code exposed (non-production)', code);
else fail('dev verification code exposed', 'no devCode returned — check SMTP/dev env');

const username = `smoke${Date.now().toString().slice(-8)}`;
const registered = await expectStatus('register', request('/api/auth/register', {
  method: 'POST',
  body: { username, email, code: code ?? '000000', password: 'Passw0rd123' },
  auth: false,
}));
if (registered.data?.user?.username === username) pass('registration returns session user');
else fail('registration returns session user', JSON.stringify(registered.data).slice(0, 200));

const me = await expectStatus('session (me)', request('/api/auth/me'));
if (me.data?.user?.username === username) pass('session cookie works');
else fail('session cookie works', JSON.stringify(me.data).slice(0, 200));

// --------------------------------------------------------------------- blog
const post = await expectStatus('create blog post', request('/api/blog/posts', {
  method: 'POST',
  body: {
    title: '冒烟测试文章',
    content: '# 冒烟测试\n\n这是一篇由 `scripts/smoke.mjs` 创建的文章。\n\n$$E=mc^2$$',
    isPublic: true,
  },
}));
const postId = post.data?.post?.id;
if (postId) {
  await expectStatus('read blog post', request(`/api/blog/posts/${postId}`));
  const listed = await expectStatus('list blog posts', request('/api/blog/posts?pageSize=5'));
  if (listed.data?.items?.some((item) => item.id === postId)) pass('post appears in list');
  else fail('post appears in list', 'new post missing');

  const liked = await expectStatus('like post', request(`/api/blog/posts/${postId}/like`, { method: 'POST', body: {} }));
  if (liked.data?.liked === true && liked.data?.likes === 1) pass('like toggle');
  else fail('like toggle', JSON.stringify(liked.data));

  await expectStatus('comment on post', request(`/api/blog/posts/${postId}/comments`, {
    method: 'POST',
    body: { comment: '自动测试评论' },
  }));
  const comments = await expectStatus('list comments', request(`/api/blog/posts/${postId}/comments`));
  if (comments.data?.total === 1) pass('comment persisted');
  else fail('comment persisted', `total=${comments.data?.total}`);

  await expectStatus('edit own post', request(`/api/blog/posts/${postId}`, {
    method: 'PATCH',
    body: { title: '冒烟测试文章（已编辑）', content: '编辑后的内容', isPublic: true },
  }));
  await expectStatus('delete own post', request(`/api/blog/posts/${postId}`, { method: 'DELETE' }));
}

// -------------------------------------------------------------------- forum
const forums = await expectStatus('forum list', request('/api/forum/forums'));
const forumId = forums.data?.items?.[0]?.id;
if (forumId) {
  const thread = await expectStatus('create thread', request(`/api/forum/forums/${forumId}/threads`, {
    method: 'POST',
    body: { title: '冒烟测试主题', content: '这是自动测试创建的帖子。' },
  }));
  const threadId = thread.data?.threadId;
  if (threadId) {
    await expectStatus('reply to thread', request(`/api/forum/threads/${threadId}/posts`, {
      method: 'POST',
      body: { content: '自动测试回复' },
    }));
    const detail = await expectStatus('thread detail', request(`/api/forum/threads/${threadId}`));
    if (detail.data?.posts?.total === 2) pass('thread has opening post + reply');
    else fail('thread has opening post + reply', `total=${detail.data?.posts?.total}`);
    await expectStatus('delete own thread', request(`/api/forum/threads/${threadId}`, { method: 'DELETE' }));
  }
}

// ---------------------------------------------------------------- feedback
await expectStatus('submit feedback', request('/api/feedback', {
  method: 'POST',
  body: { rating: 5, feedback: '自动测试反馈内容' },
}));
await expectStatus('submit tool suggestion', request('/api/submissions/tool', {
  method: 'POST',
  body: { toolName: '测试工具', description: '用于冒烟测试的投稿', toolLink: 'https://example.com' },
}));

// ------------------------------------------------------- permissions (deny)
const adminAttempt = await request('/api/admin/stats');
if (adminAttempt.status === 403) pass('admin endpoints reject normal users');
else fail('admin endpoints reject normal users', `status ${adminAttempt.status}`);

await expectStatus('logout', request('/api/auth/logout', { method: 'POST', body: {} }));

// --------------------------------------------------------------- admin flow
cookie = '';
const adminLogin = await request('/api/auth/login', {
  method: 'POST',
  body: { username: 'admin', password: 'admin123456' },
  auth: false,
});
if (adminLogin.status === 200) {
  pass('admin login');
  await expectStatus('admin stats', request('/api/admin/stats'));
  await expectStatus('admin users', request('/api/admin/users'));
  await expectStatus('admin tools', request('/api/admin/tools'));
  await expectStatus('admin access logs', request('/api/admin/access-logs'));
  const pending = await expectStatus('admin pending submissions', request('/api/admin/submissions?type=tool&status=pending'));
  if (pending.data?.total >= 1) pass('tool suggestion queued for review');
  else fail('tool suggestion queued for review', `total=${pending.data?.total}`);
} else {
  fail('admin login', `status ${adminLogin.status} — set ADMIN_USERNAME/ADMIN_PASSWORD or run npm run db:seed`);
}

console.log(`\n${failures === 0 ? 'All smoke checks passed ✅' : `${failures} check(s) failed ❌`}\n`);
process.exit(failures === 0 ? 0 : 1);
