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
  "clientsecret",
  "paymentmethodid",
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
    safe[key] = SENSITIVE_KEYS.has(String(key).toLowerCase())
      ? "[REDACTED]"
      : sanitize(item);
    return safe;
  }, {});
};

const compact = (value) => {
  if (value === undefined || value === null || value === "") return "N/A";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

const formatDateTime = (date = new Date()) =>
  date.toISOString().replace("T", " ").replace("Z", " UTC");

const getRoutePath = (req) => {
  const originalUrl = req.originalUrl || req.url || "";
  return originalUrl.split("?")[0];
};

const getActionLabel = (req) => {
  const method = req.method;
  const routePath = getRoutePath(req);

  if (method === "GET" && routePath.endsWith("/stripe/balance")) {
    return "Viewed Stripe balance";
  }
  if (method === "GET" && routePath.endsWith("/stripe/transactions")) {
    return "Viewed Stripe transactions";
  }
  if (method === "GET" && routePath.endsWith("/stripe/transfer-availability")) {
    return "Viewed transfer availability";
  }
  if (method === "GET" && routePath.endsWith("/stripe/subscription-products")) {
    return "Viewed subscription products and prices";
  }
  if (method === "POST" && routePath.endsWith("/stripe/subscription-price")) {
    return "Created subscription price";
  }
  if (method === "PUT" && routePath.includes("/stripe/subscription-price/")) {
    return "Updated subscription price";
  }
  if (
    method === "PATCH" &&
    routePath.includes("/stripe/subscription-price/") &&
    routePath.endsWith("/deactivate")
  ) {
    return "Deactivated subscription price";
  }

  return `${method} ${routePath}`;
};

const getActionNote = (req, responseBody) => {
  const routePath = getRoutePath(req);
  const data = responseBody?.data;

  if (routePath.endsWith("/stripe/balance")) {
    return `Available ${compact(data?.available)} ${compact(data?.currency)}; pending ${compact(data?.pending)} ${compact(data?.currency)}.`;
  }
  if (routePath.endsWith("/stripe/transactions")) {
    return `Fetched ${compact(responseBody?.totalTransactions)} transactions for filter "${compact(responseBody?.filter)}".`;
  }
  if (routePath.endsWith("/stripe/transfer-availability")) {
    return `Recommended transfer ${compact(data?.recommendedTransferToClientBank)} ${compact(data?.currency)}; Stripe available ${compact(data?.stripe?.available)}.`;
  }
  if (routePath.endsWith("/stripe/subscription-products")) {
    return `Fetched ${compact(responseBody?.totalProducts)} active Stripe products.`;
  }
  if (req.method === "POST" && routePath.endsWith("/stripe/subscription-price")) {
    return `Created price ${compact(data?.id || data?.priceId)} for product ${compact(req.body?.productId)} amount ${compact(req.body?.amount)} ${compact(req.body?.currency || "usd")}.`;
  }
  if (req.method === "PUT" && routePath.includes("/stripe/subscription-price/")) {
    return data?.newPriceId
      ? `Replaced old price ${compact(data.oldPriceId)} with new price ${compact(data.newPriceId)} amount ${compact(data.amount)} ${compact(data.currency)}.`
      : `Updated price ${compact(data?.priceId || req.params?.priceId)} active=${compact(data?.active)}.`;
  }
  if (req.method === "PATCH" && routePath.endsWith("/deactivate")) {
    return `Deactivated price ${compact(data?.priceId || req.params?.priceId)}.`;
  }

  return responseBody?.message || "No response summary available.";
};

const formatKeyValues = (value = {}) => {
  const safeValue = sanitize(value) || {};
  const entries = Object.entries(safeValue).filter(
    ([, item]) => item !== undefined && item !== null && item !== ""
  );

  if (!entries.length) return "N/A";

  return entries.map(([key, item]) => `${key}=${compact(item)}`).join(", ");
};

const formatAuditEntry = (entry) => {
  const status = entry.success ? "SUCCESS" : "FAILED";
  return [
    `[${formatDateTime(entry.timestamp)}] ${entry.action}`,
    `Admin: ${entry.admin.role || "unknown"} (${entry.admin.id || "unknown"})`,
    `Request: ${entry.method} ${entry.path}`,
    `Status: ${status} ${entry.statusCode} | Duration: ${entry.durationMs} ms | IP: ${entry.ip || "N/A"}`,
    `Params: ${formatKeyValues(entry.params)}`,
    `Query: ${formatKeyValues(entry.query)}`,
    `Body: ${formatKeyValues(entry.body)}`,
    `Result: ${entry.result}`,
    "----------------------------------------",
    "",
  ].join("\n");
};

const appendStripeAdminAuditLog = async (entry = {}) => {
  try {
    await fs.promises.mkdir(LOG_DIR, { recursive: true });
    await fs.promises.appendFile(getLogFilePath(), formatAuditEntry(entry), "utf8");
  } catch (error) {
    console.error("[STRIPE ADMIN AUDIT] Failed to write log:", error.message);
  }
};

const stripeAdminAuditMiddleware = (req, res, next) => {
  const startedAt = Date.now();
  const originalJson = res.json.bind(res);
  let responseBody = null;

  res.json = (body) => {
    responseBody = sanitize(body);
    return originalJson(body);
  };

  res.on("finish", () => {
    const timestamp = new Date();
    appendStripeAdminAuditLog({
      timestamp,
      admin: {
        id: req.admin?.id || null,
        role: req.admin?.role || null,
      },
      action: getActionLabel(req),
      method: req.method,
      path: req.originalUrl,
      params: sanitize(req.params),
      query: sanitize(req.query),
      body: sanitize(req.body),
      result: getActionNote(req, responseBody),
      statusCode: res.statusCode,
      success: res.statusCode < 400,
      durationMs: Date.now() - startedAt,
      ip: req.ip,
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
