const multer = require("multer");
const path = require("path");
const fs = require("fs");

// -------------------------
// Upload folder path
// -------------------------
const uploadPath = path.join(__dirname, "../../uploads/profilePictures");

// Ensure folder exists
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
  console.log("✅ Upload folder created at:", uploadPath);
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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

module.exports = upload;
