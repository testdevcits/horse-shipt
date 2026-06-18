const fs = require("fs");
const path = require("path");

const backendRoot = path.resolve(__dirname, "..");
const targets = ["controllers", "routes"].map((dir) =>
  path.join(backendRoot, dir)
);
const responseFile = path.join(backendRoot, "responses", "api.response.js");

const files = [];
const messages = new Map();
const keyByMessage = new Map();
const usedKeys = new Set();

function walk(dir) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
}

function unescapeString(value) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}

function makeKey(message) {
  let base = message
    .replace(/\$\{[^}]+\}/g, " VALUE ")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

  if (!base) base = "MESSAGE";
  if (/^[0-9]/.test(base)) base = `MSG_${base}`;
  if (base.length > 72) base = base.slice(0, 72).replace(/_+$/g, "");

  let key = base;
  let index = 2;
  while (usedKeys.has(key) && messages.get(key) !== message) {
    key = `${base}_${index}`;
    index += 1;
  }
  usedKeys.add(key);
  return key;
}

function getKey(rawMessage) {
  const message = unescapeString(rawMessage);
  if (keyByMessage.has(message)) return keyByMessage.get(message);

  const key = makeKey(message);
  keyByMessage.set(message, key);
  messages.set(key, message);
  return key;
}

function toRequirePath(filePath) {
  const relativePath = path.relative(
    path.dirname(filePath),
    responseFile.replace(/\.js$/, "")
  );
  return relativePath.startsWith(".")
    ? relativePath.replace(/\\/g, "/")
    : `./${relativePath.replace(/\\/g, "/")}`;
}

function addImport(source, filePath) {
  if (!source.includes("apiResponse.")) return source;
  if (source.includes("api.response")) return source;

  const importLine = `const { apiResponse } = require("${toRequirePath(filePath)}");`;
  if (source.startsWith("#!")) {
    const newline = source.indexOf("\n");
    return `${source.slice(0, newline + 1)}${importLine}\n${source.slice(
      newline + 1
    )}`;
  }

  return `${importLine}\n${source}`;
}

function replaceStaticMessageProperties(source) {
  return source.replace(
    /(\bmessage\s*:\s*)(["'])((?:\\.|(?!\2).)*)\2/g,
    (_match, prefix, _quote, rawMessage) =>
      `${prefix}apiResponse.${getKey(rawMessage)}`
  );
}

function replaceStaticErrorsArrays(source) {
  return source.replace(
    /(\berrors\s*:\s*\[\s*)(["'])((?:\\.|(?!\2).)*)\2(\s*\])/g,
    (_match, prefix, _quote, rawMessage, suffix) =>
      `${prefix}apiResponse.${getKey(rawMessage)}${suffix}`
  );
}

function writeResponseFile() {
  const entries = [...messages.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const body = entries
    .map(([key, message]) => `  ${key}: ${JSON.stringify(message)},`)
    .join("\n");

  fs.writeFileSync(
    responseFile,
    `const apiResponse = {\n${body}\n};\n\nmodule.exports = { apiResponse };\n`,
    "utf8"
  );
}

for (const target of targets) walk(target);

let changedFiles = 0;
for (const file of files) {
  const original = fs.readFileSync(file, "utf8");
  let updated = replaceStaticMessageProperties(original);
  updated = replaceStaticErrorsArrays(updated);
  updated = addImport(updated, file);

  if (updated !== original) {
    fs.writeFileSync(file, updated, "utf8");
    changedFiles += 1;
  }
}

writeResponseFile();

console.log(
  JSON.stringify(
    {
      scannedFiles: files.length,
      changedFiles,
      responseMessages: messages.size,
      responseFile: path.relative(process.cwd(), responseFile),
    },
    null,
    2
  )
);
