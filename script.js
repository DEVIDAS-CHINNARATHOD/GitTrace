/* ── GitTrace script.js ──────────────────────────────────────────────────── */

/* State */
let users         = [];
let userData      = [];
let currentFilter = 'followers';
let editTarget    = null;

/* DOM refs */
const leaderboardList  = document.getElementById('leaderboardMain');
const leaderboardTitle = document.getElementById('leaderboardTitleMain');
const userListEl       = document.getElementById('userList');
const loadingBar       = document.getElementById('loadingIndicator');
const userInput        = document.getElementById('userInput');
const addUserBtn       = document.getElementById('addUserBtn');
const addMsg           = document.getElementById('addMsg');
const profileModal     = document.getElementById('profileModal');
const editUserModal    = document.getElementById('editUserModal');
const editUsername     = document.getElementById('editUsername');
const deleteUserBtn    = document.getElementById('deleteUserBtn');

/* Helpers */
function fmt(n) {
  if (n === undefined || n === null) return '0';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function setLoading(text) {
  if (text) {
    loadingBar.querySelector('.load-text').textContent = text;
    loadingBar.classList.remove('hidden');
  } else {
    loadingBar.classList.add('hidden');
  }
}

/* Cache helpers — store fetched profiles in localStorage for 1 hour */
const CACHE_KEY = 'gittrace_cache';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; }
}
function setCache(obj) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch {}
}
function getCachedUser(username) {
  const c = getCache();
  const entry = c[username.toLowerCase()];
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}
function setCachedUser(username, data) {
  const c = getCache();
  c[username.toLowerCase()] = { data, ts: Date.now() };
  setCache(c);
}

/* GitHub API — with cache */
async function fetchUser(username) {
  const cached = getCachedUser(username);
  if (cached) return cached;
  try {
    const res = await fetch('https://api.github.com/users/' + username);
    if (!res.ok) return null;
    const data = await res.json();
    setCachedUser(username, data);
    return data;
  } catch { return null; }
}

/* Persist to server */
async function saveUsersToFile() {
  try {
    await fetch('/save-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(users)
    });
  } catch (e) { console.warn('Could not save:', e); }
}

/* Load all users sequentially */
async function loadAllUsers() {
  userData = [];
  let loaded = 0;
  for (const username of users) {
    setLoading('Loading ' + (loaded + 1) + ' / ' + users.length + ' \u2014 @' + username);
    const data = await fetchUser(username);
    if (data) userData.push(data);
    loaded++;
    if (loaded % 5 === 0 || loaded === users.length) {
      renderLeaderboard();
      renderExplore();
    }
    if (loaded < users.length) await new Promise(r => setTimeout(r, 150));
  }
  setLoading(null);
  if (userData.length === 0 && users.length > 0) {
    setLoading('GitHub API rate limit reached. Cached data will appear once available. Try again shortly.');
  }
  renderLeaderboard();
  renderExplore();
  renderCharts();
}

/* Sorted data */
function sortedUsers() {
  return [...userData].sort((a, b) => {
    if (currentFilter === 'followers') return b.followers - a.followers;
    if (currentFilter === 'repos')     return b.public_repos - a.public_repos;
    if (currentFilter === 'following') return b.following - a.following;
    return 0;
  });
}
function filterLabel() {
  if (currentFilter === 'followers') return 'Followers';
  if (currentFilter === 'repos')     return 'Repositories';
  if (currentFilter === 'following') return 'Following';
  return '';
}

/* Leaderboard */
function renderLeaderboard() {
  const sorted = sortedUsers();
  leaderboardTitle.textContent = 'Top by ' + filterLabel();
  leaderboardList.innerHTML = '';
  sorted.forEach((u, i) => {
    const item = document.createElement('div');
    item.className = 'leaderboard-item';
    const rankMeta = i === 0 ? ['gold','#1'] : i === 1 ? ['silver','#2'] : i === 2 ? ['bronze','#3'] : ['', String(i+1)];
    const value = currentFilter === 'followers' ? u.followers : currentFilter === 'repos' ? u.public_repos : u.following;
    item.innerHTML =
      '<div class="rank-badge ' + rankMeta[0] + '">' + rankMeta[1] + '</div>' +
      '<img class="lb-avatar" src="' + u.avatar_url + '" alt="' + u.login + '" loading="lazy">' +
      '<div class="lb-info">' +
        '<div class="lb-name">' + (u.name || u.login) + '</div>' +
        '<div class="lb-value">' + fmt(value) + ' ' + filterLabel().toLowerCase() + '</div>' +
      '</div>';
    item.addEventListener('click', () => openProfile(u));
    leaderboardList.appendChild(item);
  });
}

/* Explore grid */
function renderExplore() {
  userListEl.innerHTML = '';
  userData.forEach(u => {
    const card = document.createElement('div');
    card.className = 'user-card';
    card.innerHTML =
      '<button class="card-edit-btn" title="Remove">&#x2715;</button>' +
      '<img class="card-avatar" src="' + u.avatar_url + '" alt="' + u.login + '" loading="lazy">' +
      '<div class="card-name">' + (u.name || u.login) + '</div>' +
      '<div class="card-stats">' +
        '<div class="stat-box"><div class="stat-label">Followers</div><div class="stat-num">' + fmt(u.followers) + '</div></div>' +
        '<div class="stat-box"><div class="stat-label">Repos</div><div class="stat-num">' + fmt(u.public_repos) + '</div></div>' +
        '<div class="stat-box"><div class="stat-label">Following</div><div class="stat-num">' + fmt(u.following) + '</div></div>' +
      '</div>';
    card.querySelector('.card-edit-btn').addEventListener('click', e => {
      e.stopPropagation();
      openEditModal(u.login);
    });
    card.addEventListener('click', () => openProfile(u));
    userListEl.appendChild(card);
  });
}

/* Charts */
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
        datasets: [{ label: 'Followers', data: top10.map(u => u.followers),
          backgroundColor: 'rgba(59,130,246,0.6)', borderColor: '#3b82f6', borderWidth: 1, borderRadius: 4 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }
  const len = userData.length || 1;
  const avg = fn => Math.round(userData.reduce((s,u) => s + u[fn], 0) / len);
  const ctxStats = document.getElementById('statsDistributionChart');
  if (ctxStats) {
    chartStats = new Chart(ctxStats, {
      type: 'doughnut',
      data: {
        labels: ['Avg Followers', 'Avg Repos', 'Avg Following'],
        datasets: [{ data: [avg('followers'), avg('public_repos'), avg('following')],
          backgroundColor: ['#3b82f6','#8b5cf6','#22c55e'], borderColor: '#1a2332', borderWidth: 2 }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom',
        labels: { color: '#9ca3af', padding: 16, boxWidth: 12 } } } }
    });
  }
}

/* Profile modal */
function openProfile(u) {
  document.getElementById('modalAvatar').src              = u.avatar_url;
  document.getElementById('modalUsername').textContent    = u.name || u.login;
  document.getElementById('modalBio').textContent         = u.bio || 'No bio available.';
  document.getElementById('modalFollowers').textContent   = fmt(u.followers);
  document.getElementById('modalFollowing').textContent   = fmt(u.following);
  document.getElementById('modalRepos').textContent       = fmt(u.public_repos);
  document.getElementById('modalProfileLink').href        = u.html_url;
  profileModal.classList.add('show');
}

/* Edit modal */
function openEditModal(username) {
  editTarget = username;
  editUsername.textContent = '@' + username;
  editUserModal.classList.add('show');
}

async function deleteUser() {
  if (!editTarget) return;
  users    = users.filter(u => u !== editTarget);
  userData = userData.filter(u => u.login !== editTarget);
  await saveUsersToFile();
  editUserModal.classList.remove('show');
  editTarget = null;
  renderLeaderboard();
  renderExplore();
  renderCharts();
}

/* Add user */
function showMsg(text, type) {
  addMsg.textContent = text;
  addMsg.className   = 'msg ' + type;
  setTimeout(() => { addMsg.className = 'msg'; }, 4000);
}

addUserBtn.addEventListener('click', async () => {
  const username = userInput.value.trim();
  if (!username) { showMsg('Enter a GitHub username.', 'error'); return; }
  if (users.map(u => u.toLowerCase()).includes(username.toLowerCase())) {
    showMsg('User already in dashboard.', 'error'); return;
  }
  addUserBtn.disabled = true;
  addUserBtn.textContent = 'Adding...';
  const data = await fetchUser(username);
  if (!data) {
    showMsg('User not found on GitHub.', 'error');
    addUserBtn.disabled = false; addUserBtn.textContent = 'Add User'; return;
  }
  users.push(data.login);
  userData.push(data);
  await saveUsersToFile();
  renderLeaderboard(); renderExplore(); renderCharts();
  showMsg('@' + data.login + ' added successfully!', 'success');
  userInput.value = '';
  addUserBtn.disabled = false; addUserBtn.textContent = 'Add User';
});

userInput.addEventListener('keydown', e => { if (e.key === 'Enter') addUserBtn.click(); });

/* Tab switching */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    const sec = document.getElementById(btn.dataset.tab + 'Section');
    if (sec) sec.classList.add('active');
  });
});

/* Filter buttons */
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderLeaderboard();
    renderCharts();
  });
});

/* Modal close */
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => {
    profileModal.classList.remove('show');
    editUserModal.classList.remove('show');
  });
});
[profileModal, editUserModal].forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
});
deleteUserBtn.addEventListener('click', deleteUser);

/* Init */
async function init() {
  try {
    const res = await fetch('/gitusers.json');
    users = await res.json();
  } catch { users = []; }
  await loadAllUsers();
}
init();
