
module.exports = {
  command: 'معلومات',
  description: 'عرض المعلومات المتاحة عن صاحب الرسالة المقتبسة',
  usage: '.معلومات',

  async execute(sock, msg) {
    try {
      const jid = msg.key.remoteJid;

      const context =
        msg.message?.extendedTextMessage?.contextInfo;

      const target =
        context?.participant ||
        (context?.remoteJid &&
         context.remoteJid !== jid
          ? context.remoteJid
          : null);

      if (!target) {
        return await sock.sendMessage(jid, {
          text: '❌ رد على رسالة الشخص أولاً.'
        }, { quoted: msg });
      }

      const isGroup = target.endsWith('@g.us');

      if (isGroup) {
        return await sock.sendMessage(jid, {
          text: '❌ الرسالة المقتبسة لا تحدد شخصًا بعينه.'
        }, { quoted: msg });
      }

      const number = target.split('@')[0];

      let role = 'غير متاح';
      let groupName = 'محادثة خاصة';

      // في المجموعة الحالية، يمكن قراءة صلاحية العضو
      if (jid.endsWith('@g.us')) {
        const metadata = await sock.groupMetadata(jid);
        const member = metadata.participants.find(
          p => p.id === target
        );

        if (member) {
          role = member.admin === 'superadmin'
            ? 'مالك المجموعة'
            : member.admin
              ? 'مشرف'
              : 'عضو';

          groupName = metadata.subject;
        }
      }

      const result = [
        '📋 *المعلومات المتاحة*',
        '',
        `📱 المعرّف: ${number}`,
        `💬 نوع المحادثة: ${
          jid.endsWith('@g.us') ? 'مجموعة' : 'خاصة'
        }`,
        `👤 الصلاحية: ${role}`,
        `👥 المجموعة: ${groupName}`,
        '',
        'ℹ️ المعلومات المعروضة مقتصرة على البيانات المتاحة للبوت.'
      ].join('\n');

      return await sock.sendMessage(jid, {
        text: result,
        mentions: [target]
      }, { quoted: msg });

    } catch (error) {
      console.error('خطأ في أمر معلومات:', error);

      return await sock.sendMessage(
        msg.key.remoteJid,
        { text: '❌ حدث خطأ أثناء جلب المعلومات.' },
        { quoted: msg }
      );
    }
  }
};
