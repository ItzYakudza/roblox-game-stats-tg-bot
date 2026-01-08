require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

// Настройки
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://itzyakudza.github.io/roblox-game-stats-tg-bot';
const ADMIN_IDS = process.env.ADMIN_IDS?.split(',').map(id => parseInt(id.trim())) || [];

if (!BOT_TOKEN) {
    console.error('❌ ОШИБКА: BOT_TOKEN не установлен!');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Простое хранилище в памяти (для бота на Render)
const users = new Map();
const pendingUsers = new Map();

// Локализация
const messages = {
    ru: {
        welcome: '👋 Добро пожаловать в Roblox Game Stats!',
        waitApproval: '⏳ Ваша заявка отправлена на рассмотрение.\nОжидайте одобрения администратора.',
        approved: '✅ Ваш аккаунт одобрен! Теперь вы можете использовать бота.',
        rejected: '❌ К сожалению, ваша заявка отклонена.',
        banned: '🚫 Вы заблокированы.',
        openApp: '🎮 Открыть приложение',
        help: '❓ Помощь',
        settings: '⚙️ Настройки',
        admin: '👑 Админ панель',
        newRequest: '🆕 Новая заявка на доступ!',
        userApproved: '✅ Пользователь одобрен!',
        userRejected: '❌ Пользователь отклонён.',
        helpText: `
📖 *Roblox Game Stats*

Это приложение позволяет:
• 📊 Просматривать статистику игр Roblox
• 🎮 Добавлять свои игры
• 📈 Отслеживать посещаемость
• ⭐ Следить за оценками

*Команды:*
/start - Начать
/app - Открыть приложение
/help - Помощь
        `,
        chooseLanguage: '🌍 Выберите язык:',
        languageChanged: '✅ Язык изменён!'
    },
    en: {
        welcome: '👋 Welcome to Roblox Game Stats!',
        waitApproval: '⏳ Your request has been sent for review.\nPlease wait for admin approval.',
        approved: '✅ Your account is approved! You can now use the bot.',
        rejected: '❌ Unfortunately, your request was rejected.',
        banned: '🚫 You are banned.',
        openApp: '🎮 Open App',
        help: '❓ Help',
        settings: '⚙️ Settings',
        admin: '👑 Admin Panel',
        newRequest: '🆕 New access request!',
        userApproved: '✅ User approved!',
        userRejected: '❌ User rejected.',
        helpText: `
📖 *Roblox Game Stats*

This app allows you to:
• 📊 View Roblox game statistics
• 🎮 Add your games
• 📈 Track player visits
• ⭐ Monitor ratings

*Commands:*
/start - Start
/app - Open app
/help - Help
        `,
        chooseLanguage: '🌍 Choose language:',
        languageChanged: '✅ Language changed!'
    }
};

// Получить пользователя
function getUser(userId) {
    return users.get(userId) || null;
}

// Создать пользователя
function createUser(from) {
    const user = {
        id: from.id,
        username: from.username || '',
        first_name: from.first_name || '',
        last_name: from.last_name || '',
        language: 'ru',
        status: 'pending',
        created_at: new Date().toISOString()
    };
    users.set(from.id, user);
    pendingUsers.set(from.id, user);
    return user;
}

// Проверка админа
function isAdmin(userId) {
    return ADMIN_IDS.includes(userId);
}

// Получить сообщение на языке пользователя
function msg(userId, key) {
    const user = getUser(userId);
    const lang = user?.language || 'ru';
    return messages[lang][key] || messages['ru'][key];
}

// Команда /start
bot.command('start', async (ctx) => {
    const from = ctx.from;
    let user = getUser(from.id);
    const m = messages[user?.language || 'ru'];

    // Если админ — сразу одобрен
    if (isAdmin(from.id)) {
        if (!user) {
            user = createUser(from);
        }
        user.status = 'approved';
        users.set(from.id, user);
    }

    // Новый пользователь
    if (!user) {
        user = createUser(from);

        await ctx.reply(
            `${m.welcome}\n\n${m.waitApproval}`,
            Markup.inlineKeyboard([
                [Markup.button.callback(m.help, 'help')]
            ])
        );

        // Уведомляем админов
        for (const adminId of ADMIN_IDS) {
            try {
                await bot.telegram.sendMessage(
                    adminId,
                    `${messages.ru.newRequest}\n\n` +
                    `👤 Имя: ${from.first_name} ${from.last_name || ''}\n` +
                    `📧 Username: @${from.username || 'нет'}\n` +
                    `🆔 ID: ${from.id}`,
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback('✅ Одобрить', `approve_${from.id}`),
                            Markup.button.callback('❌ Отклонить', `reject_${from.id}`)
                        ]
                    ])
                );
            } catch (e) {
                console.error('Ошибка уведомления админа:', e.message);
            }
        }
        return;
    }

    // Проверка статуса
    if (user.status === 'pending') {
        return ctx.reply(m.waitApproval);
    }

    if (user.status === 'rejected') {
        return ctx.reply(m.rejected);
    }

    if (user.status === 'banned') {
        return ctx.reply(m.banned);
    }

    // Одобренный пользователь
    const buttons = [
        [Markup.button.webApp(m.openApp, WEBAPP_URL)],
        [Markup.button.callback(m.settings, 'settings'), Markup.button.callback(m.help, 'help')]
    ];

    if (isAdmin(from.id)) {
        buttons.push([Markup.button.callback(m.admin, 'admin_panel')]);
    }

    await ctx.reply(
        `${m.welcome}\n\n${m.approved}`,
        Markup.inlineKeyboard(buttons)
    );
});

// Команда /app
bot.command('app', async (ctx) => {
    const user = getUser(ctx.from.id);
    
    if (!user || user.status !== 'approved') {
        return ctx.reply(msg(ctx.from.id, 'waitApproval'));
    }

    await ctx.reply(
        msg(ctx.from.id, 'openApp'),
        Markup.inlineKeyboard([
            [Markup.button.webApp('🚀 Roblox Game Stats', WEBAPP_URL)]
        ])
    );
});

// Команда /help
bot.command('help', async (ctx) => {
    await ctx.reply(msg(ctx.from.id, 'helpText'), { parse_mode: 'Markdown' });
});

bot.action('help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(msg(ctx.from.id, 'helpText'), { parse_mode: 'Markdown' });
});

// Настройки
bot.action('settings', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        '⚙️ Настройки',
        Markup.inlineKeyboard([
            [Markup.button.callback('🌍 Язык / Language', 'change_language')]
        ])
    );
});

// Смена языка
bot.action('change_language', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        '🌍 Выберите язык / Choose language:',
        Markup.inlineKeyboard([
            [Markup.button.callback('🇷🇺 Русский', 'set_lang_ru')],
            [Markup.button.callback('🇬🇧 English', 'set_lang_en')]
        ])
    );
});

bot.action(/set_lang_(.+)/, async (ctx) => {
    const lang = ctx.match[1];
    const user = getUser(ctx.from.id);
    if (user) {
        user.language = lang;
        users.set(ctx.from.id, user);
    }
    await ctx.answerCbQuery(messages[lang].languageChanged);
    await ctx.reply(messages[lang].languageChanged);
});

// Одобрение пользователей
bot.action(/approve_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.answerCbQuery('⛔ Нет доступа');
    }

    const userId = parseInt(ctx.match[1]);
    const user = users.get(userId);
    
    if (user) {
        user.status = 'approved';
        users.set(userId, user);
        pendingUsers.delete(userId);
    }

    await ctx.answerCbQuery('✅ Одобрено');
    await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n✅ ОДОБРЕНО');

    // Уведомляем пользователя
    try {
        const lang = user?.language || 'ru';
        await bot.telegram.sendMessage(
            userId,
            messages[lang].approved,
            Markup.inlineKeyboard([
                [Markup.button.webApp(messages[lang].openApp, WEBAPP_URL)]
            ])
        );
    } catch (e) {
        console.error('Ошибка уведомления пользователя:', e.message);
    }
});

bot.action(/reject_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.answerCbQuery('⛔ Нет доступа');
    }

    const userId = parseInt(ctx.match[1]);
    const user = users.get(userId);
    
    if (user) {
        user.status = 'rejected';
        users.set(userId, user);
        pendingUsers.delete(userId);
    }

    await ctx.answerCbQuery('❌ Отклонено');
    await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n❌ ОТКЛОНЕНО');

    // Уведомляем пользователя
    try {
        const lang = user?.language || 'ru';
        await bot.telegram.sendMessage(userId, messages[lang].rejected);
    } catch (e) {
        console.error('Ошибка уведомления пользователя:', e.message);
    }
});

// Админ панель
bot.action('admin_panel', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.answerCbQuery('⛔ Нет доступа');
    }

    await ctx.answerCbQuery();
    
    const totalUsers = users.size;
    const approved = [...users.values()].filter(u => u.status === 'approved').length;
    const pending = [...users.values()].filter(u => u.status === 'pending').length;

    await ctx.reply(
        `👑 *Админ панель*\n\n` +
        `📊 *Статистика:*\n` +
        `├ Всего пользователей: ${totalUsers}\n` +
        `├ Одобрено: ${approved}\n` +
        `└ Ожидают: ${pending}`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📋 Заявки', 'admin_pending')],
                [Markup.button.callback('🔄 Обновить', 'admin_panel')]
            ])
        }
    );
});

bot.action('admin_pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
        return ctx.answerCbQuery('⛔ Нет доступа');
    }

    await ctx.answerCbQuery();
    
    const pending = [...users.values()].filter(u => u.status === 'pending');

    if (pending.length === 0) {
        return ctx.reply('✅ Нет заявок на рассмотрении');
    }

    for (const user of pending.slice(0, 10)) {
        await ctx.reply(
            `👤 ${user.first_name} ${user.last_name || ''}\n` +
            `📧 @${user.username || 'нет'}\n` +
            `🆔 ${user.id}`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback('✅ Одобрить', `approve_${user.id}`),
                    Markup.button.callback('❌ Отклонить', `reject_${user.id}`)
                ]
            ])
        );
    }
});

// Команда /admin
bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const totalUsers = users.size;
    const approved = [...users.values()].filter(u => u.status === 'approved').length;
    const pending = [...users.values()].filter(u => u.status === 'pending').length;

    await ctx.reply(
        `👑 *Админ панель*\n\n` +
        `📊 Всего: ${totalUsers}\n` +
        `✅ Одобрено: ${approved}\n` +
        `⏳ Ожидают: ${pending}\n\n` +
        `Админы: ${ADMIN_IDS.join(', ')}`,
        { parse_mode: 'Markdown' }
    );
});

// Обработка ошибок
bot.catch((err, ctx) => {
    console.error('❌ Ошибка бота:', err.message);
});

// Запуск
bot.launch().then(() => {
    console.log('========================================');
    console.log('🤖 Roblox Game Stats Bot');
    console.log(`📡 Запущен успешно!`);
    console.log(`🔑 Токен: Установлен`);
    console.log(`🌐 WebApp: ${WEBAPP_URL}`);
    console.log(`👑 Админы: ${ADMIN_IDS.length > 0 ? ADMIN_IDS.join(', ') : 'не указаны'}`);
    console.log('========================================');
}).catch(err => {
    console.error('❌ Ошибка запуска:', err.message);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));