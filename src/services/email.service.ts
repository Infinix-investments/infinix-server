import nodemailer, { Transporter } from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

let transporter: Transporter | null = null;

if (SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

export async function sendOtpEmail(toEmail: string, otp: string, recipientName: string = 'Investor'): Promise<{ sent: boolean; message: string }> {
  console.log(`\n================================================================`);
  console.log(`✉️  EMAIL OTP DISPATCH FOR: ${toEmail}`);
  console.log(`🔑  YOUR 6-DIGIT VERIFICATION CODE IS: [ ${otp} ]`);
  console.log(`⏱️   VALID FOR 15 MINUTES`);
  console.log(`================================================================\n`);

  if (!transporter) {
    // In dev / when SMTP credentials are not yet added, we log to console and simulate delivery
    return {
      sent: true,
      message: `OTP [${otp}] dispatched to ${toEmail} (simulation mode).`,
    };
  }

  try {
    await transporter.sendMail({
      from: `"INFINIX Wealth Desk" <${SMTP_USER}>`,
      to: toEmail,
      subject: `Your INFINIX Verification Code: ${otp}`,
      html: `
        <div style="font-family: Arial, sans-serif; background-color: #080C14; color: #FFFFFF; padding: 32px; border-radius: 8px;">
          <h2 style="color: #D4AF37; margin-bottom: 8px;">INFINIX Private Wealth & Yield Desk</h2>
          <p style="color: #94A3B8; font-size: 14px;">Identity Verification Security Code</p>
          <hr style="border: 0; border-top: 1px solid #1E293B; margin: 20px 0;" />
          <p>Dear ${recipientName},</p>
          <p>Please enter the following 6-digit verification code to confirm your registration and unlock your private wealth portal:</p>
          <div style="background-color: #0F172A; border: 1px solid #D4AF37; padding: 18px; text-align: center; border-radius: 6px; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #D4AF37;">${otp}</span>
          </div>
          <p style="font-size: 13px; color: #64748B;">This code will expire in 15 minutes. If you did not request this, please disregard this email.</p>
          <p style="font-size: 12px; color: #475569; margin-top: 24px;">INFINIX Institutional Wealth Advisory • Regulated Private Desk</p>
        </div>
      `,
    });
    return { sent: true, message: `OTP sent to ${toEmail}` };
  } catch (error: any) {
    console.error(`[Email Service] Failed to send email: ${error.message}`);
    return { sent: false, message: error.message };
  }
}
