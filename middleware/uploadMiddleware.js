// middleware/uploadMiddleware.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Detect environment: serverless (Vercel/AWS Lambda) uses /tmp
const isServerless = process.env.IS_SERVERLESS === "true";

// Set upload folder
const uploadFolder = isServerless
  ? path.join("/tmp", "profilePictures")
  : path.join(__dirname, "../uploads/profilePictures");

// Ensure folder exists
if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadFolder),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${file.fieldname}${ext}`;
    cb(null, filename);
  },
});

// File filter for images only
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif/;
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedTypes.test(ext)) cb(null, true);
  else cb(new Error("Only image files are allowed"));
};

// Export multer instance
module.exports = multer({ storage, fileFilter });
