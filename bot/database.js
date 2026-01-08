const Database = require('better-sqlite3');
const db = new Database('roblox_stats.db');

// Создание таблиц
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        telegram_id INTEGER UNIQUE,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        language TEXT DEFAULT 'ru',
        theme TEXT DEFAULT 'dark',
        status TEXT DEFAULT 'pending',
        roblox_user_id INTEGER,
        roblox_username TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        approved_at DATETIME,
        approved_by INTEGER
    );

    CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        universe_id INTEGER,
        place_id INTEGER,
        name TEXT,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(telegram_id)
    );

    CREATE TABLE IF NOT EXISTS admins (
        telegram_id INTEGER PRIMARY KEY,
        username TEXT,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

module.exports = {
    // Пользователи
    getUser(telegramId) {
        return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
    },

    createUser(user) {
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO users (telegram_id, username, first_name, last_name)
            VALUES (?, ?, ?, ?)
        `);
        return stmt.run(user.id, user.username, user.first_name, user.last_name);
    },

    updateUser(telegramId, data) {
        const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
        const values = [...Object.values(data), telegramId];
        return db.prepare(`UPDATE users SET ${fields} WHERE telegram_id = ?`).run(...values);
    },

    approveUser(telegramId, adminId) {
        return db.prepare(`
            UPDATE users SET status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by = ?
            WHERE telegram_id = ?
        `).run(adminId, telegramId);
    },

    rejectUser(telegramId) {
        return db.prepare(`UPDATE users SET status = 'rejected' WHERE telegram_id = ?`).run(telegramId);
    },

    banUser(telegramId) {
        return db.prepare(`UPDATE users SET status = 'banned' WHERE telegram_id = ?`).run(telegramId);
    },

    getPendingUsers() {
        return db.prepare(`SELECT * FROM users WHERE status = 'pending'`).all();
    },

    getAllUsers() {
        return db.prepare(`SELECT * FROM users`).all();
    },

    getApprovedUsers() {
        return db.prepare(`SELECT * FROM users WHERE status = 'approved'`).all();
    },

    // Игры
    addGame(userId, game) {
        return db.prepare(`
            INSERT INTO games (user_id, universe_id, place_id, name)
            VALUES (?, ?, ?, ?)
        `).run(userId, game.universeId, game.placeId, game.name);
    },

    getUserGames(userId) {
        return db.prepare(`SELECT * FROM games WHERE user_id = ?`).all(userId);
    },

    removeGame(userId, universeId) {
        return db.prepare(`DELETE FROM games WHERE user_id = ? AND universe_id = ?`).run(userId, universeId);
    },

    // Админы
    isAdmin(telegramId) {
        const admin = db.prepare('SELECT * FROM admins WHERE telegram_id = ?').get(telegramId);
        return !!admin;
    },

    addAdmin(telegramId, username) {
        return db.prepare(`INSERT OR IGNORE INTO admins (telegram_id, username) VALUES (?, ?)`).run(telegramId, username);
    },

    removeAdmin(telegramId) {
        return db.prepare(`DELETE FROM admins WHERE telegram_id = ?`).run(telegramId);
    },

    getAdmins() {
        return db.prepare(`SELECT * FROM admins`).all();
    },

    // Статистика
    getStats() {
        return {
            totalUsers: db.prepare(`SELECT COUNT(*) as count FROM users`).get().count,
            approvedUsers: db.prepare(`SELECT COUNT(*) as count FROM users WHERE status = 'approved'`).get().count,
            pendingUsers: db.prepare(`SELECT COUNT(*) as count FROM users WHERE status = 'pending'`).get().count,
            totalGames: db.prepare(`SELECT COUNT(*) as count FROM games`).get().count
        };
    }
};