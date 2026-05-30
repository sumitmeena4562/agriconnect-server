const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
    // Create a transporter
    const transporter = nodemailer.createTransport({
        service: 'gmail', // Standard Gmail service
        auth: {
            user: process.env.SMTP_EMAIL, // e.g. yourmail@gmail.com
            pass: process.env.SMTP_PASSWORD // App Password generated from Google Account
        }
    });

    // Define the email options
    const mailOptions = {
        from: `AgriConnect <${process.env.SMTP_EMAIL}>`,
        to: options.email,
        subject: options.subject,
        text: options.message,
        html: options.html
    };

    // Send the email
    await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
