const winston = require('winston');
const { combine, timestamp, printf, colorize } = winston.format;

const customFormat = printf(({ level, message, timestamp }) => `[${timestamp}] ${level}: ${message}`);

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), customFormat),
    transports: [
        new winston.transports.Console({ 
            format: combine(colorize(), customFormat) 
        }),
        new winston.transports.File({ 
            filename: 'logs/error.log', 
            level: 'error',
            maxsize: 5242880, // 5MB 自动轮转
            maxFiles: 5
        }),
        new winston.transports.File({ 
            filename: 'logs/combined.log',
            maxsize: 5242880,
            maxFiles: 5
        })
    ]
});

module.exports = logger;