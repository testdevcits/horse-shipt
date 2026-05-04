const multer = require("multer");
const path = require("path");
const fs = require("fs");

// -------------------------
// Handle platform-safe upload path
// -------------------------
let uploadPath;

// Detect if running in a read-only environment (Vercel / AWS Lambda)
if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
  uploadPath = path.join("/tmp", "uploads/shipments");
} else {
  uploadPath = path.join(__dirname, "../../uploads/shipments");
}

// Ensure folder exists safely
try {
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }
} catch (err) {
  console.error("Error creating upload folder:", err.message);
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
// File filter (images + PDFs)
// -------------------------
const fileFilter = (req, file, cb) => {
  if (
    file.mimetype.startsWith("image/") || // images
    file.mimetype === "application/pdf" // PDFs
  ) {
    cb(null, true);
  } else {
    cb(new Error("Only images or PDFs allowed!"), false);
  }
};

// -------------------------
// Export multer instance
// -------------------------
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB for shipments
});

module.exports = upload;
