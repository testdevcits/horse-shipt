const trimTrailingSlash = (value = "") => String(value).replace(/\/+$/, "");

const getFrontendUrl = () => {
  const appEnv =
    process.env.APP_ENV ||
    process.env.BACKEND_ENV ||
    process.env.NODE_ENV ||
    "";
  const isDevelopment = appEnv === "development";

  const selectedUrl =
    process.env.PRODUCTION_FRONTEND_URL ||
    process.env.FRONTEND_URL ||
    (isDevelopment
      ? process.env.DEVELOPMENT_FRONTEND_URL ||
        "https://horse-shipt-frontend.vercel.app"
      : "http://52.14.251.189:4000");

  return trimTrailingSlash(selectedUrl);
};

const buildFrontendUrl = (path = "") => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getFrontendUrl()}${normalizedPath}`;
};

module.exports = {
  buildFrontendUrl,
  getFrontendUrl,
};
