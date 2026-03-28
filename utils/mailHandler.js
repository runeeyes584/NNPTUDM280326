const nodemailer = require("nodemailer");


const transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST || "sandbox.smtp.mailtrap.io",
    port: Number(process.env.MAILTRAP_PORT) || 2525,
    secure: false, // Use true for port 465, false for port 587
    auth: {
        user: process.env.MAILTRAP_USER || "",
        pass: process.env.MAILTRAP_PASS || "",
    },
});

module.exports = {
    sendMail: async (to,url) => {
        const info = await transporter.sendMail({
            from: 'admin@haha.com',
            to: to,
            subject: "RESET PASSWORD REQUEST",
            text: "lick vo day de doi pass", // Plain-text version of the message
            html: "lick vo <a href="+url+">day</a> de doi pass", // HTML version of the message
        });

        console.log("Message sent:", info.messageId);
    },
    sendGeneratedPasswordMail: async (to, username, password) => {
        const info = await transporter.sendMail({
            from: process.env.MAIL_FROM || 'admin@haha.com',
            to: to,
            subject: "TAI KHOAN MOI",
            text: `Tai khoan cua ban da duoc tao. Username: ${username}. Password tam thoi: ${password}`,
            html: `<p>Tai khoan cua ban da duoc tao.</p><p>Username: <b>${username}</b></p><p>Password tam thoi: <b>${password}</b></p>`,
        });

        console.log("Message sent:", info.messageId);
    }
}
