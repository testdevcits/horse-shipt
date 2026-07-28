const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const PrivacyPolicy = require("../models/admin/PrivacyPolicy");
const TermsCondition = require("../models/admin/TermsCondition");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const DEFAULT_PRIVACY_PATH =
  "/home/user/.codex/attachments/16ad4c5e-17ce-44df-bf9d-d17a6aa77a0a/pasted-text.txt";
const DEFAULT_TERMS_PATH =
  "/home/user/.codex/attachments/56ad85d2-a4ce-4591-ba86-27ca7b72d5a8/pasted-text.txt";

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const isMainHeading = (line) => /^[A-Z][A-Z\s&,.'’-]+$/.test(line);
const isNumberedHeading = (line) => /^\d+\.\s+\S/.test(line);
const isSubheading = (line) => /^\d+\.\d+\.?\s+\S/.test(line);
const isListItem = (line) => /^[•(][a-zA-Z0-9]/.test(line);

const normalizeLine = (line) =>
  line
    .replace(/\u00a0/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const flushParagraph = (paragraph, html) => {
  if (paragraph.length) {
    html.push(`<p>${escapeHtml(paragraph.join(" "))}</p>`);
    paragraph.length = 0;
  }
};

const convertTextToHtml = (rawText) => {
  const lines = rawText.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  const html = [];
  const paragraph = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
  };

  lines.forEach((line, index) => {
    if (isListItem(line)) {
      flushParagraph(paragraph, html);
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(
        `<li>${escapeHtml(line.replace(/^(•|\(([a-zA-Z0-9])\))\s*/, ""))}</li>`
      );
      return;
    }

    closeList();

    if (index === 0 || isMainHeading(line)) {
      flushParagraph(paragraph, html);
      html.push(index === 0 ? `<h1>${escapeHtml(line)}</h1>` : `<h2>${escapeHtml(line)}</h2>`);
      return;
    }

    if (/^(Effective Date|Last Updated|Email|Mail|Website|Mailing Address):/.test(line)) {
      flushParagraph(paragraph, html);
      html.push(`<p><strong>${escapeHtml(line)}</strong></p>`);
      return;
    }

    if (isSubheading(line)) {
      flushParagraph(paragraph, html);
      html.push(`<h3>${escapeHtml(line)}</h3>`);
      return;
    }

    if (isNumberedHeading(line)) {
      flushParagraph(paragraph, html);
      html.push(`<h2>${escapeHtml(line)}</h2>`);
      return;
    }

    paragraph.push(line);
  });

  flushParagraph(paragraph, html);
  closeList();

  return html.join("\n");
};

const readRequiredFile = (filePath, label) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} file not found: ${filePath}`);
  }

  return fs.readFileSync(filePath, "utf8");
};

const upsertActiveLegalDocument = async (Model, title, content) => {
  await Model.updateMany({}, { $set: { isActive: false } });

  return Model.findOneAndUpdate(
    { title },
    { $set: { title, content, isActive: true } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

const main = async () => {
  const privacyPath = process.env.LEGAL_PRIVACY_FILE || process.argv[2] || DEFAULT_PRIVACY_PATH;
  const termsPath = process.env.LEGAL_TERMS_FILE || process.argv[3] || DEFAULT_TERMS_PATH;

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required in horse-shipt/.env");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const privacyContent = convertTextToHtml(
    readRequiredFile(privacyPath, "Privacy policy")
  );
  const termsContent = convertTextToHtml(
    readRequiredFile(termsPath, "Terms and conditions")
  );

  const privacy = await upsertActiveLegalDocument(
    PrivacyPolicy,
    "Privacy Policy",
    privacyContent
  );
  const terms = await upsertActiveLegalDocument(
    TermsCondition,
    "Terms & Conditions",
    termsContent
  );

  console.log(
    JSON.stringify(
      {
        success: true,
        privacyPolicyId: privacy._id,
        termsConditionId: terms._id,
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
