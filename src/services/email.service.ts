import nodemailer, { Transporter } from 'nodemailer';
import path from 'path';
import dotenv from 'dotenv';

// Ensure .env is always loaded regardless of execution working directory
dotenv.config();
try {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
} catch {}

let transporterInstance: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporterInstance) {
    return transporterInstance;
  }

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';

  if (!user || !pass) {
    console.warn('[Email Service] SMTP_USER or SMTP_PASS missing. Running in simulation mode.');
    return null;
  }

  transporterInstance = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 8000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });

  return transporterInstance;
}

export async function sendOtpEmail(
  toEmail: string,
  otp: string,
  recipientName: string = 'Investor'
): Promise<{ sent: boolean; message: string }> {
  console.log(`\n================================================================`);
  console.log(`✉️  EMAIL OTP DISPATCH FOR: ${toEmail}`);
  console.log(`🔑  YOUR 6-DIGIT VERIFICATION CODE IS: [ ${otp} ]`);
  console.log(`⏱️   VALID FOR 15 MINUTES`);
  console.log(`================================================================\n`);

  const fromEmail = process.env.SMTP_FROM_EMAIL || 'infinixinvestments.info@gmail.com';
  const fromName = process.env.SMTP_FROM_NAME || 'INFINIX';
  const cleanToEmail = toEmail.trim().toLowerCase();

  // Plain-text alternative (CRITICAL for anti-spam scoring)
  const textContent = `Hello ${recipientName},

Your INFINIX Private Wealth 6-digit verification code is: ${otp}

Enter this code in your INFINIX app to complete your registration and unlock your wealth account.
This verification code is strictly confidential and expires in 15 minutes.

If you did not request this verification code, please ignore this email or contact support.

Regards,
INFINIX Private Wealth & Yield Desk
Support: support@infinixwealth.com
`;

  // HTML format: Clean, high-deliverability design with zero spam trigger attributes
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Verification Code</title>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #F4F6F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B;">
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F4F6F9;">
    <tr>
      <td align="center" style="padding: 12px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="max-width: 560px; width: 100%; background-color: #FFFFFF; border-radius: 12px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06); border: 1px solid #E2E8F0; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color: #080C14; padding: 28px 32px; text-align: left;">
              <span style="font-size: 20px; font-weight: 800; color: #D4AF37; letter-spacing: 2px;">INFINIX</span>
              <span style="font-size: 11px; font-weight: 700; color: #94A3B8; letter-spacing: 1px; margin-left: 8px;">PRIVATE WEALTH</span>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 32px 28px 32px;">
              <h1 style="font-size: 22px; font-weight: 700; color: #0F172A; margin: 0 0 12px 0;">Verification Code</h1>
              <p style="font-size: 15px; line-height: 24px; color: #334155; margin: 0 0 20px 0;">
                Hello <strong>${recipientName}</strong>,<br>
                Please use the following 6-digit one-time passcode to confirm your identity and complete your account setup.
              </p>

              <!-- OTP Box -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0;">
                <tr>
                  <td align="center" style="background-color: #F8FAFC; border: 2px dashed #D4AF37; border-radius: 10px; padding: 20px;">
                    <div style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 10px; color: #0F172A;">
                      ${otp}
                    </div>
                    <div style="font-size: 12px; color: #64748B; margin-top: 6px; font-weight: 600;">
                      Valid for 15 minutes • Do not share with anyone
                    </div>
                  </td>
                </tr>
              </table>

              <p style="font-size: 14px; line-height: 22px; color: #64748B; margin: 0 0 16px 0;">
                If you did not request this verification code, someone may have entered your email by mistake. You can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 20px 32px; font-size: 12px; color: #94A3B8; line-height: 18px;">
              <p style="margin: 0 0 4px 0;">This is an automated transactional security alert from <strong>INFINIX Private Wealth</strong>.</p>
              <p style="margin: 0;">Secured by 256-Bit Financial Encryption • Institutional Private Wealth Desk</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // 1. PRIMARY: Brevo HTTPS REST API (Port 443 - NEVER blocked by Render firewall!)
  const brevoApiKey = process.env.BREVO_API_KEY || process.env.SMTP_API_KEY;
  if (brevoApiKey) {
    try {
      const apiRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': brevoApiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: fromName, email: fromEmail },
          to: [{ email: cleanToEmail, name: recipientName }],
          subject: `${otp} is your INFINIX verification code`,
          textContent: textContent,
          htmlContent: htmlContent,
        }),
      });

      const apiData: any = await apiRes.json();
      if (apiRes.ok && apiData?.messageId) {
        console.log(`[Email Service - HTTPS API] ✅ Email sent to ${cleanToEmail}. MessageId: ${apiData.messageId}`);
        return { sent: true, message: `Verification code successfully sent to ${cleanToEmail}.` };
      } else {
        console.error(`[Email Service - HTTPS API] ❌ Brevo API error:`, apiData);
      }
    } catch (apiErr: any) {
      console.error(`[Email Service - HTTPS API] ❌ Network error: ${apiErr.message}`);
    }
  }

  // 2. SECONDARY: Standard SMTP via Nodemailer
  const transporter = getTransporter();

  if (!transporter) {
    return {
      sent: true,
      message: `OTP [${otp}] dispatched in local simulation mode.`,
    };
  }

  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: cleanToEmail,
      replyTo: fromEmail,
      subject: `${otp} is your INFINIX verification code`,
      text: textContent,
      html: htmlContent,
      headers: {
        'X-Entity-Ref-ID': `infinix-otp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'All',
        'Importance': 'high',
        'X-Priority': '1',
      },
    });

    console.log(`[Email Service - SMTP] ✅ Successfully sent verification email to ${cleanToEmail}. MessageId: ${info.messageId}`);
    return { sent: true, message: `Verification code successfully sent to ${cleanToEmail}.` };
  } catch (error: any) {
    console.error(`[Email Service - SMTP] ❌ Failed to send email via SMTP: ${error.message}`);
    return { sent: false, message: error.message };
  }
}
