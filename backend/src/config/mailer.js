const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

// Configura o "transportador" de e-mail usando as credenciais do Gmail
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: true, // true para porta 465
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

module.exports = transporter;