const multer = require("multer");
const path = require("path");
const fs = require("fs");

// -------------------------
// Set upload folder (Local only)
// -------------------------
const uploadFolder = path.join(__dirname, "../uploads/profilePictures");

// Ensure folder exists
if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder, { recursive: true });
  console.log("✅ Upload folder created:", uploadFolder);
}

// -------------------------
// Multer storage configuration
// -------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadFolder);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${Date.now()}-${file.fieldname}${ext}`;
    cb(null, filename);
  },
});

// -------------------------
// File filter: only allow images
// -------------------------
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif/;
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.test(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"));
  }
};

// -------------------------
// Export multer instance
// -------------------------
module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});
