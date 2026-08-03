const fs = require("fs");
const path = require("path");

const LOG_DIR = process.env.STRIPE_ADMIN_LOG_DIR
  ? path.resolve(process.env.STRIPE_ADMIN_LOG_DIR)
  : path.join(__dirname, "..", "logs", "stripe-admin");

const SENSITIVE_KEYS = new Set([
  "authorization",
  "token",
  "password",
  "secret",
  "clientSecret",
  "paymentMethodId",
  "card",
]);

const pad = (value) => String(value).padStart(2, "0");

const getDateParts = (date = new Date()) => ({
  year: date.getFullYear(),
  month: pad(date.getMonth() + 1),
  day: pad(date.getDate()),
});

const getLogFilePath = (date = new Date()) => {
  const { year, month, day } = getDateParts(date);
  return path.join(LOG_DIR, `${year}-${month}-${day}.log`);
};

const sanitize = (value) => {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitize);

  return Object.entries(value).reduce((safe, [key, item]) => {
    safe[key] = SENSITIVE_KEYS.has(key) ? "[REDACTED]" : sanitize(item);
    return safe;
  }, {});
};

const appendStripeAdminAuditLog = async (entry = {}) => {
  try {
    await fs.promises.mkdir(LOG_DIR, { recursive: true });
    await fs.promises.appendFile(
      getLogFilePath(),
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        ...entry,
      })}\n`,
      "utf8"
    );
  } catch (error) {
    console.error("[STRIPE ADMIN AUDIT] Failed to write log:", error.message);
  }
};

const stripeAdminAuditMiddleware = (req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    appendStripeAdminAuditLog({
      admin: {
        id: req.admin?.id || null,
        role: req.admin?.role || null,
      },
      action: `${req.method} ${req.originalUrl}`,
      method: req.method,
      path: req.originalUrl,
      params: sanitize(req.params),
      query: sanitize(req.query),
      body: sanitize(req.body),
      statusCode: res.statusCode,
      success: res.statusCode < 400,
      durationMs: Date.now() - startedAt,
      ip: req.ip,
      userAgent: req.get("user-agent") || null,
    });
  });

  next();
};

const isLastDayOfMonth = (date = new Date()) => {
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  return tomorrow.getDate() === 1;
};

const cleanupStripeAdminAuditLogs = async (date = new Date()) => {
  try {
    await fs.promises.mkdir(LOG_DIR, { recursive: true });
    const files = await fs.promises.readdir(LOG_DIR);
    const { year, month } = getDateParts(date);
    const currentMonthPrefix = `${year}-${month}`;

    await Promise.all(
      files
        .filter((file) => /^\d{4}-\d{2}-\d{2}\.log$/.test(file))
        .filter((file) => file.slice(0, 7) < currentMonthPrefix)
        .map((file) => fs.promises.unlink(path.join(LOG_DIR, file)))
    );
  } catch (error) {
    console.error("[STRIPE ADMIN AUDIT] Cleanup failed:", error.message);
  }
};

const scheduleStripeAdminAuditLogCleanup = () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const now = new Date();

  if (isLastDayOfMonth(now)) {
    cleanupStripeAdminAuditLogs(now);
  }

  setInterval(() => {
    const runDate = new Date();
    if (isLastDayOfMonth(runDate)) {
      cleanupStripeAdminAuditLogs(runDate);
    }
  }, ONE_DAY_MS).unref?.();
};

module.exports = {
  stripeAdminAuditMiddleware,
  cleanupStripeAdminAuditLogs,
  scheduleStripeAdminAuditLogCleanup,
};
