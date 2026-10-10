const enabledGroups = new Set();
const recentMessages = new Map();

const WINDOW_MS = 8000;
const MAX_DUPLICATES = 3;

function getText(msg) {
  const m = msg.message || {};

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  ).trim();
}

module.exports = {
  command: 'مضاد_تكرار',
  description: 'تشغيل وإيقاف الحماية من الرسائل المتكررة',
  usage: '.مضاد_تكرار تشغيل',

  enabledGroups,
  recentMessages,

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    if (!jid?.endsWith('@g.us')) {
      return sock.sendMessage(jid, {
        text: '❌ الأمر للمجموعات فقط.'
      }, { quoted: msg });
    }

    try {
      const metadata = await sock.groupMetadata(jid);
      const sender =
        msg.key.participant || msg.key.remoteJid;

      const participant = metadata.participants.find(
        p => p.id === sender
      );

      if (!participant?.admin) {
        return sock.sendMessage(jid, {
          text: '❌ الأمر للمشرفين فقط.'
        }, { quoted: msg });
      }

      const text = getText(msg);
      const action = text.split(/\s+/).slice(1)[0];

      if (action === 'تشغيل') {
        enabledGroups.add(jid);

        return sock.sendMessage(jid, {
          text: '✅ تم تشغيل مضاد التكرار.'
        }, { quoted: msg });
      }

      if (action === 'ايقاف' || action === 'إيقاف') {
        enabledGroups.delete(jid);
        recentMessages.delete(jid);

        return sock.sendMessage(jid, {
          text: '🛑 تم إيقاف مضاد التكرار.'
        }, { quoted: msg });
      }

      if (action === 'حالة') {
        const enabled = enabledGroups.has(jid);

        return sock.sendMessage(jid, {
          text: enabled
            ? '🟢 مضاد التكرار يعمل.'
            : '🔴 مضاد التكرار متوقف.'
        }, { quoted: msg });
      }

      return sock.sendMessage(jid, {
        text:
          'طريقة الاستخدام:\n' +
          '• .مضاد_تكرار تشغيل\n' +
          '• .مضاد_تكرار ايقاف\n' +
          '• .مضاد_تكرار حالة'
      }, { quoted: msg });

    } catch (error) {
      console.error('Anti-spam command error:', error);

      return sock.sendMessage(jid, {
        text: '❌ تعذر تغيير إعدادات الحماية.'
      }, { quoted: msg });
    }
  },

  async checkMessage(sock, msg) {
    const jid = msg.key.remoteJid;

    if (!jid?.endsWith('@g.us')) return;
    if (!this.enabledGroups.has(jid)) return;
    if (msg.key.fromMe) return;

    const text = getText(msg);

    // تجاهل الرسائل الفارغة والأوامر
    if (!text || text.startsWith('.')) return;

    const sender = msg.key.participant;
    if (!sender) return;

    try {
      const metadata = await sock.groupMetadata(jid);
      const participant = metadata.participants.find(
        p => p.id === sender
      );

      // عدم تطبيق الحماية على المشرفين
      if (participant?.admin) return;

      const now = Date.now();

      if (!this.recentMessages.has(jid)) {
        this.recentMessages.set(jid, new Map());
      }

      const groupMessages = this.recentMessages.get(jid);
      const previous = groupMessages.get(sender) || [];

      const recent = previous.filter(
        item => now - item.time <= WINDOW_MS
      );

      recent.push({
        text: text.toLowerCase().replace(/\s+/g, ' '),
        time: now
      });

      groupMessages.set(sender, recent);

      const repeated = recent.filter(
        item => item.text === recent[recent.length - 1].text
      );

      if (repeated.length >= MAX_DUPLICATES) {
        // حذف الرسالة الحالية فقط
        await sock.sendMessage(jid, {
          delete: msg.key
        });

        // منع تكرار التنبيه عن كل رسالة
        groupMessages.set(sender, []);
      }
    } catch (error) {
      console.error('Anti-spam check error:', error);
    }
  }
};