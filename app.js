const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

let state = {
    language: 'ru',
    theme: 'dark',
    roblox: null,
    games: []
};

let translations = {};
const tgUserId = tg.initDataUnsafe?.user?.id || 'guest';
const STORAGE_KEY = `roblox_stats_${tgUserId}`;

// === ЗАГРУЗКА ПЕРЕВОДОВ ===
async function loadTranslations() {
    try {
        const [ruRes, enRes] = await Promise.all([
            fetch('lang/ru.json'),
            fetch('lang/en.json')
        ]);
        translations.ru = await ruRes.json();
        translations.en = await enRes.json();
    } catch (e) {
        console.error('Translations error:', e);
    }
}

function t(key) {
    return translations[state.language]?.[key] || key;
}

function updateTexts() {
    document.querySelectorAll('[data-lang]').forEach(el => {
        el.textContent = t(el.dataset.lang);
    });
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
        themeSelect.options[0].text = t('dark');
        themeSelect.options[1].text = t('light');
    }
}

// === ХРАНЕНИЕ ===
function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function load() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) state = { ...state, ...JSON.parse(saved) };
    } catch (e) {}
}

// === ТЕМА ===
function setTheme(theme) {
    state.theme = theme;
    document.body.dataset.theme = theme;
    document.getElementById('themeSelect').value = theme;
    save();
}

// === ФОРМАТИРОВАНИЕ ===
function formatNumber(n) {
    if (!n) return '0';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
}

function formatPercent(up, down) {
    const total = up + down;
    if (total === 0) return '0%';
    return Math.round((up / total) * 100) + '%';
}

// ============================================
// ROBLOX API — ПОЛЬЗОВАТЕЛЬ
// ============================================
async function getUserIdByUsername(username) {
    try {
        const res = await fetch(`https://api.roblox.com/users/get-by-username?username=${encodeURIComponent(username)}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.Id || null;
    } catch (e) {
        return null;
    }
}

async function getUserInfo(userId) {
    try {
        const res = await fetch(`https://users.roblox.com/v1/users/${userId}`);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

async function getUserAvatar(userId) {
    try {
        const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`);
        const data = await res.json();
        return data.data?.[0]?.imageUrl || '';
    } catch (e) {
        return '';
    }
}

async function getFriendsCount(userId) {
    try {
        const res = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`);
        const data = await res.json();
        return data.count || 0;
    } catch (e) {
        return 0;
    }
}

async function getPresence(userId) {
    try {
        const res = await fetch('https://presence.roblox.com/v1/presence/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds: [userId] })
        });
        const data = await res.json();
        const p = data.userPresences?.[0];
        if (!p) return { status: 'offline', location: '' };
        
        const statusMap = { 0: 'offline', 1: 'online', 2: 'in_game', 3: 'in_studio' };
        return {
            status: statusMap[p.userPresenceType] || 'offline',
            location: p.lastLocation || ''
        };
    } catch (e) {
        return { status: 'offline', location: '' };
    }
}

async function getPreviousUsernames(userId) {
    try {
        const res = await fetch(`https://users.roblox.com/v1/users/${userId}/username-history?limit=5`);
        const data = await res.json();
        return data.data?.map(u => u.name) || [];
    } catch (e) {
        return [];
    }
}

// Полный поиск пользователя
async function searchRobloxUser(query) {
    query = query.trim();
    if (!query) return null;

    let userId;
    if (/^\d+$/.test(query)) {
        userId = parseInt(query);
    } else {
        userId = await getUserIdByUsername(query);
        if (!userId) return null;
    }

    const [info, avatar, friends, presence, prevNames] = await Promise.all([
        getUserInfo(userId),
        getUserAvatar(userId),
        getFriendsCount(userId),
        getPresence(userId),
        getPreviousUsernames(userId)
    ]);

    if (!info) return null;

    return {
        id: userId,
        username: info.name,
        displayName: info.displayName || info.name,
        description: info.description || '',
        created: info.created ? new Date(info.created).toLocaleDateString() : '',
        isBanned: info.isBanned || false,
        avatar,
        friends,
        presence,
        previousUsernames: prevNames
    };
}

// ============================================
// ROBLOX API — ИГРЫ
// ============================================
async function getUniverseIdByPlaceId(placeId) {
    try {
        const res = await fetch(`https://api.roblox.com/universes/get-universe-containing-place?placeid=${placeId}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.UniverseId || null;
    } catch (e) {
        return null;
    }
}

async function getGameStats(universeId) {
    try {
        const res = await fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
        const data = await res.json();
        return data.data?.[0] || null;
    } catch (e) {
        return null;
    }
}

async function getGameVotes(universeId) {
    try {
        const res = await fetch(`https://games.roblox.com/v1/games/${universeId}/votes`);
        const data = await res.json();
        return {
            upVotes: data.upVotes || 0,
            downVotes: data.downVotes || 0
        };
    } catch (e) {
        return { upVotes: 0, downVotes: 0 };
    }
}

async function getGameThumbnail(universeId) {
    try {
        const res = await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=150x150&format=Png`);
        const data = await res.json();
        return data.data?.[0]?.imageUrl || '';
    } catch (e) {
        return '';
    }
}

async function getGameServers(universeId) {
    try {
        const res = await fetch(`https://games.roblox.com/v1/games/${universeId}/servers/Public?sortOrder=Asc&limit=5`);
        const data = await res.json();
        return data.data || [];
    } catch (e) {
        return [];
    }
}

// Полная информация об игре
async function getFullGameInfo(query) {
    query = query.trim();
    if (!query) return null;

    // Извлекаем ID из URL
    const urlMatch = query.match(/games\/(\d+)/);
    if (urlMatch) query = urlMatch[1];

    let universeId;
    if (/^\d+$/.test(query)) {
        // Пробуем сначала как place ID
        universeId = await getUniverseIdByPlaceId(query);
        // Если не получилось, пробуем как universe ID
        if (!universeId) universeId = parseInt(query);
    } else {
        return null;
    }

    const [stats, votes, thumbnail] = await Promise.all([
        getGameStats(universeId),
        getGameVotes(universeId),
        getGameThumbnail(universeId)
    ]);

    if (!stats) return null;

    return {
        universeId: stats.id,
        placeId: stats.rootPlaceId,
        name: stats.name,
        description: stats.description || '',
        creator: stats.creator?.name || 'Unknown',
        creatorId: stats.creator?.id || 0,
        playing: stats.playing || 0,
        visits: stats.visits || 0,
        favorites: stats.favoritedCount || 0,
        maxPlayers: stats.maxPlayers || 0,
        upVotes: votes.upVotes,
        downVotes: votes.downVotes,
        rating: formatPercent(votes.upVotes, votes.downVotes),
        thumbnail
    };
}

// ============================================
// НАВИГАЦИЯ
// ============================================
function initNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
            tg.HapticFeedback?.impactOccurred?.('light');
        });
    });
}

// ============================================
// МОДАЛЬНЫЕ ОКНА
// ============================================
function showModal(id) {
    document.getElementById(id)?.classList.add('active');
}

function hideAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

// === ПРИВЯЗКА ROBLOX ===
function showLinkRobloxModal() {
    document.getElementById('modalTitle').textContent = t('link_roblox');
    document.getElementById('modalBody').innerHTML = `
        <input type="text" id="robloxInput" placeholder="${t('enter_username')}" autofocus>
        <div id="robloxPreview" class="hidden" style="margin:16px 0"></div>
        <button class="btn btn-primary" id="searchBtn">${t('search')}</button>
    `;
    showModal('modal');

    const input = document.getElementById('robloxInput');
    const btn = document.getElementById('searchBtn');
    const preview = document.getElementById('robloxPreview');

    const search = async () => {
        const query = input.value.trim();
        if (!query) return;

        btn.textContent = '...';
        btn.disabled = true;
        preview.classList.add('hidden');

        const user = await searchRobloxUser(query);

        if (user) {
            const statusText = {
                'offline': 'Оффлайн',
                'online': 'Онлайн',
                'in_game': 'В игре',
                'in_studio': 'В студии'
            }[user.presence.status] || 'Оффлайн';

            const statusColor = {
                'offline': '#888',
                'online': '#22c55e',
                'in_game': '#3b82f6',
                'in_studio': '#f59e0b'
            }[user.presence.status] || '#888';

            preview.innerHTML = `
                <div style="padding:16px;background:var(--bg-secondary);border-radius:12px">
                    <div style="display:flex;gap:12px;align-items:center">
                        <img src="${user.avatar}" width="64" height="64" style="border-radius:50%">
                        <div style="flex:1">
                            <div style="font-weight:600;font-size:16px">${user.username}</div>
                            <div style="color:var(--text-secondary);font-size:14px">${user.displayName}</div>
                            <div style="display:flex;align-items:center;gap:6px;margin-top:6px">
                                <span style="width:8px;height:8px;border-radius:50%;background:${statusColor}"></span>
                                <span style="font-size:13px">${statusText}</span>
                            </div>
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">
                        <div style="text-align:center;padding:12px;background:var(--bg);border-radius:8px">
                            <div style="font-size:18px;font-weight:700;color:var(--accent)">${formatNumber(user.friends)}</div>
                            <div style="font-size:12px;color:var(--text-secondary)">Друзей</div>
                        </div>
                        <div style="text-align:center;padding:12px;background:var(--bg);border-radius:8px">
                            <div style="font-size:14px;font-weight:500">${user.created}</div>
                            <div style="font-size:12px;color:var(--text-secondary)">Регистрация</div>
                        </div>
                    </div>
                    ${user.previousUsernames.length > 0 ? `
                        <div style="margin-top:12px;font-size:12px;color:var(--text-secondary)">
                            Прошлые ники: ${user.previousUsernames.join(', ')}
                        </div>
                    ` : ''}
                </div>
            `;
            preview.classList.remove('hidden');
            btn.textContent = t('confirm');
            btn.disabled = false;
            btn.onclick = () => {
                state.roblox = user;
                save();
                updateRobloxUI();
                hideAllModals();
            };
        } else {
            preview.innerHTML = `<p style="color:#ef4444;text-align:center">${t('not_found')}</p>`;
            preview.classList.remove('hidden');
            btn.textContent = t('search');
            btn.disabled = false;
        }
    };

    btn.onclick = search;
    input.addEventListener('keypress', e => e.key === 'Enter' && search());
}

// === ДОБАВЛЕНИЕ ИГРЫ ===
function showAddGameModal() {
    document.getElementById('modalTitle').textContent = t('add_game');
    document.getElementById('modalBody').innerHTML = `
        <input type="text" id="gameInput" placeholder="${t('enter_game_id')}" autofocus>
        <div id="gamePreview" class="hidden" style="margin:16px 0"></div>
        <button class="btn btn-primary" id="searchGameBtn">${t('search')}</button>
    `;
    showModal('modal');

    const input = document.getElementById('gameInput');
    const btn = document.getElementById('searchGameBtn');
    const preview = document.getElementById('gamePreview');

    const search = async () => {
        const query = input.value.trim();
        if (!query) return;

        btn.textContent = '...';
        btn.disabled = true;
        preview.classList.add('hidden');

        const game = await getFullGameInfo(query);

        if (game) {
            preview.innerHTML = `
                <div style="padding:16px;background:var(--bg-secondary);border-radius:12px">
                    <div style="display:flex;gap:12px;align-items:center">
                        <img src="${game.thumbnail}" width="64" height="64" style="border-radius:8px">
                        <div style="flex:1">
                            <div style="font-weight:600">${game.name}</div>
                            <div style="font-size:13px;color:var(--text-secondary)">by ${game.creator}</div>
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px">
                        <div style="text-align:center;padding:10px;background:var(--bg);border-radius:8px">
                            <div style="font-weight:700;color:var(--accent)">${formatNumber(game.playing)}</div>
                            <div style="font-size:11px;color:var(--text-secondary)">Играют</div>
                        </div>
                        <div style="text-align:center;padding:10px;background:var(--bg);border-radius:8px">
                            <div style="font-weight:700;color:var(--accent)">${formatNumber(game.visits)}</div>
                            <div style="font-size:11px;color:var(--text-secondary)">Визитов</div>
                        </div>
                        <div style="text-align:center;padding:10px;background:var(--bg);border-radius:8px">
                            <div style="font-weight:700;color:#22c55e">${game.rating}</div>
                            <div style="font-size:11px;color:var(--text-secondary)">Рейтинг</div>
                        </div>
                    </div>
                </div>
            `;
            preview.classList.remove('hidden');
            btn.textContent = t('add');
            btn.disabled = false;
            btn.onclick = () => {
                if (!state.games.find(g => g.universeId === game.universeId)) {
                    state.games.push(game);
                    save();
                    updateGamesUI();
                }
                hideAllModals();
            };
        } else {
            preview.innerHTML = `<p style="color:#ef4444;text-align:center">${t('not_found')}</p>`;
            preview.classList.remove('hidden');
            btn.textContent = t('search');
            btn.disabled = false;
        }
    };

    btn.onclick = search;
    input.addEventListener('keypress', e => e.key === 'Enter' && search());
}

// === ДЕТАЛИ ИГРЫ ===
let currentGameId = null;

function showGameDetails(universeId) {
    const game = state.games.find(g => g.universeId === universeId);
    if (!game) return;

    currentGameId = universeId;

    document.getElementById('gameModalTitle').textContent = game.name;
    document.getElementById('gameModalBody').innerHTML = `
        <div style="display:flex;gap:16px;margin-bottom:20px">
            <img src="${game.thumbnail}" width="80" height="80" style="border-radius:12px">
            <div>
                <div style="font-weight:600;font-size:16px">${game.name}</div>
                <div style="font-size:13px;color:var(--text-secondary)">by ${game.creator}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">ID: ${game.universeId}</div>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">
            <div style="text-align:center;padding:16px;background:var(--bg-secondary);border-radius:10px">
                <div style="font-size:22px;font-weight:700;color:var(--accent)">${formatNumber(game.visits)}</div>
                <div style="font-size:12px;color:var(--text-secondary)">Визитов</div>
            </div>
            <div style="text-align:center;padding:16px;background:var(--bg-secondary);border-radius:10px">
                <div style="font-size:22px;font-weight:700;color:var(--accent)">${formatNumber(game.playing)}</div>
                <div style="font-size:12px;color:var(--text-secondary)">Играют сейчас</div>
            </div>
            <div style="text-align:center;padding:16px;background:var(--bg-secondary);border-radius:10px">
                <div style="font-size:22px;font-weight:700;color:var(--accent)">${formatNumber(game.favorites)}</div>
                <div style="font-size:12px;color:var(--text-secondary)">В избранном</div>
            </div>
            <div style="text-align:center;padding:16px;background:var(--bg-secondary);border-radius:10px">
                <div style="font-size:22px;font-weight:700;color:#22c55e">${game.rating}</div>
                <div style="font-size:12px;color:var(--text-secondary)">Рейтинг</div>
            </div>
        </div>
        <div style="display:flex;gap:12px;margin-top:16px;font-size:13px;color:var(--text-secondary)">
            <span style="color:#22c55e">${formatNumber(game.upVotes)} лайков</span>
            <span style="color:#ef4444">${formatNumber(game.downVotes)} дизлайков</span>
        </div>
    `;

    showModal('gameModal');
}

function removeCurrentGame() {
    if (!currentGameId) return;
    if (confirm(t('remove_confirm'))) {
        state.games = state.games.filter(g => g.universeId !== currentGameId);
        save();
        updateGamesUI();
        hideAllModals();
        currentGameId = null;
    }
}

// ============================================
// ОБНОВЛЕНИЕ UI
// ============================================
function updateRobloxUI() {
    const linked = document.getElementById('robloxLinked');
    const notLinked = document.getElementById('robloxNotLinked');

    if (state.roblox) {
        notLinked?.classList.add('hidden');
        linked?.classList.remove('hidden');

        const avatar = document.getElementById('robloxAvatarProfile');
        const username = document.getElementById('robloxUsernameProfile');
        const displayName = document.getElementById('robloxDisplayNameProfile');

        if (avatar) avatar.src = state.roblox.avatar;
        if (username) username.textContent = state.roblox.username;
        if (displayName) displayName.textContent = state.roblox.displayName;
    } else {
        linked?.classList.add('hidden');
        notLinked?.classList.remove('hidden');
    }
}

async function updateGamesUI() {
    const list = document.getElementById('gamesList');
    const dash = document.getElementById('dashboardGames');
    const noGames = document.getElementById('noGames');

    if (state.games.length === 0) {
        if (list) list.innerHTML = '';
        if (dash) dash.innerHTML = `<p class="text-secondary">${t('no_games')}</p>`;
        noGames?.classList.remove('hidden');
        document.getElementById('totalGames').textContent = '0';
        document.getElementById('totalVisits').textContent = '0';
        document.getElementById('totalPlaying').textContent = '0';
        return;
    }

    noGames?.classList.add('hidden');

    let totalVisits = 0;
    let totalPlaying = 0;
    let html = '';

    for (const game of state.games) {
        // Обновляем статистику
        const fresh = await getFullGameInfo(game.universeId.toString());
        if (fresh) {
            Object.assign(game, fresh);
        }

        totalVisits += game.visits || 0;
        totalPlaying += game.playing || 0;

        html += `
            <div class="game-item" onclick="showGameDetails(${game.universeId})">
                <img src="${game.thumbnail}" alt="">
                <div class="game-info">
                    <h4>${game.name}</h4>
                    <p>${formatNumber(game.visits)} визитов · ${formatNumber(game.playing)} играют</p>
                </div>
            </div>
        `;
    }

    if (list) list.innerHTML = html;
    if (dash) dash.innerHTML = html;

    document.getElementById('totalGames').textContent = state.games.length;
    document.getElementById('totalVisits').textContent = formatNumber(totalVisits);
    document.getElementById('totalPlaying').textContent = formatNumber(totalPlaying);

    save();
}

function updateProfileUI() {
    const user = tg.initDataUnsafe?.user;
    if (user) {
        const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'User';
        document.getElementById('tgName').textContent = name;
        document.getElementById('tgUsername').textContent = user.username ? `@${user.username}` : '';
        document.getElementById('tgId').textContent = `ID: ${user.id}`;
        document.getElementById('tgAvatar').textContent = name.charAt(0).toUpperCase();
    }
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================
async function init() {
    load();
    await loadTranslations();

    setTheme(state.theme);
    document.getElementById('langSelect').value = state.language;
    document.getElementById('themeSelect').value = state.theme;

    updateTexts();
    updateRobloxUI();
    updateGamesUI();
    updateProfileUI();
    initNav();

    // Кнопки
    document.getElementById('linkRobloxBtnProfile')?.addEventListener('click', showLinkRobloxModal);
    document.getElementById('unlinkRobloxBtn')?.addEventListener('click', () => {
        if (confirm(t('unlink_confirm'))) {
            state.roblox = null;
            save();
            updateRobloxUI();
        }
    });

    document.getElementById('addGameBtn')?.addEventListener('click', showAddGameModal);
    document.getElementById('addGameBtnDash')?.addEventListener('click', showAddGameModal);
    document.getElementById('addFirstGameBtn')?.addEventListener('click', showAddGameModal);
    document.getElementById('removeGameBtn')?.addEventListener('click', removeCurrentGame);

    // Настройки
    document.getElementById('langSelect')?.addEventListener('change', e => {
        state.language = e.target.value;
        save();
        updateTexts();
    });

    document.getElementById('themeSelect')?.addEventListener('change', e => {
        setTheme(e.target.value);
    });

    // Модалки
    document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
        el.addEventListener('click', hideAllModals);
    });

    // Скрыть лоадер
    setTimeout(() => {
        document.getElementById('loader')?.classList.add('hidden');
        document.getElementById('main')?.classList.remove('hidden');
    }, 400);
}

document.addEventListener('DOMContentLoaded', init);