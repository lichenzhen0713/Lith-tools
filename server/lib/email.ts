import nodemailer, { type Transporter } from 'nodemailer';
import { config, hasSmtp } from '../config.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!hasSmtp) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
    connectionTimeout: 15_000,
  });
  return transporter;
}

function layout(title: string, body: string, accent = '#4f46e5'): string {
  return `<!doctype html>
<html lang="zh-CN"><body style="margin:0;padding:24px;background:#f5f6fa;font-family:-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#1f2937">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="padding:28px 32px 8px">
      <h1 style="margin:0;font-size:22px;color:${accent}">${title}</h1>
    </div>
    <div style="padding:8px 32px 28px;font-size:15px;line-height:1.7">${body}</div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #eee;color:#9ca3af;font-size:12px">
      ©${new Date().getFullYear()} Lith Tools · 多功能在线工具箱
    </div>
  </div>
</body></html>`;
}

export interface MailResult {
  delivered: boolean;
  error?: string;
}

export async function sendMail(to: string, subject: string, html: string): Promise<MailResult> {
  const tx = getTransporter();
  if (!tx) {
    console.log(`[mail:dev] to=${to} subject=${subject}`);
    return { delivered: false, error: 'SMTP 未配置' };
  }
  try {
    await tx.sendMail({
      from: config.smtp.from || `Lith Tools <${config.smtp.user}>`,
      to,
      subject,
      html,
    });
    return { delivered: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[mail] send failed:', message);
    return { delivered: false, error: message };
  }
}

export function verificationMail(code: string): { subject: string; html: string } {
  return {
    subject: '【Lith Tools】邮箱验证码',
    html: layout(
      '邮箱验证码',
      `<p>您好，感谢注册 Lith Tools。</p>
       <p>您的验证码是：</p>
       <p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#4f46e5;margin:16px 0">${code}</p>
       <p>验证码 15 分钟内有效。如果这不是您本人的操作，请忽略本邮件。</p>`,
    ),
  };
}

export function resetMail(link: string): { subject: string; html: string } {
  return {
    subject: '【Lith Tools】密码重置请求',
    html: layout(
      '重置密码',
      `<p>我们收到了重置您 Lith Tools 账户密码的请求。</p>
       <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px">重置密码</a></p>
       <p>该链接 1 小时内有效，且只能使用一次。如果这不是您本人的操作，请忽略本邮件。</p>`,
    ),
  };
}

export function submissionResultMail(title: string, approved: boolean, detail: string): { subject: string; html: string } {
  return {
    subject: approved ? '【Lith Tools】您的投稿已通过' : '【Lith Tools】您的投稿已被驳回',
    html: layout(
      approved ? '投稿已通过' : '投稿未通过',
      `<p>您的投稿《${title}》${approved ? '已通过审核，感谢您的贡献！' : '未通过审核。'}</p>
       ${detail ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:4px solid ${approved ? '#10b981' : '#f43f5e'};background:#f9fafb;color:#4b5563">${detail}</blockquote>` : ''}`,
      approved ? '#059669' : '#e11d48',
    ),
  };
}

export function feedbackResultMail(resolved: boolean): { subject: string; html: string } {
  return {
    subject: '【Lith Tools】您的反馈处理结果',
    html: layout(
      '反馈处理结果',
      `<p>感谢您的反馈，我们已${resolved ? '处理' : '查看'}您提交的问题。</p>
       <p>如果问题仍然存在，欢迎随时再次反馈。</p>`,
    ),
  };
}

export function banNoticeMail(bannedUntil: string, reason: string, banned: boolean): { subject: string; html: string } {
  return {
    subject: banned ? '【Lith Tools】您的账户已被封禁' : '【Lith Tools】您的账户已解封',
    html: layout(
      banned ? '账户已被封禁' : '账户已解封',
      banned
        ? `<p>您的账户已被封禁，解封时间：<strong>${bannedUntil}</strong>。</p>
           <p>封禁原因：${reason || '未填写'}</p>
           <p>如果您认为这是一个错误，请联系网站管理员。</p>`
        : `<p>您的账户已恢复正常使用，欢迎回来。</p>`,
      banned ? '#e11d48' : '#059669',
    ),
  };
}
