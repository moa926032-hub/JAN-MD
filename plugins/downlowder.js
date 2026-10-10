
const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')

module.exports = {
    command: 'تحميل',
    description: 'تحميل فيديو أو صوت من رابط مدعوم بواسطة yt-dlp',
    usage: '.تحميل فيديو [الرابط] أو .تحميل صوت [الرابط]',
    category: 'downloads',

    async execute(sock, msg, args = []) {
        const chatId = msg.key.remoteJid
        const prefix = '.تحميل'

        const sendText = text =>
            sock.sendMessage(chatId, { text }, { quoted: msg })

        let format = ''
        let url = ''

        try {
            // استخراج النص من الرسالة
            const message = msg.message || {}
            const text =
                message.conversation ||
                message.extendedTextMessage?.text ||
                message.imageMessage?.caption ||
                message.videoMessage?.caption ||
                ''

            if (text.startsWith(prefix)) {
                const parts = text.trim().split(/\s+/)
                format = (parts[1] || '').toLowerCase()
                url = parts.slice(2).join(' ').trim()
            } else if (Array.isArray(args) && args.length >= 2) {
                format = String(args[0]).toLowerCase().trim()
                url = String(args[1]).trim()
            }

            if (!['فيديو', 'صوت'].includes(format) || !url) {
                return sendText(
                    'طريقة الاستخدام\n.تحميل فيديو https://الرابط\n.تحميل صوت https://الرابط'
                )
            }

            if (!/^https?:\/\/\S+$/i.test(url)) {
                return sendText('الرابط غير صالح')
            }

            const tempDir = path.join(__dirname, '..', 'temp')
            fs.mkdirSync(tempDir, { recursive: true })

            const timestamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            const outputTemplate = path.join(tempDir, `${timestamp}.%(ext)s`)

            await sendText('⏳ جاري التحميل، استنى شوية')

            const runYtDlp = options =>
                new Promise((resolve, reject) => {
                    execFile(
                        'yt-dlp',
                        options,
                        { timeout: 180000, maxBuffer: 10 * 1024 * 1024 },
                        (error, stdout, stderr) => {
                            if (error) {
                                reject(new Error(
                                    stderr?.trim() ||
                                    error.message ||
                                    'فشل التحميل'
                                ))
                            } else {
                                resolve(stdout)
                            }
                        }
                    )
                })

            const commonArgs = [
                '--no-playlist',
                '--no-warnings',
                '--max-filesize', '64M',
                '-o', outputTemplate
            ]

            if (format === 'فيديو') {
                await runYtDlp([
                    ...commonArgs,
                    '-f', 'best[ext=mp4]/best',
                    '--merge-output-format', 'mp4',
                    url
                ])
            } else {
                await runYtDlp([
                    ...commonArgs,
                    '-x',
                    '--audio-format', 'mp3',
                    '--audio-quality', '5',
                    url
                ])
            }

            const files = fs.readdirSync(tempDir)
                .filter(name => name.startsWith(`${timestamp}.`))
                .map(name => path.join(tempDir, name))
                .filter(file => fs.statSync(file).isFile())

            if (!files.length) {
                throw new Error('ملف التحميل مش موجود بعد انتهاء العملية')
            }

            const filePath = files[0]
            const stat = fs.statSync(filePath)

            if (stat.size > 64 * 1024 * 1024) {
                throw new Error('حجم الملف أكبر من الحد المسموح للإرسال')
            }

            try {
                if (format === 'فيديو') {
                    await sock.sendMessage(chatId, {
                        video: fs.readFileSync(filePath),
                        mimetype: 'video/mp4',
                        caption: '🎬 تم تحميل الفيديو'
                    }, { quoted: msg })
                } else {
                    await sock.sendMessage(chatId, {
                        audio: fs.readFileSync(filePath),
                        mimetype: 'audio/mpeg',
                        fileName: 'audio.mp3'
                    }, { quoted: msg })
                }
            } finally {
                for (const file of files) {
                    try {
                        fs.unlinkSync(file)
                    } catch {}
                }
            }
        } catch (error) {
            console.error('[تحميل]', error.message)

            await sendText(
                '❌ فشل التحميل\n' +
                'تأكد إن yt-dlp و ffmpeg متثبتين وإن الرابط مدعوم'
            ).catch(() => {})
        }
    }
}
