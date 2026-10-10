
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require('@whiskeysockets/baileys')

const fs = require('fs-extra')
const pino = require('pino')
const path = require('path')
const chalk = require('chalk')
const readline = require('readline')
const { exec } = require('child_process')
const logger = require('./utils/console')

// قناة الواتساب
const CHANNEL_JID = '120363401670228863@newsletter'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// إعدادات صائد الرسائل المحذوفة
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const antiDeleteCache = new Map()
const MAX_CACHE = 2000
const CACHE_TTL = 24 * 60 * 60 * 1000

const settingsPath = path.join(__dirname, 'data', 'antidelete.json')

function isAntiDeleteEnabled() {
    try {
        if (!fs.existsSync(settingsPath)) return true

        const settings = fs.readJsonSync(settingsPath)
        return settings.enabled !== false
    } catch {
        return true
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// أدوات مساعدة
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const question = text => new Promise(resolve => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    rl.question(text, answer => {
        rl.close()
        resolve(answer)
    })
})

const asciiArt = `
${chalk.hex('#FFD700').bold('       ██╗ █████╗ ███╗   ██╗     ███╗   ███╗██████╗ ')}
${chalk.hex('#FFD700').bold('       ██║██╔══██╗████╗  ██║     ████╗ ████║██╔══██╗')}
${chalk.hex('#FFD700').bold('       ██║███████║██╔██╗ ██║     ██╔████╔██║██║  ██║')}
${chalk.hex('#FFD700').bold('  ██   ██║██╔══██║██║╚██╗██║     ██║╚██╔╝██║██║  ██║')}
${chalk.hex('#FFD700').bold('  ╚█████╔╝██║  ██║██║ ╚████║     ██║ ╚═╝ ██║██████╔╝')}
${chalk.hex('#FFD700').bold('   ╚════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝     ╚═╝     ╚═╝╚═════╝ ')}
`

function playSound(name) {
    const controlPath = path.join(__dirname, 'sounds', 'sound.txt')

    const status = fs.existsSync(controlPath)
        ? fs.readFileSync(controlPath, 'utf8').trim()
        : 'off'

    if (status !== '{on}') return

    const filePath = path.join(__dirname, 'sounds', name)

    if (fs.existsSync(filePath)) {
        exec(`mpv --no-terminal --really-quiet "${filePath}"`)
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// متابعة قناة الواتساب
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function followWhatsAppChannel(sock) {
    try {
        if (typeof sock.newsletterFollow !== 'function') {
            logger.warn(
                'إصدار Baileys الحالي لا يدعم newsletterFollow'
            )
            return
        }

        await sock.newsletterFollow(CHANNEL_JID)

        logger.success('تم إرسال طلب متابعة قناة الواتساب')
    } catch (error) {
        logger.error(
            'فشل متابعة قناة الواتساب:',
            error.message
        )
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// استخراج محتوى الرسالة
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function unwrapMessage(message) {
    let current = message

    while (current) {
        const next =
            current.ephemeralMessage?.message ||
            current.viewOnceMessage?.message ||
            current.viewOnceMessageV2?.message ||
            current.viewOnceMessageV2Extension?.message

        if (!next) break
        current = next
    }

    return current || {}
}

function getMessageText(message) {
    const m = unwrapMessage(message)

    return (
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        m.documentMessage?.caption ||
        m.documentMessage?.fileName ||
        m.buttonsResponseMessage?.selectedDisplayText ||
        m.listResponseMessage?.title ||
        m.templateButtonReplyMessage?.selectedDisplayText ||
        (m.imageMessage ? '[صورة]' : '') ||
        (m.videoMessage ? '[فيديو]' : '') ||
        (m.audioMessage ? '[رسالة صوتية]' : '') ||
        (m.stickerMessage ? '[ملصق]' : '') ||
        (m.documentMessage ? '[ملف]' : '') ||
        (m.contactMessage ? '[جهة اتصال]' : '') ||
        (m.locationMessage ? '[موقع جغرافي]' : '') ||
        (m.reactionMessage ? '[تفاعل]' : '') ||
        '[رسالة بدون نص أو نوع غير مدعوم]'
    )
}

function makeCacheKey(remoteJid, messageId) {
    if (!remoteJid || !messageId) return null
    return `${remoteJid}:${messageId}`
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// صائد الرسائل المحذوفة
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function handleAntiDelete(sock, messages) {
    for (const msg of messages || []) {
        try {
            const key = msg.key
            if (!key?.id || !msg.message) continue

            if (key.remoteJid === 'status@broadcast') continue

            const protocol = msg.message.protocolMessage

            if (protocol?.type === 0 && protocol.key?.id) {
                if (!isAntiDeleteEnabled()) continue

                const deletedKey = protocol.key

                const cacheKey = makeCacheKey(
                    deletedKey.remoteJid || key.remoteJid,
                    deletedKey.id
                )

                let cached = cacheKey
                    ? antiDeleteCache.get(cacheKey)
                    : null

                if (!cached && deletedKey.id) {
                    for (const [, storedValue] of antiDeleteCache) {
                        if (storedValue.id === deletedKey.id) {
                            cached = storedValue
                            break
                        }
                    }
                }

                if (!cached) {
                    logger.warn(
                        `وصل إشعار حذف لكن الرسالة غير موجودة في الذاكرة: ${deletedKey.id}`
                    )
                    continue
                }

                const botId = sock.user?.id || sock.user?.lid

                if (!botId) {
                    logger.warn('تعذر تحديد حساب البوت لإرسال إشعار الحذف')
                    continue
                }

                const botNumber = botId
                    .split(':')[0]
                    .split('@')[0]
                    .replace(/[^0-9]/g, '')

                if (!botNumber) continue

                const botJid = `${botNumber}@s.whatsapp.net`

                const sender =
                    deletedKey.participant ||
                    cached.sender ||
                    deletedKey.remoteJid ||
                    cached.remoteJid

                const senderNumber = String(sender || 'غير معروف')
                    .split('@')[0]
                    .split(':')[0]

                const content = getMessageText(cached.message)

                const report =
                    `╭─〔 صائد الرسائل المحذوفة 〕\n` +
                    `│\n` +
                    `│ تم حذف رسالة من قبل: ${senderNumber}\n` +
                    `│ المحادثة: ${cached.remoteJid}\n` +
                    `│\n` +
                    `│ نص الرسالة:\n${content}\n` +
                    `│\n` +
                    `╰─`

                await sock.sendMessage(botJid, {
                    text: report
                })

                logger.success(
                    `تم إرسال إشعار حذف الرسالة: ${deletedKey.id}`
                )

                if (cacheKey) antiDeleteCache.delete(cacheKey)

                for (const [storedKey, storedValue] of antiDeleteCache) {
                    if (storedValue.id === deletedKey.id) {
                        antiDeleteCache.delete(storedKey)
                    }
                }

                continue
            }

            if (!key.fromMe && msg.message && !protocol) {
                const cacheKey = makeCacheKey(key.remoteJid, key.id)

                if (!cacheKey) continue

                antiDeleteCache.set(cacheKey, {
                    id: key.id,
                    remoteJid: key.remoteJid,
                    message: msg.message,
                    sender: key.participant || key.remoteJid,
                    timestamp: Date.now()
                })
            }
        } catch (err) {
            logger.error(
                'خطأ أثناء معالجة صائد الرسائل المحذوفة:',
                err.message
            )
        }
    }

    const now = Date.now()

    for (const [key, value] of antiDeleteCache) {
        if (now - value.timestamp > CACHE_TTL) {
            antiDeleteCache.delete(key)
        }
    }

    while (antiDeleteCache.size > MAX_CACHE) {
        const oldestKey = antiDeleteCache.keys().next().value
        antiDeleteCache.delete(oldestKey)
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// تشغيل البوت
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function startBot() {
    try {
        console.clear()
        console.log(asciiArt)
        console.log(chalk.hex('#FFD700').bold('\nWELCOME TO MY WORLD!\n'))

        playSound('ANASTASIA.ogg')

        const sessionDir = path.join(__dirname, 'ملف_الاتصال')
        await fs.ensureDir(sessionDir)

        const { state, saveCreds } =
            await useMultiFileAuthState(sessionDir)

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: ['MacOs', 'Chrome', '1.0.0'],
            logger: pino({ level: 'silent' }),
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true
        })

        let channelFollowAttempted = false

        sock.ev.on('groups.upsert', async groups => {
            for (const group of groups) {
                try {
                    await sock.groupMetadata(group.id)
                    console.log(
                        `[+] تم تحميل بيانات مجموعة: ${group.subject}`
                    )
                } catch {
                    console.warn(
                        `[-] فشل في تحميل بيانات مجموعة: ${group.id}`
                    )
                }
            }
        })

        if (!sock.authState.creds.registered) {
            console.log(
                chalk.bold(
                    '\n[ SETUP ] Please enter your phone number to receive the pairing code:'
                )
            )

            console.log(chalk.dim('          (Type "#" to cancel)\n'))

            let phoneNumber = await question(
                chalk.bgHex('#FFD700').black(' Phone Number : ')
            )

            if (phoneNumber.trim() === '#') process.exit()

            phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

            if (!/^\d{10,15}$/.test(phoneNumber)) {
                console.log('\n[ ERROR ] Invalid phone number.\n')
                process.exit(1)
            }

            try {
                const code = await sock.requestPairingCode(phoneNumber)

                console.log('\n────────── Pairing Information ──────────')
                console.log(`Pairing Code: ${code}`)
                console.log(`Phone Number: ${phoneNumber}`)
                console.log('─────────────────────────────────────────\n')
            } catch (error) {
                console.log('\n[ ERROR ] Failed to get pairing code.\n')
                logger.error(error.message)
                process.exit(1)
            }
        }

        sock.ev.on('connection.update', async update => {
            const { connection, lastDisconnect } = update

            if (connection === 'connecting') {
                logger.info('Connecting to WhatsApp...')
            }

            if (connection === 'open') {
                logger.success(`CONNECTED! USER ID: ${sock.user.id}`)

                // متابعة القناة مرة واحدة لكل اتصال
                if (!channelFollowAttempted) {
                    channelFollowAttempted = true
                    await followWhatsAppChannel(sock)
                }

                try {
                    const { addEliteNumber } = require('./haykala/elite')

                    const botNumber = sock.user.id
                        .split(':')[0]
                        .replace(/[^0-9]/g, '')

                    const jid = `${botNumber}@s.whatsapp.net`
                    const [info] = await sock.onWhatsApp(jid)

                    if (!info?.jid || !info?.lid) {
                        logger.warn(
                            'تعذر الحصول على معلومات LID من onWhatsApp'
                        )
                    } else {
                        const lidNumber = info.lid.replace(/[^0-9]/g, '')

                        await addEliteNumber(botNumber)
                        await addEliteNumber(lidNumber)

                        logger.info(
                            `ADDED ${botNumber} AND ${lidNumber} TO ELITE!`
                        )
                    }
                } catch (e) {
                    logger.error(
                        'فشل في إضافة رقم الجلسة إلى النخبة:',
                        e.message
                    )
                }

                require('./handlers/handler').handleMessagesLoader()
                listenToConsole(sock)
            }

            if (connection === 'close') {
                const isLoggedOut =
                    lastDisconnect?.error?.output?.statusCode ===
                    DisconnectReason.loggedOut

                logger.warn(
                    `Disconnected: ${
                        lastDisconnect?.error?.message || 'Unknown reason'
                    }`
                )

                if (isLoggedOut) {
                    playSound('LOGGOUT.mp3')
                    logger.error('You have been logged out.')
                    process.exit(1)
                } else {
                    logger.info('Reconnecting...')
                    setTimeout(startBot, 3000)
                }
            }
        })

        // مستمع واحد للرسائل
        sock.ev.on('messages.upsert', async event => {
            try {
                await handleAntiDelete(sock, event.messages)

                const antiLinks = require('./utils/antiLinks')

                for (const msg of event.messages || []) {
                    await antiLinks.checkMessage(sock, msg)
                }

                const { handleMessages } = require('./handlers/handler')
                await handleMessages(sock, event)

            } catch (err) {
                logger.error('Error while handling message:', err)
                playSound('ERROR.mp3')
            }
        })

        sock.ev.on('creds.update', saveCreds)

    } catch (err) {
        logger.error('Startup error:', err)
        playSound('ERROR.mp3')
        setTimeout(startBot, 3000)
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// أوامر الكونسول
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function listenToConsole(sock) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    rl.on('line', () => {
        console.log('[ CMD ] Unknown command.')
    })
}

startBot()
