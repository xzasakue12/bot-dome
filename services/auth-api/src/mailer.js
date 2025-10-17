const nodemailer = require('nodemailer');

const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

async function sendCode({ to, code, appName }) {
    const from = process.env.MAIL_FROM || process.env.SMTP_USER;
    const subject = `${appName} login code`;
    const text = `Your ${appName} login code is ${code}. This code expires in 5 minutes.`;
    await transport.sendMail({ from, to, subject, text });
}

module.exports = { sendCode };
