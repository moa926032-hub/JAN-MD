
const antiLinks = require('../utils/antiLinks')

module.exports = {
    command: 'مضاد_الروابط_ايقاف',
    category: 'group',
    description: 'إيقاف مضاد الروابط',

    async execute(sock, m) {
        await antiLinks.setEnabled(sock, m, false)
    }
}
