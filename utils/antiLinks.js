
const fs = require('fs-extra')
const path = require('path')

const settingsPath = path.join(
    __dirname,
    '..',
    'data',
    'anti-links.json'
)

// تحميل دالة النخبة من ملف ES Module
let eliteChecker = null

async function checkElite(number) {
    try {
        if (!eliteChecker) {
            const eliteModule = await import('../haykala/elite.js')
            eliteChecker = eliteModule.isElite
        }

        return Boolean(eliteChecker && eliteChecker(number))
    } catch (err) {
        console.error('خطأ في التحقق من النخبة:', err.message)
        return false
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// قراءة وحفظ الإعدادات
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function readSettings() {
    try {
        if (!fs.existsSync(settingsPath)) return {}
        return fs.readJsonSync(settingsPath)
    } catch {
        return {}
    }
}

function saveSettings(settings) {
    fs.ensureDirSync(path.dirname(settingsPath))
    fs.writeJsonSync(settingsPath, settings, { spaces: 2 })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// استخراج نص الرسالة
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getText(message) {
    let msg = message?.message || {}

    while (true) {
        const next =
            msg.ephemeralMessage?.message ||
            msg.viewOnceMessage?.message ||
            msg.viewOnceMessageV2?.message ||
            msg.viewOnceMessageV2Extension?.message

        if (!next) break
        msg = next
    }

    return (
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        msg.documentMessage?.caption ||
        msg.documentMessage?.fileName ||
        ''
    )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// اكتشاف الروابط
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function hasLink(text) {
    return /(?:https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|t\.me\/|telegram\.me\/)[^\s]+/i.test(text)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// التحقق من مشرف الجروب
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function isGroupAdmin(sock, jid, userJid) {
    try {
        const metadata = await sock.groupMetadata(jid)

        const participant = metadata.participants.find(p =>
            p.id === userJid ||
            p.lid === userJid
        )

        return (
            participant?.admin === 'admin' ||
            participant?.admin === 'superadmin'
        )
    } catch (err) {
        console.error('خطأ في التحقق من مشرف الجروب:', err.message)
        return false
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// تشغيل وإيقاف مضاد الروابط
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function setEnabled(sock, m, enabled) {
    const jid = m.key?.remoteJid

    if (!jid?.endsWith('@g.us')) {
        await sock.sendMessage(jid, {
            text: 'الأمر ده بيشتغل داخل الجروبات بس'
        }, { quoted: m })
        return
    }

    const sender = m.key.participant || m.key.remoteJid

    const admin = await isGroupAdmin(sock, jid, sender)
    const elite = await checkElite(sender)

    if (!admin && !elite) {
        await sock.sendMessage(jid, {
            text: 'الأمر ده للمشرفين وأعضاء النخبة بس'
        }, { quoted: m })
        return
    }

    const settings = readSettings()
    settings[jid] = enabled
    saveSettings(settings)

    await sock.sendMessage(jid, {
        text: enabled
            ? 'تم تشغيل مضاد الروابط بنجاح'
            : 'تم إيقاف مضاد الروابط'
    }, { quoted: m })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// مستمع مضاد الروابط
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function checkMessage(sock, m) {
    const jid = m.key?.remoteJid

    if (!jid?.endsWith('@g.us')) return
    if (m.key.fromMe || !m.message) return

    const settings = readSettings()
    if (settings[jid] !== true) return

    const text = getText(m)
    if (!text || !hasLink(text)) return

    const sender = m.key.participant
    if (!sender) return

    // استثناء أعضاء النخبة
    if (await checkElite(sender)) return

    // استثناء مشرفي الجروب
    if (await isGroupAdmin(sock, jid, sender)) return

    try {
        await sock.sendMessage(jid, {
            delete: m.key
        })
    } catch (err) {
        console.error('فشل حذف رسالة الرابط:', err.message)
    }
}

module.exports = {
    setEnabled,
    checkMessage
}
