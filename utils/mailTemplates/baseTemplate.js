const brandColor = "#BF9B53";

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const baseTemplate = ({ title, preheader, body, buttonText, buttonUrl }) => `
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:Arial,sans-serif;color:#1f2937;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      ${escapeHtml(preheader || title || "Horse Shipt notification")}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:${brandColor};padding:22px 24px;text-align:center;">
                <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:.4px;">Horse Shipt</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px;">
                <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;color:#111827;">${escapeHtml(title)}</h1>
                <div style="font-size:15px;line-height:1.7;color:#374151;">${body}</div>
                ${
                  buttonText && buttonUrl
                    ? `<div style="margin-top:26px;text-align:center;">
                        <a href="${buttonUrl}" style="display:inline-block;background:${brandColor};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:700;">
                          ${escapeHtml(buttonText)}
                        </a>
                      </div>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td style="background:#f3f4f6;padding:14px 24px;text-align:center;font-size:12px;color:#6b7280;">
                &copy; ${new Date().getFullYear()} Horse Shipt. This is an automated message.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
`;

module.exports = { baseTemplate, escapeHtml };
