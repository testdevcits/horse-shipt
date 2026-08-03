const brandColor = "#BF9B53";

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const detailTable = (rows = []) => {
  const visibleRows = rows.filter((row) => row && row.label);
  if (!visibleRows.length) return "";

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;background:#fff8ea;border:1px dashed ${brandColor};border-collapse:collapse;">
      ${visibleRows
        .map(
          ({ label, value }, index) => `
            <tr>
              <td style="padding:14px 16px;font-size:13px;line-height:1.5;color:#6b7280;text-align:left;${
                index ? "border-top:1px solid #eadfca;" : ""
              }">${escapeHtml(label)}</td>
              <td style="padding:14px 16px;font-size:13px;line-height:1.5;color:#111827;font-weight:700;text-align:right;${
                index ? "border-top:1px solid #eadfca;" : ""
              }">${value || "N/A"}</td>
            </tr>`
        )
        .join("")}
    </table>
  `;
};

const noteBox = (content) =>
  content
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 0;background:#f9fafb;border:1px solid #eef0f3;">
        <tr>
          <td style="padding:14px 16px;font-size:12.5px;line-height:1.6;color:#6b7280;text-align:left;">${content}</td>
        </tr>
      </table>`
    : "";

const baseTemplate = ({
  title,
  preheader,
  body,
  buttonText,
  buttonUrl,
  note,
}) => `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(title || "HorseShipt Notification")}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Montserrat','Segoe UI',Arial,sans-serif;color:#111827;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${escapeHtml(preheader || title || "HorseShipt notification")}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:10px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #eadfca;border-collapse:collapse;">
          <tr>
            <td align="center" style="background:${brandColor};padding:28px 24px;">
              <p style="margin:0;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">HORSESHIPT</p>
              <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;line-height:1.35;font-weight:800;">${escapeHtml(title || "HorseShipt Notification")}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 30px;text-align:center;">
              <div style="font-size:15px;line-height:1.65;color:#111827;text-align:center;">${body}</div>
              ${
                buttonText && buttonUrl
                  ? `<div style="margin:24px 0 0;text-align:center;">
                      <a href="${buttonUrl}" style="display:inline-block;background:${brandColor};color:#ffffff;text-decoration:none;padding:11px 18px;font-size:13px;font-weight:700;">
                        ${escapeHtml(buttonText)}
                      </a>
                    </div>`
                  : ""
              }
              ${noteBox(note)}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px;background:#faf7f0;border-top:1px solid #eadfca;text-align:center;">
              <p style="margin:0 0 5px;font-size:12px;color:#9ca3af;">&copy; ${new Date().getFullYear()} HorseShipt. All rights reserved.</p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">This is an automated message, please don't reply directly to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

module.exports = { baseTemplate, detailTable, escapeHtml, noteBox };
