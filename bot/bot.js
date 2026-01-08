require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const db = require('./database');

const bot = new Telegraf(process.env.BOT_TOKEN);
const WEBAPP_URL = process.env.WEBAPP_URL;
const ADMIN_IDS = process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim()));

// Добавляем начальных админов из .env
ADMIN_IDS.forEach(id => db.addAdmin(id, 'initial_admin'));

// Локализация
const messages = {
    ru: {
        welcome: '👋 Добро пожаловать в Roblox Game Stats!',
        waitApproval: '⏳ Ваша заявка отправлена на рассмотрение.\nОжидайте одобрения администратора.',
        approved: '✅ Ваш аккаунт одобрен! Теперь вы можете использовать бота.',
        rejected: '❌ К сожалению, ваша заявка отклонена.',
        banned: '🚫 Вы заблокированы.',
        pending: '⏳ Ваша заявка ещё на рассмотрении.',
        openApp: '🎮 Открыть приложение',
        help: '❓ Помощь',
        settings: '⚙️ Настройки',
        admin: '👑 Админ панель',
        notApproved: '⚠️ У вас нет доступа. Ожидайте одобрения.',
        newRequest: '🆕 Новая заявка на доступ!',
        approve: '✅ Одобрить',
        reject: '❌ Отклонить',
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
/settings - Настройки
        `,
        chooseLanguage: '🌍 Выберите язык:',
        languageChanged: '✅ Язык изменён!',
        statsTitle: '📊 Статистика бота',
    },
    en: {
        welcome: '👋 Welcome to Roblox Game Stats!',
        waitApproval: '⏳ Your request has been sent for review.\nPlease wait for admin approval.',
        approved: '✅ Your account is approved! You can now use the bot.',
        rejected: '❌ Unfortunately, your request was rejected.',
        banned: '🚫 You are banned.',
        pending: '⏳ Your request is still pending.',
        openApp: '🎮 Open App',
        help: '❓ Help',
        settings: '⚙️ Settings',
        admin: '👑 Admin Panel',
        notApproved: '⚠️ Access denied. Please wait for approval.',
        newRequest: '🆕 New access request!',
        approve: '✅ Approve',
        reject: '❌ Reject',
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
/settings - Settings
        `,
        chooseLanguage: '🌍 Choose language:',
        languageChanged: '✅ Language changed!',
        statsTitle: '📊 Bot Statistics',
    }
};

// Получить сообщение на языке пользователя
function msg(user, key) {
    const dbUser = db.getUser(user.id);
    const lang = dbUser?.language || 'ru';
    return messages[lang][key] || messages['ru'][key];
}

function getLang(userId) {
    const user = db.getUser(userId);
    return user?.language || 'ru';
}

// Middleware - проверка пользователя
bot.use(async (ctx, next) => {
    if (ctx.from) {
        const user = db.getUser(ctx.from.id);
        if (!user) {
            db.createUser(ctx.from);
        }
        ctx.dbUser = db.getUser(ctx.from.id);
        ctx.isAdmin = db.isAdmin(ctx.from.id);
    }
    return next();
});

// /start
bot.command('start', async (ctx) => {
    const user = ctx.dbUser;
    const lang = user?.language || 'ru';
    const m = messages[lang];

    if (!user || user.status === 'pending') {
        // Новый пользователь или ожидает одобрения
        db.createUser(ctx.from);

        await ctx.reply(
            `${m.welcome}\n\n${m.waitApproval}`,
            Markup.inlineKeyboard([
                [Markup.button.callback(m.help, 'help')]
            ])
        );

        // Уведомляем админов
        const admins = db.getAdmins();
        for (const admin of admins) {
            try {
                await bot.telegram.sendMessage(
                    admin.telegram_id,
                    `${messages.ru.newRequest}\n\n` +
                    `👤 Имя: ${ctx.from.first_name} ${ctx.from.last_name || ''}\n` +
                    `📧 Username: @${ctx.from.username || 'нет'}\n` +
                    `🆔 ID: ${ctx.from.id}`,
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback('✅ Одобрить', `approve_${ctx.from.id}`),
                            Markup.button.callback('❌ Отклонить', `reject_${ctx.from.id}`)
                        ]
                    ])
                );
            } catch (e) {
                console.error('Error notifying admin:', e);
            }
        }
        return;
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

    if (ctx.isAdmin) {
        buttons.push([Markup.button.callback(m.admin, 'admin_panel')]);
    }

    await ctx.reply(
        `${m.welcome}\n\n${m.approved}`,
        Markup.inlineKeyboard(buttons)
    );
});

// /app
bot.command('app', async (ctx) => {
    if (ctx.dbUser?.status !== 'approved') {
        return ctx.reply(msg(ctx.from, 'notApproved'));
    }

    await ctx.reply(
        msg(ctx.from, 'openApp'),
        Markup.inlineKeyboard([
            [Markup.button.webApp('🚀 Roblox Game Stats', WEBAPP_URL)]
        ])
    );
});

// /help
bot.command('help', async (ctx) => {
    await ctx.reply(msg(ctx.from, 'helpText'), { parse_mode: 'Markdown' });
});

bot.action('help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(msg(ctx.from, 'helpText'), { parse_mode: 'Markdown' });
});

// /settings
bot.command('settings', async (ctx) => {
    await showSettings(ctx);
});

bot.action('settings', async (ctx) => {
    await ctx.answerCbQuery();
    await showSettings(ctx);
});

async function showSettings(ctx) {
    const lang = getLang(ctx.from.id);
    const m = messages[lang];

    await ctx.reply(
        '⚙️ ' + m.settings,
        Markup.inlineKeyboard([
            [Markup.button.callback('🌍 Язык / Language', 'change_language')],
            [Markup.button.callback('🌙 Тема / Theme', 'change_theme')]
        ])
    );
}

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
    db.updateUser(ctx.from.id, { language: lang });
    await ctx.answerCbQuery(messages[lang].languageChanged);
    await ctx.reply(messages[lang].languageChanged);
});

// Смена темы
bot.action('change_theme', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        '🎨 Выберите тему / Choose theme:',
        Markup.inlineKeyboard([
            [Markup.button.callback('🌙 Тёмная / Dark', 'set_theme_dark')],
            [Markup.button.callback('☀️ Светлая / Light', 'set_theme_light')]
        ])
    );
});

bot.action(/set_theme_(.+)/, async (ctx) => {
    const theme = ctx.match[1];
    db.updateUser(ctx.from.id, { theme: theme });
    await ctx.answerCbQuery('✅');
    await ctx.reply(theme === 'dark' ? '🌙 Тёмная тема активирована' : '☀️ Светлая тема активирована');
});

// Одобрение/отклонение пользователей
bot.action(/approve_(\d+)/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery('⛔ Нет доступа');

    const userId = parseInt(ctx.match[1]);
    db.approveUser(userId, ctx.from.id);

    await ctx.answerCbQuery('✅ Одобрено');
    await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n✅ ОДОБРЕНО');

    // Уведомляем пользователя
    try {
        const user = db.getUser(userId);
        const lang = user?.language || 'ru';
        await bot.telegram.sendMessage(
            userId,
            messages[lang].approved,
            Markup.inlineKeyboard([
                [Markup.button.webApp(messages[lang].openApp, WEBAPP_URL)]
            ])
        );
    } catch (e) {
        console.error('Error notifying user:', e);
    }
});

bot.action(/reject_(\d+)/, async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery('⛔ Нет доступа');

    const userId = parseInt(ctx.match[1]);
    db.rejectUser(userId);

    await ctx.answerCbQuery('❌ Отклонено');
    await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n❌ ОТКЛОНЕНО');

    // Уведомляем пользователя
    try {
        const user = db.getUser(userId);
        const lang = user?.language || 'ru';
        await bot.telegram.sendMessage(userId, messages[lang].rejected);
    } catch (e) {
        console.error('Error notifying user:', e);
    }
});

// Админ панель
bot.action('admin_panel', async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery('⛔ Нет доступа');

    await ctx.answerCbQuery();
    const stats = db.getStats();

    await ctx.reply(
        `👑 *Админ панель*\n\n` +
        `📊 *Статистика:*\n` +
        `├ Всего пользователей: ${stats.totalUsers}\n` +
        `├ Одобрено: ${stats.approvedUsers}\n` +
        `├ Ожидают: ${stats.pendingUsers}\n` +
        `└ Игр добавлено: ${stats.totalGames}`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('📋 Заявки', 'admin_pending')],
                [Markup.button.callback('👥 Все пользователи', 'admin_users')],
                [Markup.button.callback('🔄 Обновить', 'admin_panel')]
            ])
        }
    );
});

bot.action('admin_pending', async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery('⛔ Нет доступа');

    await ctx.answerCbQuery();
    const pending = db.getPendingUsers();

    if (pending.length === 0) {
        return ctx.reply('✅ Нет заявок на рассмотрении');
    }

    for (const user of pending.slice(0, 10)) {
        await ctx.reply(
            `👤 ${user.first_name} ${user.last_name || ''}\n` +
            `📧 @${user.username || 'нет'}\n` +
            `🆔 ${user.telegram_id}`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback('✅ Одобрить', `approve_${user.telegram_id}`),
                    Markup.button.callback('❌ Отклонить', `reject_${user.telegram_id}`)
                ]
            ])
        );
    }
});

bot.action('admin_users', async (ctx) => {
    if (!ctx.isAdmin) return ctx.answerCbQuery('⛔ Нет доступа');

    await ctx.answerCbQuery();
    const users = db.getAllUsers();

    let text = '👥 *Пользователи:*\n\n';
    for (const user of users.slice(0, 20)) {
        const statusEmoji = {
            approved: '✅',
            pending: '⏳',
            rejected: '❌',
            banned: '🚫'
        }[user.status] || '❓';

        text += `${statusEmoji} ${user.first_name} (@${user.username || 'нет'}) - ${user.status}\n`;
    }

    if (users.length > 20) {
        text += `\n... и ещё ${users.length - 20} пользователей`;
    }

    await ctx.reply(text, { parse_mode: 'Markdown' });
});

// Админ команды
bot.command('admin', async (ctx) => {
    if (!ctx.isAdmin) return;

    await ctx.reply(
        '👑 *Админ команды:*\n\n' +
        '/admin\\_stats - Статистика\n' +
        '/admin\\_pending - Заявки\n' +
        '/admin\\_ban \\[ID\\] - Забанить\n' +
        '/admin\\_unban \\[ID\\] - Разбанить\n' +
        '/admin\\_addadmin \\[ID\\] - Добавить админа',
        { parse_mode: 'Markdown' }
    );
});

bot.command('admin_stats', async (ctx) => {
    if (!ctx.isAdmin) return;
    const stats = db.getStats();

    await ctx.reply(
        `📊 *Статистика:*\n\n` +
        `👥 Всего: ${stats.totalUsers}\n` +
        `✅ Одобрено: ${stats.approvedUsers}\n` +
        `⏳ Ожидают: ${stats.pendingUsers}\n` +
        `🎮 Игр: ${stats.totalGames}`,
        { parse_mode: 'Markdown' }
    );
});

bot.command('admin_ban', async (ctx) => {
    if (!ctx.isAdmin) return;

    const userId = parseInt(ctx.message.text.split(' ')[1]);
    if (!userId) return ctx.reply('Использование: /admin_ban [ID]');

    db.banUser(userId);
    await ctx.reply(`🚫 Пользователь ${userId} забанен`);
});

bot.command('admin_unban', async (ctx) => {
    if (!ctx.isAdmin) return;

    const userId = parseInt(ctx.message.text.split(' ')[1]);
    if (!userId) return ctx.reply('Использование: /admin_unban [ID]');

    db.approveUser(userId, ctx.from.id);
    await ctx.reply(`✅ Пользователь ${userId} разбанен`);
});

// Запуск
bot.launch().then(() => {
    console.log('🤖 Roblox Game Stats Bot запущен!');
}).catch(err => {
    console.error('❌ Ошибка запуска:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));