const trimTrailingSlash = (value = "") => String(value).replace(/\/+$/, "");

const getFrontendUrl = () => {
  const isProduction = process.env.NODE_ENV === "production";

  const selectedUrl = isProduction
    ? process.env.PRODUCTION_FRONTEND_URL ||
      process.env.FRONTEND_URL ||
      "http://52.14.251.189:4000"
    : process.env.DEVELOPMENT_FRONTEND_URL ||
      process.env.FRONTEND_URL ||
      "https://horse-shipt-frontend.vercel.app";

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
