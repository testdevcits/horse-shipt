const trimTrailingSlash = (value = "") => String(value).replace(/\/+$/, "");

const normalizePublicFrontendUrl = (value = "") => {
  const trimmedUrl = trimTrailingSlash(value);

  try {
    const url = new URL(trimmedUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      url.protocol = "https:";
    }
    if (url.hostname === "52.14.251.189" && url.port === "4000") {
      url.port = "";
      return trimTrailingSlash(url.toString());
    }
    if (url.hostname === "52.14.251.189") {
      return "https://frontend.horseshipt.com";
    }
  } catch {
    return trimmedUrl;
  }

  return trimmedUrl;
};

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
      : "https://frontend.horseshipt.com");

  return normalizePublicFrontendUrl(selectedUrl);
};

const buildFrontendUrl = (path = "") => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getFrontendUrl()}${normalizedPath}`;
};

module.exports = {
  buildFrontendUrl,
  getFrontendUrl,
};
