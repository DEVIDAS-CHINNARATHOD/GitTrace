/* ── GitTrace script.js  (no server — pure static / localStorage) ─────── */

/* ── Default user list (seeded once into localStorage) ── */
const DEFAULT_USERS = [
  "DEVIDAS-CHINNARATHOD","muqeet1001","bsrajputx95","niteshsaini9568",
  "thorgnt12","Gurukiran-B","RahulMirji","Shivaprasadrathod","savansr",
  "torvalds","hackerx95","vivek9patel","pavankalyan662","heena024",
  "bhargu07","Indushree02","Harshagowdasv","mqt-dev07","iAmAjayTeli",
  "kunal-kushwaha","loveBabbar","chandansgowda","HarshaBM-25",
  "Sarahfaatima","yesra29","ahammed2006","keerthanakh89",
  "Keninjavelas","Zuhaib-01","NamelessMonsterr","Hrit66"
];

const CACHE_KEY     = 'gittrace_cache_v2';
const COMMITS_KEY   = 'gittrace_commits_v1';
const CACHE_TTL     = 60 * 60 * 1000;       // 1 hour — profiles
const COMMITS_TTL   = 6  * 60 * 60 * 1000; // 6 hours — commit counts

/* ── GitHub API profile cache ── */
function getCache()              { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; } }
function setCache(obj)           { try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch {} }
function getCachedUser(username) { const e = getCache()[username.toLowerCase()]; return e && Date.now() - e.ts < CACHE_TTL ? e.data : null; }
function setCachedUser(u, data)  { const c = getCache(); c[u.toLowerCase()] = { data, ts: Date.now() }; setCache(c); }

/* ── Commits cache ── */
function getCommitsStore()               { try { return JSON.parse(localStorage.getItem(COMMITS_KEY)) || {}; } catch { return {}; } }
function setCommitsStore(obj)            { try { localStorage.setItem(COMMITS_KEY, JSON.stringify(obj)); } catch {} }
function getCachedCommits(username)      { const e = getCommitsStore()[username.toLowerCase()]; return e && Date.now() - e.ts < COMMITS_TTL ? e.count : null; }
function setCachedCommits(username, n)   { const s = getCommitsStore(); s[username.toLowerCase()] = { count: n, ts: Date.now() }; setCommitsStore(s); }

/* ── Fetch a single GitHub profile (cache-first) ── */
async function fetchUser(username) {
  const cached = getCachedUser(username);
  if (cached) return cached;
  try {
    const res = await fetch('https://api.github.com/users/' + encodeURIComponent(username));
    if (!res.ok) return null;
    const data = await res.json();
    setCachedUser(username, data);
    return data;
  } catch { return null; }
}

/* ── Fetch recent commit count from events API (cached 6h) ── */
async function fetchCommitCount(username) {
  const cached = getCachedCommits(username);
  if (cached !== null) return cached;
  try {
    const res = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=100`
    );
    if (!res.ok) return 0;
    const events = await res.json();
    let count = 0;
    for (const e of events) {
      if (e.type === 'PushEvent') count += (e.payload?.commits?.length || 0);
    }
    setCachedCommits(username, count);
    return count;
  } catch { return 0; }
}

/* ── Fetch commit counts for all users in parallel (max 5 concurrent) ── */
let commitsLoaded = false;
async function loadCommitCounts() {
  if (commitsLoaded) return;
  commitsLoaded = true;

  setLoading('Fetching recent commit counts…', 0);
  let done = 0;

  async function worker(queue) {
    for (const u of queue) {
      const count = await fetchCommitCount(u.login);
      u._commits = count;
      done++;
      setLoading(`Fetching commits ${done} / ${userData.length}…`, Math.round((done / userData.length) * 100));
    }
  }

  const chunks = Array.from({ length: 5 }, (_, i) =>
    userData.filter((_, j) => j % 5 === i)
  );
  await Promise.all(chunks.map(worker));
  setLoading(null);
}

/* ── Parallel batch fetch (max 6 concurrent) ── */
async function fetchAllUsers(usernames, concurrency = 6) {
  const results = new Array(usernames.length).fill(null);
  let index = 0, done = 0;

  async function worker() {
    while (index < usernames.length) {
      const i = index++;
      results[i] = await fetchUser(usernames[i]);
      done++;
      const pct = Math.round((done / usernames.length) * 100);
      setLoading(`Loading ${done} / ${usernames.length} users…`, pct);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, usernames.length) }, worker));
  return results.filter(Boolean);
}

/* ── State ── */
let userData      = [];
let currentFilter = 'followers';


/* ── DOM refs ── */
const leaderboardList  = document.getElementById('leaderboardMain');
const leaderboardTitle = document.getElementById('leaderboardTitleMain');
const userListEl       = document.getElementById('userList');
const loadingBar       = document.getElementById('loadingIndicator');
const loadText         = loadingBar.querySelector('.load-text');
const progressFill     = document.getElementById('progressFill');
const profileModal     = document.getElementById('profileModal');

/* ── Helpers ── */
function fmt(n) {
  if (n === undefined || n === null) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function setLoading(text, pct) {
  if (text) {
    loadText.textContent = text;
    loadingBar.classList.remove('hidden');
    if (progressFill) progressFill.style.width = (pct ?? 0) + '%';
  } else {
    loadingBar.classList.add('hidden');
    if (progressFill) progressFill.style.width = '0%';
  }
}

/* ── Skeleton placeholders ── */
function renderSkeletons(count) {
  userListEl.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    s.className = 'user-card skeleton-card';
    s.innerHTML = `<div class="skel skel-avatar"></div>
      <div class="skel skel-name"></div>
      <div class="skel skel-stats"></div>`;
    userListEl.appendChild(s);
  }
}

/* ── Load & render all users ── */
async function loadAllUsers() {
  userData = [];
  if (DEFAULT_USERS.length === 0) { setLoading(null); renderAll(); return; }

  renderSkeletons(DEFAULT_USERS.length);
  setLoading(`Loading 0 / ${DEFAULT_USERS.length} users…`, 0);

  userData = await fetchAllUsers(DEFAULT_USERS);
  setLoading(null);

  if (userData.length === 0) {
    setLoading('GitHub API rate limit reached. Cached data will load once available. Try again shortly.');
  }

  renderAll();
}

function renderAll() {
  renderLeaderboard();
  renderExplore();
  renderCharts();
}

/* ── Sort helpers ── */
function sortedUsers() {
  return [...userData].sort((a, b) => {
    if (currentFilter === 'followers') return b.followers - a.followers;
    if (currentFilter === 'repos')     return b.public_repos - a.public_repos;
    if (currentFilter === 'following') return b.following - a.following;
    if (currentFilter === 'commits')   return (b._commits || 0) - (a._commits || 0);
    return 0;
  });
}
function filterLabel() {
  if (currentFilter === 'followers') return 'Followers';
  if (currentFilter === 'repos')     return 'Repositories';
  if (currentFilter === 'following') return 'Following';
  if (currentFilter === 'commits')   return 'Recent Commits';
  return '';
}

/* ── Leaderboard ── */
function renderLeaderboard() {
  const sorted = sortedUsers();
  leaderboardTitle.textContent = 'Top by ' + filterLabel();

  const frag = document.createDocumentFragment();
  sorted.forEach((u, i) => {
    const item = document.createElement('div');
    item.className = 'leaderboard-item';
    const [cls, label] = i === 0 ? ['gold','🥇'] : i === 1 ? ['silver','🥈'] : i === 2 ? ['bronze','🥉'] : ['', '#' + (i + 1)];
    const value = currentFilter === 'followers' ? u.followers
                : currentFilter === 'repos'     ? u.public_repos
                : currentFilter === 'following' ? u.following
                : (u._commits ?? '…');
    item.innerHTML =
      `<div class="rank-badge ${cls}">${label}</div>` +
      `<img class="lb-avatar" src="${u.avatar_url}" alt="${u.login}" loading="lazy">` +
      `<div class="lb-info">` +
        `<div class="lb-name">${u.name || u.login}</div>` +
        `<div class="lb-value">${fmt(value)} ${filterLabel().toLowerCase()}</div>` +
      `</div>`;
    item.addEventListener('click', () => openProfile(u));
    frag.appendChild(item);
  });

  leaderboardList.innerHTML = '';
  leaderboardList.appendChild(frag);
}

/* ── Explore grid ── */
function renderExplore() {
  const frag = document.createDocumentFragment();
  userData.forEach(u => {
    const card = document.createElement('div');
    card.className = 'user-card';
    card.innerHTML =
      `<img class="card-avatar" src="${u.avatar_url}" alt="${u.login}" loading="lazy">` +
      `<div class="card-name">${u.name || u.login}</div>` +
      `<div class="card-stats">` +
        `<div class="stat-box"><div class="stat-label">Followers</div><div class="stat-num">${fmt(u.followers)}</div></div>` +
        `<div class="stat-box"><div class="stat-label">Repos</div><div class="stat-num">${fmt(u.public_repos)}</div></div>` +
        `<div class="stat-box"><div class="stat-label">Following</div><div class="stat-num">${fmt(u.following)}</div></div>` +
      `</div>`;
    card.addEventListener('click', () => openProfile(u));
    frag.appendChild(card);
  });

  userListEl.innerHTML = '';
  userListEl.appendChild(frag);
}

/* ── Charts ── */
let chartTop, chartStats;
function renderCharts() {
  if (typeof Chart === 'undefined') return;
  const top10 = sortedUsers().slice(0, 10);

  if (chartTop)   { chartTop.destroy();   chartTop   = null; }
  if (chartStats) { chartStats.destroy(); chartStats = null; }

  const ctxTop = document.getElementById('topPerformersChart');
  if (ctxTop) {
    chartTop = new Chart(ctxTop, {
      type: 'bar',
      data: {
        labels: top10.map(u => u.login),
        datasets: [{ label: filterLabel(),
          data: top10.map(u =>
            currentFilter === 'followers' ? u.followers
            : currentFilter === 'repos'   ? u.public_repos
            : currentFilter === 'commits' ? (u._commits || 0)
            : u.following
          ),
          backgroundColor: 'rgba(59,130,246,0.6)', borderColor: '#3b82f6', borderWidth: 1, borderRadius: 4 }]
      },
      options: { responsive: true, animation: { duration: 400 }, plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#9ca3af', maxRotation: 30 }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  const len = userData.length || 1;
  const avg = fn => Math.round(userData.reduce((s, u) => s + (u[fn] || 0), 0) / len);
  const avgCommits = Math.round(userData.reduce((s, u) => s + (u._commits || 0), 0) / len);
  const ctxStats = document.getElementById('statsDistributionChart');
  if (ctxStats) {
    chartStats = new Chart(ctxStats, {
      type: 'doughnut',
      data: {
        labels: ['Avg Followers', 'Avg Repos', 'Avg Commits'],
        datasets: [{ data: [avg('followers'), avg('public_repos'), commitsLoaded ? avgCommits : avg('following')],
          backgroundColor: ['#3b82f6','#8b5cf6','#22c55e'], borderColor: '#1a2332', borderWidth: 2 }]
      },
      options: { responsive: true, animation: { duration: 400 }, plugins: { legend: { position: 'bottom',
        labels: { color: '#9ca3af', padding: 16, boxWidth: 12 } } } }
    });
  }
}

/* ── Profile modal ── */
function openProfile(u) {
  document.getElementById('modalAvatar').src            = u.avatar_url;
  document.getElementById('modalUsername').textContent  = u.name || u.login;
  document.getElementById('modalBio').textContent       = u.bio || 'No bio available.';
  document.getElementById('modalFollowers').textContent = fmt(u.followers);
  document.getElementById('modalFollowing').textContent = fmt(u.following);
  document.getElementById('modalRepos').textContent     = fmt(u.public_repos);
  document.getElementById('modalProfileLink').href      = u.html_url;
  profileModal.classList.add('show');
}

/* ── Tab switching ── */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    const sec = document.getElementById(btn.dataset.tab + 'Section');
    if (sec) sec.classList.add('active');
  });
});

/* ── Filter buttons ── */
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;

    // Lazy-load commit counts on first use
    if (currentFilter === 'commits' && !commitsLoaded) {
      await loadCommitCounts();
    }

    renderLeaderboard();
    renderCharts();
  });
});

/* ── Profile modal close ── */
document.getElementById('closeModal').addEventListener('click', () => profileModal.classList.remove('show'));
profileModal.addEventListener('click', e => { if (e.target === profileModal) profileModal.classList.remove('show'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') profileModal.classList.remove('show'); });

/* ── Init ── */
loadAllUsers();
