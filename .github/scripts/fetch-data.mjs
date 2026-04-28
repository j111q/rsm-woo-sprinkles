import { writeFileSync } from 'fs';

const USERS = ['j111q', 'annchichi'];
const TOKEN = process.env.GH_TOKEN;

if (!TOKEN) {
  console.error('GH_TOKEN env var is required');
  process.exit(1);
}

async function gh(url) {
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'rsm-woo-sprinkles-dashboard'
    }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText} for ${url}\n${body}`);
  }
  return res.json();
}

async function fetchUser(user) {
  const q = (s) => encodeURIComponent(`author:${user} ${s}`);
  const [merged, open, closedUnmerged, profile] = await Promise.all([
    gh(`https://api.github.com/search/issues?q=${q('is:merged')}&sort=updated&order=desc&per_page=100`),
    gh(`https://api.github.com/search/issues?q=${q('is:open')}&sort=updated&order=desc&per_page=100`),
    gh(`https://api.github.com/search/issues?q=${q('is:closed -is:merged')}&sort=updated&order=desc&per_page=100`),
    gh(`https://api.github.com/users/${user}`)
  ]);

  const tag = (resp, status) => resp.items.map(i => ({ ...i, _status: status, _author: user }));
  const openSplit = open.items.map(i => ({ ...i, _status: i.draft ? 'draft' : 'open', _author: user }));

  return {
    user,
    profile: {
      login: profile.login,
      avatar_url: profile.avatar_url,
      html_url: profile.html_url
    },
    items: [
      ...tag(merged, 'merged'),
      ...openSplit,
      ...tag(closedUnmerged, 'closed')
    ]
  };
}

// Slim down each item to just what the dashboard renders, to keep data.json small.
function slimItem(i) {
  return {
    number: i.number,
    title: i.title,
    html_url: i.html_url,
    repository_url: i.repository_url,
    state: i.state,
    draft: i.draft,
    comments: i.comments,
    updated_at: i.updated_at,
    pull_request: i.pull_request ? { html_url: i.pull_request.html_url } : undefined,
    labels: (i.labels || []).map(l => ({ name: l.name, color: l.color })),
    milestone: i.milestone ? { title: i.milestone.title } : null,
    _status: i._status,
    _author: i._author
  };
}

const datasets = await Promise.all(USERS.map(fetchUser));
const slimmed = datasets.map(d => ({ ...d, items: d.items.map(slimItem) }));
const total = slimmed.flatMap(d => d.items).length;

const data = {
  fetchedAt: new Date().toISOString(),
  datasets: slimmed
};

writeFileSync('data.json', JSON.stringify(data, null, 2));
console.log(`Wrote data.json with ${total} items at ${data.fetchedAt}`);
