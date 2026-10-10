
const antiLinks = require('../utils/antiLinks')

module.exports = {
    command: 'مضاد_الروابط_تشغيل',
    category: 'group',
    description: 'تشغيل مضاد الروابط',

    async execute(sock, m) {
        await antiLinks.setEnabled(sock, m, true)
    }
}
