const { fork } = require('child_process');
const { join } = require('path');
const fs = require('fs-extra');
const logger = require('./utils/console');

// الإعدادات
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;
const CONNECTION_TIMEOUT = 15000;
const AUTO_RESTART_INTERVAL = 6 * 60 * 60 * 1000; // إعادة تشغيل كل 6 ساعات

let isRunning = false;
let retryCount = 0;
let childProcess = null;
let autoRestartTimer = null;

// دالة للإعدادات الأولية
async function initialize() {
    logger.info('🔧 جاري التحضير لتشغيل البوت...');
    
    const currentPath = process.cwd();
    const connectionFolder = join(currentPath, 'ملف_الاتصال');
    
    // إنشاء مجلد الاتصال إذا لم يكن موجوداً
    if (!fs.existsSync(connectionFolder)) {
        logger.warn('⚠️ مجلد الاتصال غير موجود، جاري الإنشاء...');
        try {
            await fs.ensureDir(connectionFolder);
            logger.success('✅ تم إنشاء مجلد الاتصال بنجاح');
        } catch (error) {
            logger.error('❌ فشل في إنشاء مجلد الاتصال:', error.message);
        }
    }
    
    // التحقق من ملفات أساسية
    const requiredFiles = [
        'main.js',
        'config.js',
        'utils/console.js'
    ];
    
    for (const file of requiredFiles) {
        const filePath = join(__dirname, file);
        if (!fs.existsSync(filePath)) {
            logger.error(`❌ ملف مطلوب غير موجود: ${file}`);
            return false;
        }
    }
    
    return true;
}

// دالة تشغيل البوت
function startBot(retry = 0) {
    if (isRunning) {
        logger.warn('⚠️ البوت قيد التشغيل بالفعل');
        return;
    }
    
    isRunning = true;
    logger.info(`🚀 جاري تشغيل البوت (محاولة ${retry + 1}/${MAX_RETRIES})...`);
    
    // إزالة مؤقت إعادة التشغيل التلقائي السابق
    if (autoRestartTimer) {
        clearTimeout(autoRestartTimer);
        autoRestartTimer = null;
    }
    
    // تشغيل العملية الفرعية
    childProcess = fork(join(__dirname, 'main.js'), [], {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env: {
            ...process.env,
            NODE_ENV: process.env.NODE_ENV || 'production',
            CONNECTION_FOLDER: join(process.cwd(), 'ملف_الاتصال'),
            START_TIME: Date.now()
        },
        detached: false
    });
    
    // معالجة رسائل العملية الفرعية
    childProcess.on('message', (data) => {
        if (typeof data === 'string') {
            handleChildMessage(data);
        } else if (typeof data === 'object') {
            handleChildData(data);
        }
    });
    
    // معالجة خروج العملية الفرعية
    childProcess.on('exit', async (code, signal) => {
        isRunning = false;
        childProcess = null;
        
        logger.info(`📊 حالة الخروج: ${code !== null ? `كود ${code}` : `إشارة ${signal}`}`);
        
        if (code === 0 || code === null) {
            logger.success('✅ تم إغلاق البوت بشكل طبيعي');
            process.exit(0);
            return;
        }
        
        // رموز الأخطاء الخاصة
        const errorCodes = {
            429: '⚠️ تم تجاوز معدل الطلبات، الانتظار 15 ثانية...',
            401: '🔐 خطأ في المصادقة، تحقق من بيانات الاتصال',
            408: '⏱️ انتهت مهلة الاتصال',
            500: '🔧 خطأ داخلي في السيرفر',
            503: '🚧 الخدمة غير متاحة مؤقتاً'
        };
        
        if (errorCodes[code]) {
            logger.warn(errorCodes[code]);
            
            if (code === 429) {
                await delay(15000);
            }
        }
        
        // إعادة التشغيل إذا لم نتجاوز الحد الأقصى
        if (retry < MAX_RETRIES - 1) {
            const nextRetry = retry + 1;
            const delayTime = RETRY_DELAY * Math.pow(1.5, nextRetry); // زيادة زمنية متزايدة
            
            logger.warn(`🔄 إعادة التشغيل بعد ${delayTime / 1000} ثانية...`);
            await delay(delayTime);
            
            startBot(nextRetry);
        } else {
            logger.error(`❌ تجاوز الحد الأقصى لمحاولات التشغيل (${MAX_RETRIES})`);
            logger.info('🛑 جاري إيقاف النظام...');
            
            // محاولة إغلاق نظيف
            setTimeout(() => {
                process.exit(1);
            }, 3000);
        }
    });
    
    // معالجة أخطاء العملية الفرعية
    childProcess.on('error', (err) => {
        logger.error('❌ خطأ في العملية الفرعية:', err.message);
        isRunning = false;
    });
    
    // ضبط مؤقت للاتصال
    const connectionTimer = setTimeout(() => {
        if (childProcess && childProcess.connected) {
            clearTimeout(connectionTimer);
            return;
        }
        
        logger.error('❌ فشل الاتصال بالبوت خلال المهلة المحددة');
        if (childProcess) {
            childProcess.kill('SIGKILL');
        }
    }, CONNECTION_TIMEOUT);
    
    // إرسال إشارة ping دورية
    const pingInterval = setInterval(() => {
        if (childProcess && childProcess.connected) {
            childProcess.send({ type: 'ping', time: Date.now() });
        } else {
            clearInterval(pingInterval);
        }
    }, 30000);
    
    // ضبط إعادة التشغيل التلقائي
    autoRestartTimer = setTimeout(() => {
        logger.info('🔄 إعادة تشغيل تلقائي للصيانة الدورية');
        if (childProcess && childProcess.connected) {
            childProcess.send({ type: 'graceful_shutdown', reason: 'auto_restart' });
        }
    }, AUTO_RESTART_INTERVAL);
    
    // تنظيف المؤقتات عند الخروج
    childProcess.once('exit', () => {
        clearTimeout(connectionTimer);
        clearInterval(pingInterval);
    });
}

// معالجة رسائل العملية الفرعية
function handleChildMessage(message) {
    switch (message) {
        case 'ready':
            retryCount = 0;
            logger.success('✅ البوت جاهز للعمل!');
            logger.info(`📊 PID: ${childProcess.pid}`);
            break;
            
        case 'reset':
            logger.warn('🔄 طلب إعادة تشغيل من البوت...');
            if (childProcess) {
                childProcess.kill('SIGTERM');
                setTimeout(() => startBot(0), 2000);
            }
            break;
            
        case 'reload_plugins':
            logger.info('🔄 طلب إعادة تحميل الإضافات...');
            break;
            
        default:
            logger.debug(`📨 رسالة من البوت: ${message}`);
    }
}

// معالجة بيانات العملية الفرعية
function handleChildData(data) {
    if (data.type === 'stats') {
        logger.info(`📈 إحصائيات: ${JSON.stringify(data.stats)}`);
    } else if (data.type === 'error') {
        logger.error(`❌ خطأ من البوت: ${data.message}`);
    } else if (data.type === 'warning') {
        logger.warn(`⚠️ تحذير: ${data.message}`);
    }
}

// دالة تأخير
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// دالة الإغلاق النظيف
async function gracefulShutdown() {
    logger.info('🛑 بدء الإغلاق النظيف...');
    
    if (autoRestartTimer) {
        clearTimeout(autoRestartTimer);
    }
    
    if (childProcess && childProcess.connected) {
        logger.info('📤 إرسال إشارة إغلاق للبوت...');
        childProcess.send({ type: 'shutdown' });
        
        // الانتظار 5 ثواني للإغلاق النظيف
        await delay(5000);
        
        if (childProcess.connected) {
            logger.warn('⚠️ إجبار الإغلاق...');
            childProcess.kill('SIGKILL');
        }
    }
    
    logger.success('✅ تم إيقاف النظام بنجاح');
    process.exit(0);
}

// معالجة إشارات النظام
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGUSR2', gracefulShutdown); // لإعادة التشغيل السريع

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (err) => {
    const knownErrors = ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED'];
    
    if (knownErrors.includes(err.code)) {
        logger.warn(`⚠️ خطأ في الاتصال: ${err.code}`);
        return;
    }
    
    logger.error('❌ خطأ غير معالج:', {
        message: err.message,
        code: err.code,
        stack: err.stack
    });
    
    // إعادة التشغيل في حالة خطأ حرج
    if (!err.code && err.message.includes('FATAL')) {
        setTimeout(() => {
            if (childProcess) childProcess.kill();
            startBot(0);
        }, 5000);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    if (reason?.code === 429) {
        logger.warn('⚠️ تجاوز معدل الطلبات');
        return;
    }
    
    logger.error('❌ وعد مرفوض غير معالج:', reason);
});

// التشغيل الرئيسي
async function main() {
    try {
        logger.info('📦 نظام تشغيل البوت - Mr. Sokary Bot');
        logger.info('========================================');
        
        // التحقق من المتطلبات
        const initialized = await initialize();
        if (!initialized) {
            logger.error('❌ فشل في تهيئة النظام');
            process.exit(1);
        }
        
        // معلومات النظام
        logger.info(`🖥️  نظام التشغيل: ${process.platform}`);
        logger.info(`📂 المسار: ${process.cwd()}`);
        logger.info(`👤 المستخدم: ${process.env.USER || process.env.USERNAME || 'غير معروف'}`);
        
        // بدء تشغيل البوت
        startBot(0);
        
        // إظهار حالة النظام كل دقيقة
        setInterval(() => {
            if (isRunning) {
                const memoryUsage = process.memoryUsage();
                const memoryMB = Math.round(memoryUsage.rss / 1024 / 1024);
                logger.debug(`🧠 استخدام الذاكرة: ${memoryMB} MB | تشغيل: ${Math.floor(process.uptime() / 60)} دقيقة`);
            }
        }, 60000);
        
    } catch (error) {
        logger.error('❌ خطأ في التشغيل الرئيسي:', error);
        process.exit(1);
    }
}

// بدء التشغيل
if (require.main === module) {
    main();
}

module.exports = {
    startBot,
    gracefulShutdown,
    isRunning: () => isRunning
};