module.exports = {
  status: "on",
  name: 'ايدي',
  command: ['id'],
  category: 'general',
  description: 'جلب ايدي الجروب أو الشات',

  async execute(sock, msg) {
    try {
      const from = msg.key.remoteJid;
      const isGroup = from.endsWith('@g.us');

      let text = '';

      if (isGroup) {
        text = `🆔 *Group ID*
━━━━━━━━━━━━━━
${from}
━━━━━━━━━━━━━━`;
      } else {
        const sender = msg.key.participant || from;
        text = `🆔 *Chat ID*
━━━━━━━━━━━━━━
${from}

🧑‍💻 *User ID*
━━━━━━━━━━━━━━
${sender}
━━━━━━━━━━━━━━`;
      }

      await sock.sendMessage(
        from,
        { text },
        { quoted: msg }
      );

    } catch (error) {
      console.error('خطأ في أمر ID:', error);
      await sock.sendMessage(
        msg.key.remoteJid,
        { text: '❌ حصل خطأ أثناء جلب الـ ID' },
        { quoted: msg }
      );
    }
  }
};