const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '../data')
const SETTINGS_FILE = path.join(DATA_DIR, 'antidelete.json')
const CACHE_FILE = path.join(DATA_DIR, 'deleted-cache.json')

function readJSON(file, fallback) {
try {
return JSON.parse(fs.readFileSync(file, 'utf8'))
} catch {
return fallback
}
}

function saveJSON(file, data) {
fs.mkdirSync(path.dirname(file), { recursive: true })
fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

module.exports = {
command: 'صائد',
category: 'أدوات',
description: 'تفعيل أو إيقاف صائد الرسائل المحذوفة',

async execute(sock, msg) {
    const chatId = msg.key.remoteJid
    const text = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ''
    ).trim()

    const settings = readJSON(SETTINGS_FILE, { enabled: true })

    if (text === '.صائد تشغيل') {
        settings.enabled = true
        saveJSON(SETTINGS_FILE, settings)

        return sock.sendMessage(chatId, {
            text: 'تم تشغيل صائد الرسائل المحذوفة'
        }, { quoted: msg })
    }

    if (text === '.صائد إيقاف') {
        settings.enabled = false
        saveJSON(SETTINGS_FILE, settings)

        return sock.sendMessage(chatId, {
            text: 'تم إيقاف صائد الرسائل المحذوفة'
        }, { quoted: msg })
    }

    return sock.sendMessage(chatId, {
        text: '╭─〔 صائد الرسائل المحذوفة 〕\n│\n│ .صائد تشغيل\n│ .صائد إيقاف\n│\n╰─ عند حذف رسالة هحاول أرسل محتواها في الخاص'
    }, { quoted: msg })
}

}