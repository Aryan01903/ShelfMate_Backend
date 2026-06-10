require("dotenv").config();
const nodemailer=require("nodemailer")

console.log("MAIL_USER:", process.env.MAIL_USER ? "Loaded" : "MISSING!");
console.log("MAIL_PASS:", process.env.MAIL_PASS ? "Loaded" : "MISSING!");

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_MAIL,
    pass: process.env.BREVO_SMTP_KEY,
  },
});

const verifyTransporter = async () => {
  try {
    await transporter.verify();

    console.log("SMTP Ready");
  } catch (err) {
    console.error("SMTP Error:", err);
  }
};
verifyTransporter();


const sendMail = async ( email, otp ) => {
  try {
    const info = await transporter.sendMail({
      from: `"ShelfMate" <${process.env.MAIL_USER}>`,
      to: email,
      subject: "Your OTP for ShelfMate Platform",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background: #f9f9f9; border-radius: 10px;">
          <h2 style="color: #EE6C0E;">OTP Verification</h2>
          <p>Dear User,</p>
          <p>Your verification code for <strong>ShelfMate</strong> is:</p>
          <h1 style="font-size: 32px; letter-spacing: 5px; color: #EE6C0E;">${otp}</h1>
          <p>This OTP is valid for <strong>5 minutes</strong>.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <hr>
          <small>ShelfMate Team</small>
        </div>
      `,
    });

    console.log("OTP sent:", info.messageId);
    return info;

  } catch (err) {
    console.error(
      "Failed to send OTP:",
      err instanceof Error ? err.message : err
    );
    throw err;
  }
};

module.exports= sendMail;


