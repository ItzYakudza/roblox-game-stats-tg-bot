// ============================================
// TELEGRAM WEBAPP INIT
// ============================================
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// ============================================
// LOCALIZATION
// ============================================
let translations = { ru: {}, en: {} };

async function loadTranslations() {
    try {
        const [ruRes, enRes] = await Promise.all([
            fetch('lang/ru.json'),
            fetch('lang/en.json')
        ]);
        translations.ru = await ruRes.json();
        translations.en = await enRes.json();
        console.log('✅ Translations loaded');
    } catch (e) {
        console.error('❌ Failed to load translations:', e);
        // Fallback - встроенные переводы
        translations = {
            ru: {
                loading: 'Загрузка...',
                nav_dashboard: 'Главная',
                nav_games: 'Игры',
                nav_profile: 'Профиль',
                // ... остальные ключи
            },
            en: {
                loading: 'Loading...',
                nav_dashboard: 'Dashboard',
                nav_games: 'Games',
                nav_profile: 'Profile',
                // ... остальные ключи
            }
        };
    }
}

// ============================================
// APP STATE
// ============================================
let state = {
    user: {
        id: tg.initDataUnsafe?.user?.id || 0,
        firstName: tg.initDataUnsafe?.user?.first_name || 'User',
        lastName: tg.initDataUnsafe?.user?.last_name || '',
        username: tg.initDataUnsafe?.user?.username || '',
        isPremium: tg.initDataUnsafe?.user?.is_premium || false,
        photoUrl: tg.initDataUnsafe?.user?.photo_url || null
    },
    language: 'ru',
    theme: 'dark',
    roblox: null,
    games: [],
    currentGame: null
};

// ============================================
// ROBLOX API (через прокси для CORS)
// ============================================
const ROBLOX_API = {
    // Используем публичные эндпоинты или прокси
    async getUser(userId) {
        try {
            const res = await fetch(`https://users.roblox.com/v1/users/${userId}`);
            if (!res.ok) throw new Error('User not found');
            return await res.json();
        } catch (e) {
            console.error('Roblox API error:', e);
            return null;
        }
    },

    async searchUser(username) {
        try {
            const res = await fetch(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=1`);
            if (!res.ok) throw new Error('Search failed');
            const data = await res.json();
            return data.data?.[0] || null;
        } catch (e) {
            console.error('Roblox API error:', e);
            return null;
        }
    },

    async getUserAvatar(userId) {
        try {
            const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`);
            if (!res.ok) throw new Error('Avatar not found');
            const data = await res.json();
            return data.data?.[0]?.imageUrl || null;
        } catch (e) {
            return null;
        }
    },

    async getGame(universeId) {
        try {
            const res = await fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
            if (!res.ok) throw new Error('Game not found');
            const data = await res.json();
            return data.data?.[0] || null;
        } catch (e) {
            console.error('Roblox API error:', e);
            return null;
        }
    },

    async getGameIcon(universeId) {
        try {
            const res = await fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=150x150&format=Png`);
            if (!res.ok) throw new Error('Icon not found');
            const data = await res.json();
            return data.data?.[0]?.imageUrl || null;
        } catch (e) {
            return null;
        }
    },

    async getGameThumbnail(universeId) {
        try {
            const res = await fetch(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${universeId}&size=768x432&format=Png`);
            if (!res.ok) throw new Error('Thumbnail not found');
            const data = await res.json();
            return data.data?.[0]?.thumbnails?.[0]?.imageUrl || null;
        } catch (e) {
            return null;
        }
    },

    async getUniverseIdFromPlace(placeId) {
        try {
            const res = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
            if (!res.ok) throw new Error('Universe not found');
            const data = await res.json();
            return data.universeId || null;
        } catch (e) {
            return null;
        }
    }
};

// ============================================
// STORAGE
// ============================================
const Storage = {
    key: `roblox_stats_${state.user.id}`,

    save() {
        localStorage.setItem(this.key, JSON.stringify({
            language: state.language,
            theme: state.theme,
            roblox: state.roblox,
            games: state.games
        }));
    },

    load() {
        try {
            const saved = localStorage.getItem(this.key);
            if (saved) {
                const data = JSON.parse(saved);
                state.language = data.language || 'ru';
                state.theme = data.theme || 'dark';
                state.roblox = data.roblox || null;
                state.games = data.games || [];
            }
        } catch (e) {
            console.error('Storage load error:', e);
        }
    }
};

// ============================================
// TRANSLATION HELPER
// ============================================
function t(key) {
    return translations[state.language]?.[key] || translations['en'][key] || key;
}

function updateTranslations() {
    document.querySelectorAll('[data-lang]').forEach(el => {
        const key = el.getAttribute('data-lang');
        el.textContent = t(key);
    });
}

// ============================================
// THEME
// ============================================
function setTheme(theme) {
    state.theme = theme;
    document.body.setAttribute('data-theme', theme);
    document.getElementById('themeToggle').checked = theme === 'light';
    document.getElementById('currentTheme').textContent = t(theme);
    
    // Обновляем тему Telegram
    if (theme === 'dark') {
        tg.setHeaderColor('#1a1a24');
        tg.setBackgroundColor('#0f0f14');
    } else {
        tg.setHeaderColor('#ffffff');
        tg.setBackgroundColor('#f5f5f7');
    }
    
    Storage.save();
}

// ============================================
// UI HELPERS
// ============================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = { success: '✅', error: '❌', warning: '⚠️' };
    toast.innerHTML = `${icons[type] || '📢'} ${message}`;
    
    container.appendChild(toast);
    tg.HapticFeedback.notificationOccurred(type === 'error' ? 'error' : 'success');
    
    setTimeout(() => {
        toast.style.animation = 'toastIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
    tg.HapticFeedback.impactOccurred('medium');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

function formatNumber(num) {
    if (!num) return '0';
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// ============================================
// UPDATE UI
// ============================================
function updateUI() {
    updateTranslations();
    updateTelegramProfile();
    updateRobloxProfile();
    updateGamesUI();
}

function updateTelegramProfile() {
    document.getElementById('tgName').textContent = `${state.user.firstName} ${state.user.lastName}`.trim();
    document.getElementById('tgUsername').textContent = state.user.username ? `@${state.user.username}` : '';
    document.getElementById('tgId').textContent = `ID: ${state.user.id}`;
    
    const premiumBadge = document.getElementById('tgPremium');
    premiumBadge.classList.toggle('hidden', !state.user.isPremium);
    
    if (state.user.photoUrl) {
        document.getElementById('tgAvatar').innerHTML = `<img src="${state.user.photoUrl}" alt="">`;
    }
}

function updateRobloxProfile() {
    const noProfile = document.getElementById('noRobloxProfile');
    const profileInfo = document.getElementById('robloxProfileInfo');
    const settingTitle = document.getElementById('robloxSettingTitle');
    const settingDesc = document.getElementById('robloxSettingDesc');

    if (state.roblox) {
        noProfile.classList.add('hidden');
        profileInfo.classList.remove('hidden');
        
        document.getElementById('robloxAvatar').src = state.roblox.avatar || '';
        document.getElementById('robloxUsername').textContent = state.roblox.username;
        document.getElementById('robloxDisplayName').textContent = state.roblox.displayName || '';
        
        settingTitle.textContent = state.roblox.username;
        settingTitle.removeAttribute('data-lang');
        settingDesc.textContent = `ID: ${state.roblox.id}`;
        settingDesc.removeAttribute('data-lang');
    } else {
        noProfile.classList.remove('hidden');
        profileInfo.classList.add('hidden');
        
        settingTitle.textContent = t('not_linked');
        settingTitle.setAttribute('data-lang', 'not_linked');
        settingDesc.textContent = t('link_roblox_desc');
        settingDesc.setAttribute('data-lang', 'link_roblox_desc');
    }
}

async function updateGamesUI() {
    const dashboardList = document.getElementById('dashboardGamesList');
    const gamesGrid = document.getElementById('gamesGrid');
    const noGames = document.getElementById('noGames');

    // Обновляем статистику
    let totalVisits = 0;
    let totalPlaying = 0;
    let totalRating = 0;

    if (state.games.length === 0) {
        dashboardList.innerHTML = `<p class="empty-state">${t('no_games_added')}</p>`;
        gamesGrid.innerHTML = '';
        noGames.classList.remove('hidden');
        
        document.getElementById('totalGames').textContent = '0';
        document.getElementById('totalVisits').textContent = '0';
        document.getElementById('totalPlaying').textContent = '0';
        document.getElementById('avgRating').textContent = '0%';
        return;
    }

    noGames.classList.add('hidden');

    // Загружаем данные игр
    const gamesHtml = [];
    const dashboardHtml = [];

    for (const game of state.games) {
        // Получаем актуальные данные
        const gameData = await ROBLOX_API.getGame(game.universeId);
        const thumbnail = await ROBLOX_API.getGameThumbnail(game.universeId);

        if (gameData) {
            game.data = gameData;
            game.thumbnail = thumbnail;
            
            totalVisits += gameData.visits || 0;
            totalPlaying += gameData.playing || 0;
            
            const upvotes = gameData.upVotes || 0;
            const downvotes = gameData.downVotes || 0;
            const rating = upvotes + downvotes > 0 
                ? Math.round((upvotes / (upvotes + downvotes)) * 100) 
                : 0;
            totalRating += rating;

            // Карточка для грида
            gamesHtml.push(`
                <div class="game-card" onclick="showGameDetails('${game.universeId}')">
                    <img class="game-card-image" src="${thumbnail || ''}" alt="${gameData.name}" onerror="this.src='https://via.placeholder.com/768x432?text=No+Image'">
                    <div class="game-card-content">
                        <div class="game-card-name">${gameData.name}</div>
                        <div class="game-card-stats">
                            <span>▶️ ${formatNumber(gameData.playing)}</span>
                            <span>👁️ ${formatNumber(gameData.visits)}</span>
                        </div>
                    </div>
                </div>
            `);

            // Элемент для дашборда
            dashboardHtml.push(`
                <div class="game-item" onclick="showGameDetails('${game.universeId}')">
                    <img class="game-thumb" src="${thumbnail || ''}" alt="${gameData.name}" onerror="this.src='https://via.placeholder.com/60x60?text=?'">
                    <div class="game-info">
                        <div class="game-name">${gameData.name}</div>
                        <div class="game-stats-mini">
                            <span>▶️ ${formatNumber(gameData.playing)}</span>
                            <span>👁️ ${formatNumber(gameData.visits)}</span>
                        </div>
                    </div>
                </div>
            `);
        }
    }

    gamesGrid.innerHTML = gamesHtml.join('');
    dashboardList.innerHTML = dashboardHtml.slice(0, 3).join('') || `<p class="empty-state">${t('no_games_added')}</p>`;

    // Обновляем статистику
    document.getElementById('totalGames').textContent = state.games.length;
    document.getElementById('totalVisits').textContent = formatNumber(totalVisits);
    document.getElementById('totalPlaying').textContent = formatNumber(totalPlaying);
    document.getElementById('avgRating').textContent = state.games.length > 0 
        ? Math.round(totalRating / state.games.length) + '%' 
        : '0%';

    Storage.save();
}

// ============================================
// GAME DETAILS
// ============================================
async function showGameDetails(universeId) {
    const game = state.games.find(g => g.universeId == universeId);
    if (!game || !game.data) return;

    state.currentGame = game;
    const data = game.data;

    const upvotes = data.upVotes || 0;
    const downvotes = data.downVotes || 0;
    const rating = upvotes + downvotes > 0 
        ? Math.round((upvotes / (upvotes + downvotes)) * 100) 
        : 0;

    document.getElementById('gameDetailsTitle').textContent = data.name;
    document.getElementById('gameDetailsBody').innerHTML = `
        <div class="game-details-header">
            <img class="game-details-image" src="${game.thumbnail || ''}" alt="${data.name}">
            <div class="game-details-info">
                <h3>${data.name}</h3>
                <p class="game-details-creator">by ${data.creator?.name || 'Unknown'}</p>
            </div>
        </div>
        
        <p style="color: var(--text-secondary); font-size: 14px;">${data.description?.slice(0, 200) || 'No description'}...</p>
        
        <div class="game-details-stats">
            <div class="detail-stat">
                <span class="value">${formatNumber(data.visits)}</span>
                <span class="label">${t('visits')}</span>
            </div>
            <div class="detail-stat">
                <span class="value">${formatNumber(data.playing)}</span>
                <span class="label">${t('playing')}</span>
            </div>
            <div class="detail-stat">
                <span class="value">${formatNumber(data.favoritedCount)}</span>
                <span class="label">${t('favorites')}</span>
            </div>
            <div class="detail-stat">
                <span class="value">${rating}%</span>
                <span class="label">👍 ${formatNumber(upvotes)} / 👎 ${formatNumber(downvotes)}</span>
            </div>
        </div>
    `;

    openModal('gameDetailsModal');
}

// ============================================
// ROBLOX ACCOUNT LINKING
// ============================================
let tempRobloxUser = null;

async function searchRobloxUser() {
    const input = document.getElementById('robloxInput').value.trim();
    if (!input) return;

    const searchBtn = document.getElementById('searchRobloxBtn');
    searchBtn.disabled = true;
    searchBtn.textContent = '...';

    let user = null;

    // Проверяем, это ID или username
    if (/^\d+$/.test(input)) {
        user = await ROBLOX_API.getUser(input);
    } else {
        const searchResult = await ROBLOX_API.searchUser(input);
        if (searchResult) {
            user = await ROBLOX_API.getUser(searchResult.id);
        }
    }

    searchBtn.disabled = false;
    searchBtn.textContent = t('search');

    if (user) {
        const avatar = await ROBLOX_API.getUserAvatar(user.id);
        tempRobloxUser = { ...user, avatar };

        document.getElementById('previewAvatar').src = avatar || '';
        document.getElementById('previewUsername').textContent = user.name;
        document.getElementById('previewDisplayName').textContent = user.displayName;
        document.getElementById('robloxPreview').classList.remove('hidden');
        document.getElementById('searchRobloxBtn').classList.add('hidden');
        document.getElementById('confirmLinkBtn').classList.remove('hidden');
    } else {
        showToast(t('error_not_found'), 'error');
    }
}

function confirmLinkRoblox() {
    if (!tempRobloxUser) return;

    state.roblox = {
        id: tempRobloxUser.id,
        username: tempRobloxUser.name,
        displayName: tempRobloxUser.displayName,
        avatar: tempRobloxUser.avatar
    };

    Storage.save();
    updateRobloxProfile();
    closeModal('linkRobloxModal');
    showToast(t('success_linked'));

    // Reset modal
    tempRobloxUser = null;
    document.getElementById('robloxInput').value = '';
    document.getElementById('robloxPreview').classList.add('hidden');
    document.getElementById('searchRobloxBtn').classList.remove('hidden');
    document.getElementById('confirmLinkBtn').classList.add('hidden');
}

function unlinkRoblox() {
    if (confirm(t('confirm_unlink'))) {
        state.roblox = null;
        Storage.save();
        updateRobloxProfile();
        showToast(t('success_unlinked'));
    }
}

// ============================================
// ADDING GAMES
// ============================================
let tempGame = null;

async function searchGame() {
    const input = document.getElementById('gameInput').value.trim();
    if (!input) return;

    const searchBtn = document.getElementById('searchGameBtn');
    searchBtn.disabled = true;
    searchBtn.textContent = '...';

    let universeId = null;

    // Парсим ввод
    if (/^\d+$/.test(input)) {
        // Это может быть place ID или universe ID
        // Сначала пробуем как universe ID
        let game = await ROBLOX_API.getGame(input);
        if (game) {
            universeId = input;
        } else {
            // Пробуем как place ID
            universeId = await ROBLOX_API.getUniverseIdFromPlace(input);
        }
    } else if (input.includes('roblox.com')) {
        // Парсим URL
        const match = input.match(/games\/(\d+)/);
        if (match) {
            universeId = await ROBLOX_API.getUniverseIdFromPlace(match[1]);
        }
    }

    searchBtn.disabled = false;
    searchBtn.textContent = t('search');

    if (universeId) {
        const game = await ROBLOX_API.getGame(universeId);
        const icon = await ROBLOX_API.getGameIcon(universeId);

        if (game) {
            tempGame = { universeId, ...game, icon };

            document.getElementById('gamePreviewImage').src = icon || '';
            document.getElementById('gamePreviewName').textContent = game.name;
            document.getElementById('gamePreviewCreator').textContent = `by ${game.creator?.name || 'Unknown'}`;
            document.getElementById('gamePreview').classList.remove('hidden');
            document.getElementById('searchGameBtn').classList.add('hidden');
            document.getElementById('confirmAddGameBtn').classList.remove('hidden');
        } else {
            showToast(t('error_not_found'), 'error');
        }
    } else {
        showToast(t('error_not_found'), 'error');
    }
}

function confirmAddGame() {
    if (!tempGame) return;

    // Проверяем, не добавлена ли уже
    if (state.games.find(g => g.universeId == tempGame.universeId)) {
        showToast('Game already added', 'warning');
        return;
    }

    state.games.push({
        universeId: tempGame.universeId,
        name: tempGame.name,
        addedAt: Date.now()
    });

    Storage.save();
    updateGamesUI();
    closeModal('addGameModal');
    showToast(t('success_game_added'));

    // Reset modal
    tempGame = null;
    document.getElementById('gameInput').value = '';
    document.getElementById('gamePreview').classList.add('hidden');
    document.getElementById('searchGameBtn').classList.remove('hidden');
    document.getElementById('confirmAddGameBtn').classList.add('hidden');
}

function removeCurrentGame() {
    if (!state.currentGame) return;

    if (confirm(t('confirm_remove_game'))) {
        state.games = state.games.filter(g => g.universeId != state.currentGame.universeId);
        Storage.save();
        updateGamesUI();
        closeModal('gameDetailsModal');
        showToast(t('success_game_removed'));
    }
}

// ============================================
// NAVIGATION
// ============================================
function initNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;

            navBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(tab).classList.add('active');

            tg.HapticFeedback.impactOccurred('light');
        });
    });
}

// ============================================
// EVENT LISTENERS
// ============================================
function initEventListeners() {
    // Settings button
    document.getElementById('settingsBtn').addEventListener('click', () => {
        document.querySelector('[data-tab="profile"]').click();
    });

    // Language select
    document.getElementById('languageSelect').addEventListener('change', (e) => {
        state.language = e.target.value;
        document.getElementById('currentLanguage').textContent = e.target.value === 'ru' ? 'Русский' : 'English';
        Storage.save();
        updateTranslations();
        tg.HapticFeedback.impactOccurred('light');
    });

    // Theme toggle
    document.getElementById('themeToggle').addEventListener('change', (e) => {
        setTheme(e.target.checked ? 'light' : 'dark');
        tg.HapticFeedback.impactOccurred('light');
    });

    // Link Roblox buttons
    document.getElementById('linkRobloxBtn').addEventListener('click', () => openModal('linkRobloxModal'));
    document.getElementById('manageRobloxBtn').addEventListener('click', () => {
        if (state.roblox) {
            unlinkRoblox();
        } else {
            openModal('linkRobloxModal');
        }
    });
    document.getElementById('unlinkRobloxBtn').addEventListener('click', unlinkRoblox);

    // Search & confirm Roblox
    document.getElementById('searchRobloxBtn').addEventListener('click', searchRobloxUser);
    document.getElementById('confirmLinkBtn').addEventListener('click', confirmLinkRoblox);
    document.getElementById('robloxInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchRobloxUser();
    });

    // Add game buttons
    document.getElementById('addGameBtn').addEventListener('click', () => openModal('addGameModal'));
    document.getElementById('addFirstGameBtn').addEventListener('click', () => openModal('addGameModal'));
    document.getElementById('viewAllGamesBtn').addEventListener('click', () => {
        document.querySelector('[data-tab="games"]').click();
    });

    // Search & confirm game
    document.getElementById('searchGameBtn').addEventListener('click', searchGame);
    document.getElementById('confirmAddGameBtn').addEventListener('click', confirmAddGame);
    document.getElementById('gameInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchGame();
    });

    // Remove game
    document.getElementById('removeGameBtn').addEventListener('click', removeCurrentGame);

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });

    // Close modal on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeAllModals();
        });
    });
}

// ============================================
// INITIALIZATION
// ============================================
async function init() {
    // Load saved data
    Storage.load();

    // Set initial theme
    setTheme(state.theme);

    // Set language selector
    document.getElementById('languageSelect').value = state.language;
    document.getElementById('currentLanguage').textContent = state.language === 'ru' ? 'Русский' : 'English';

    // Initialize components
    initNavigation();
    initEventListeners();

    // Update UI
    updateUI();

    // Hide loader
    setTimeout(() => {
        document.getElementById('loader').classList.add('hidden');
        document.getElementById('main').classList.remove('hidden');
    }, 500);

    console.log('🎮 Roblox Game Stats initialized!');
}

document.addEventListener('DOMContentLoaded', init);