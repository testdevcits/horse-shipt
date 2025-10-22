const multer = require("multer");
const path = require("path");
const fs = require("fs");

// -------------------------
// Handle platform-safe upload path
// -------------------------
let uploadPath;

// 🧠 Detect if running in a read-only environment (Vercel / AWS Lambda)
if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
  uploadPath = path.join("/tmp", "uploads/profilePictures");
} else {
  uploadPath = path.join(__dirname, "../../uploads/profilePictures");
}

// ✅ Ensure folder exists safely
try {
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
    console.log("✅ Upload folder ready:", uploadPath);
  }
} catch (err) {
  console.error("❌ Error creating upload folder:", err.message);
}

// -------------------------
// Multer storage configuration
// -------------------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}-${Date.now()}${ext}`);
  },
});

// -------------------------
// File filter (images only)
// -------------------------
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only images allowed!"), false);
  }
};

// -------------------------
// Export multer instance
// -------------------------
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

module.exports = upload;
