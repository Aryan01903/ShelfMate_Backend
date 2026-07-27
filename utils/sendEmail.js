require("dotenv").config();
const nodemailer = require("nodemailer");

console.log(
  "BREVO_MAIL:",
  process.env.BREVO_MAIL ? "Loaded" : "MISSING!"
);

console.log(
  "BREVO_SMTP_KEY:",
  process.env.BREVO_SMTP_KEY ? "Loaded" : "MISSING!"
);

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_MAIL,
    pass: process.env.BREVO_SMTP_KEY,
  },
});

(async () => {
  try {
    await transporter.verify();
    console.log("SMTP Ready");
  } catch (err) {
    console.error("❌ SMTP Error:", err);
  }
})();

const sendMail = async (email, otp) => {
  try {
    const info = await transporter.sendMail({
      from: `"ShelfMate" <${process.env.BREVO_MAIL}>`,
      to: email,
      subject: "Your OTP for ShelfMate Platform",
      html: `
        <div style="font-family: Arial, sans-serif; padding:20px; background:#f9f9f9;">
          <h2 style="color:#EE6C0E;">OTP Verification</h2>

          <p>Hello,</p>

          <p>Your verification code for <strong>ShelfMate</strong> is:</p>

          <h1 style="font-size:32px;letter-spacing:5px;color:#EE6C0E;">
            ${otp}
          </h1>

          <p>This OTP will expire in <strong>5 minutes</strong>.</p>

          <p>If you did not request this OTP, please ignore this email.</p>

          <hr>

          <p>Regards,<br><strong>ShelfMate Team</strong></p>
        </div>
      `,
    });

    console.log("OTP sent:", info.messageId);
    return info;
  } catch (err) {
    console.error("❌ Failed to send OTP:", err);
    throw err;
  }
};

module.exports = sendMail;