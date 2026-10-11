
const { Agent, request: undiciRequest } = require('undici')
const fs = require('fs')
const path = require('path')

const COOKIE_FILE = path.join(process.cwd(), 'cookies.json')

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const dispatcher = new Agent({
  headersTimeout: 30000,
  bodyTimeout: 30000,
  maxHeaderSize: 32768
})

async function request(url, options = {}) {
  try {
    const response = await undiciRequest(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      dispatcher,
      headersTimeout: 30000,
      bodyTimeout: 30000,
      maxHeaderSize: 32768
    })

    const body = await response.body.text()

    return {
      status: response.statusCode,
      headers: response.headers,
      body
    }
  } catch (error) {
    console.error('[Gemini HTTP Error]', error.code || error.message)
    throw new Error(
      `فشل اتصال Gemini: ${error.code || error.message}`
    )
  }
}

function loadCookieHeader() {
  if (!fs.existsSync(COOKIE_FILE)) {
    throw new Error('ملف cookies.json مش موجود في مجلد تشغيل البوت')
  }

  let data

  try {
    data = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'))
  } catch {
    throw new Error('ملف cookies.json مش بصيغة JSON صحيحة')
  }

  let cookie = ''

  if (typeof data?.cookie === 'string') {
    cookie = data.cookie.trim()
  } else if (Array.isArray(data)) {
    const unique = new Map()

    for (const item of data) {
      if (
        item &&
        typeof item.name === 'string' &&
        typeof item.value === 'string'
      ) {
        unique.set(item.name, item.value)
      }
    }

    cookie = [...unique]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
  } else if (
    data?.cookies &&
    typeof data.cookies === 'object' &&
    !Array.isArray(data.cookies)
  ) {
    cookie = Object.entries(data.cookies)
      .filter(([, value]) => typeof value === 'string')
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
  } else if (data && typeof data === 'object') {
    cookie = Object.entries(data)
      .filter(([name, value]) =>
        name !== 'note' && typeof value === 'string'
      )
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
  }

  if (!cookie) {
    throw new Error('ملف الكوكيز فاضي أو تنسيقه غير معروف')
  }

  const size = Buffer.byteLength(cookie, 'utf8')
  console.log(`[Gemini] Cookie header size: ${size} bytes`)

  if (size > 6000) {
    throw new Error(
      `حجم الكوكيز ${size} بايت، أكبر من الحد الاحترازي 6000 بايت`
    )
  }

  return cookie
}

function extractToken(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const patterns = [
    new RegExp(`"${escaped}"\\s*:\\s*"([^"]+)"`),
    new RegExp(`"${escaped}"\\s*,\\s*"([^"]+)"`)
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return match[1]
  }

  return null
}

function detectLoginPage(html, headers) {
  const location = String(headers.location || '')
  const title = html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1] || ''

  return /accounts\.google\.com/i.test(location) ||
    /Sign in to continue/i.test(html) ||
    /Google Gemini Sign in/i.test(title)
}

function collectText(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, found)
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'text' && typeof item === 'string' && item.trim()) {
        found.push(item.trim())
      } else {
        collectText(item, found)
      }
    }
  }

  return found
}

function parseGeminiResponse(body) {
  const texts = []

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim()

    if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
      continue
    }

    try {
      collectText(JSON.parse(trimmed), texts)
    } catch {}
  }

  return [...new Set(texts)].join('\n').trim()
}

module.exports = {
  command: 'جيميني',
  category: 'ai',
  description: 'إرسال سؤال إلى Gemini',

  async execute(sock, msg) {
    const jid = msg.key.remoteJid

    try {
      const args = Array.isArray(msg.args) ? msg.args : []
      const question = args.join(' ').trim()

      if (!question) {
        await sock.sendMessage(jid, {
          text: 'اكتب سؤالك بعد الأمر\nمثال\n.جيميني اشرح قانون نيوتن الأول'
        }, { quoted: msg })
        return
      }

      const cookie = loadCookieHeader()

      await sock.sendMessage(jid, {
        text: '⏳ جاري الاتصال بـ Gemini...'
      }, { quoted: msg })

      const page = await request('https://gemini.google.com/app', {
        headers: {
          'user-agent': USER_AGENT,
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'ar,en-US;q=0.9,en;q=0.8',
          'cookie': cookie
        }
      })

      if (page.status !== 200) {
        throw new Error(`فتح صفحة Gemini فشل برمز HTTP ${page.status}`)
      }

      if (detectLoginPage(page.body, page.headers)) {
        throw new Error('Gemini رجّع صفحة تسجيل دخول، راجع صلاحية الجلسة')
      }

      const at = extractToken(page.body, 'SNlM0e')
      const fdr = extractToken(page.body, 'FdrFJe')
      const build = extractToken(page.body, 'cfb2h')

      if (!at || !fdr || !build) {
        throw new Error(
          'مش قادر أستخرج رموز الطلب من الصفحة، ممكن واجهة Gemini اتغيرت'
        )
      }

      const payload = [
        [question, 0, null, null, null, null, 0],
        null,
        ['ar'],
        null,
        null,
        null,
        1
      ]

      const postBody = new URLSearchParams({
        at,
        'f.req': JSON.stringify([null, JSON.stringify(payload)])
      }).toString()

      const response = await request(
        'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate',
        {
          method: 'POST',
          headers: {
            'user-agent': USER_AGENT,
            'accept': '*/*',
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'cookie': cookie,
            'origin': 'https://gemini.google.com',
            'referer': 'https://gemini.google.com/app',
            'x-same-domain': '1'
          },
          body: postBody
        }
      )

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Gemini رفض الطلب برمز HTTP ${response.status}، راجع الجلسة`
        )
      }

      if (response.status !== 200) {
        throw new Error(`طلب التوليد فشل برمز HTTP ${response.status}`)
      }

      const answer = parseGeminiResponse(response.body)

      if (!answer) {
        throw new Error(
          'Gemini رجّع استجابة لكن مقدرتش أستخرج الرد منها'
        )
      }

      await sock.sendMessage(jid, {
        text: `🤖 رد Gemini\n\n${answer.slice(0, 6000)}`
      }, { quoted: msg })

    } catch (error) {
      console.error('[Gemini Request Error]', error.message)

      await sock.sendMessage(jid, {
        text: `❌ فشل طلب Gemini\n\nالسبب: ${error.message}`
      }, { quoted: msg }).catch(() => {})
    }
  }
}
