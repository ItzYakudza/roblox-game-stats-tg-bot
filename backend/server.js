require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;

// Database
const db = new Database('roblox_stats.db');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        telegram_id INTEGER PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        language TEXT DEFAULT 'ru',
        theme TEXT DEFAULT 'dark',
        status TEXT DEFAULT 'pending',
        roblox_id INTEGER,
        roblox_username TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        universe_id INTEGER,
        name TEXT,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, universe_id)
    );

    CREATE TABLE IF NOT EXISTS admins (
        telegram_id INTEGER PRIMARY KEY
    );
`);

// Middleware
app.use(cors());
app.use(express.json());

// Валидация Telegram данных
function validateTelegramData(initData) {
    if (!initData) return null;
    
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        urlParams.delete('hash');
        
        const dataCheckString = Array.from(urlParams.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN)
            .digest();
        
        const calculatedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');
        
        if (calculatedHash !== hash) return null;
        
        const user = JSON.parse(urlParams.get('user'));
        return user;
    } catch (e) {
        return null;
    }
}

// Auth middleware
function authMiddleware(req, res, next) {
    const initData = req.headers['x-telegram-init-data'];
    const user = validateTelegramData(initData);
    
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    req.telegramUser = user;
    
    // Проверяем статус пользователя
    const dbUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(user.id);
    if (!dbUser) {
        // Создаём нового пользователя
        db.prepare(`
            INSERT INTO users (telegram_id, username, first_name, last_name)
            VALUES (?, ?, ?, ?)
        `).run(user.id, user.username, user.first_name, user.last_name);
        req.dbUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(user.id);
    } else {
        req.dbUser = dbUser;
    }
    
    next();
}

// Проверка одобрения
function requireApproval(req, res, next) {
    if (req.dbUser.status !== 'approved') {
        return res.status(403).json({ error: 'Not approved', status: req.dbUser.status });
    }
    next();
}

// Проверка админа
function requireAdmin(req, res, next) {
    const isAdmin = db.prepare('SELECT * FROM admins WHERE telegram_id = ?').get(req.telegramUser.id);
    if (!isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// ============================================
// API ROUTES
// ============================================

// Получить данные пользователя
app.get('/api/user', authMiddleware, (req, res) => {
    const games = db.prepare('SELECT * FROM games WHERE user_id = ?').all(req.telegramUser.id);
    res.json({
        user: req.dbUser,
        games: games
    });
});

// Обновить настройки пользователя
app.put('/api/user/settings', authMiddleware, (req, res) => {
    const { language, theme } = req.body;
    
    if (language) {
        db.prepare('UPDATE users SET language = ? WHERE telegram_id = ?').run(language, req.telegramUser.id);
    }
    if (theme) {
        db.prepare('UPDATE users SET theme = ? WHERE telegram_id = ?').run(theme, req.telegramUser.id);
    }
    
    res.json({ success: true });
});

// Привязать Roblox аккаунт
app.post('/api/user/roblox', authMiddleware, requireApproval, async (req, res) => {
    const { robloxId, robloxUsername } = req.body;
    
    db.prepare('UPDATE users SET roblox_id = ?, roblox_username = ? WHERE telegram_id = ?')
        .run(robloxId, robloxUsername, req.telegramUser.id);
    
    res.json({ success: true });
});

// Отвязать Roblox аккаунт
app.delete('/api/user/roblox', authMiddleware, (req, res) => {
    db.prepare('UPDATE users SET roblox_id = NULL, roblox_username = NULL WHERE telegram_id = ?')
        .run(req.telegramUser.id);
    
    res.json({ success: true });
});

// Получить игры пользователя
app.get('/api/games', authMiddleware, requireApproval, (req, res) => {
    const games = db.prepare('SELECT * FROM games WHERE user_id = ?').all(req.telegramUser.id);
    res.json(games);
});

// Добавить игру
app.post('/api/games', authMiddleware, requireApproval, (req, res) => {
    const { universeId, name } = req.body;
    
    try {
        db.prepare('INSERT INTO games (user_id, universe_id, name) VALUES (?, ?, ?)')
            .run(req.telegramUser.id, universeId, name);
        res.json({ success: true });
    } catch (e) {
        if (e.message.includes('UNIQUE')) {
            res.status(400).json({ error: 'Game already added' });
        } else {
            res.status(500).json({ error: 'Database error' });
        }
    }
});

// Удалить игру
app.delete('/api/games/:universeId', authMiddleware, (req, res) => {
    db.prepare('DELETE FROM games WHERE user_id = ? AND universe_id = ?')
        .run(req.telegramUser.id, req.params.universeId);
    res.json({ success: true });
});

// ============================================
// ADMIN ROUTES
// ============================================

// Получить статистику
app.get('/api/admin/stats', authMiddleware, requireAdmin, (req, res) => {
    const stats = {
        totalUsers: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
        approvedUsers: db.prepare('SELECT COUNT(*) as count FROM users WHERE status = "approved"').get().count,
        pendingUsers: db.prepare('SELECT COUNT(*) as count FROM users WHERE status = "pending"').get().count,
        totalGames: db.prepare('SELECT COUNT(*) as count FROM games').get().count
    };
    res.json(stats);
});

// Получить заявки
app.get('/api/admin/pending', authMiddleware, requireAdmin, (req, res) => {
    const pending = db.prepare('SELECT * FROM users WHERE status = "pending"').all();
    res.json(pending);
});

// Одобрить пользователя
app.post('/api/admin/approve/:userId', authMiddleware, requireAdmin, (req, res) => {
    db.prepare('UPDATE users SET status = "approved" WHERE telegram_id = ?').run(req.params.userId);
    res.json({ success: true });
});

// Отклонить пользователя
app.post('/api/admin/reject/:userId', authMiddleware, requireAdmin, (req, res) => {
    db.prepare('UPDATE users SET status = "rejected" WHERE telegram_id = ?').run(req.params.userId);
    res.json({ success: true });
});

// Забанить пользователя
app.post('/api/admin/ban/:userId', authMiddleware, requireAdmin, (req, res) => {
    db.prepare('UPDATE users SET status = "banned" WHERE telegram_id = ?').run(req.params.userId);
    res.json({ success: true });
});

// ============================================
// ROBLOX PROXY (для обхода CORS)
// ============================================

app.get('/api/roblox/user/:userId', async (req, res) => {
    try {
        const response = await fetch(`https://users.roblox.com/v1/users/${req.params.userId}`);
        const data = await response.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Roblox API error' });
    }
});

app.get('/api/roblox/user/search/:username', async (req, res) => {
    try {
        const response = await fetch(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(req.params.username)}&limit=1`);
        const data = await response.json();
        res.json(data.data?.[0] || null);
    } catch (e) {
        res.status(500).json({ error: 'Roblox API error' });
    }
});

app.get('/api/roblox/game/:universeId', async (req, res) => {
    try {
        const response = await fetch(`https://games.roblox.com/v1/games?universeIds=${req.params.universeId}`);
        const data = await response.json();
        res.json(data.data?.[0] || null);
    } catch (e) {
        res.status(500).json({ error: 'Roblox API error' });
    }
});

app.get('/api/roblox/avatar/:userId', async (req, res) => {
    try {
        const response = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${req.params.userId}&size=150x150&format=Png`);
        const data = await response.json();
        res.json({ url: data.data?.[0]?.imageUrl || null });
    } catch (e) {
        res.status(500).json({ error: 'Roblox API error' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Backend running on port ${PORT}`);
});