// server.js
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const path = require("path");
const connectDB = require("./config/db");

// -------------------------
// Load environment variables
// -------------------------
dotenv.config();

// -------------------------
// Connect to MongoDB
// -------------------------
connectDB();

// -------------------------
// Initialize Express App
// -------------------------
const app = express();

// -------------------------
// Detect environment (serverless or local)
// -------------------------
const isServerless = process.env.IS_SERVERLESS === "true";

// -------------------------
// CORS Configuration
// -------------------------
const allowedOrigins = [
  "http://localhost:3000", // local dev
  "https://horse-shipt-frontend.vercel.app", // frontend production
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow Postman / mobile
      if (allowedOrigins.indexOf(origin) !== -1) callback(null, true);
      else callback(new Error("CORS policy: Origin not allowed"));
    },
    credentials: true,
  })
);

// -------------------------
// Body Parser Middleware
// -------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -------------------------
// Session Middleware (needed for Passport Google OAuth)
// -------------------------
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // true if using HTTPS
  })
);

// -------------------------
// Initialize Passport
// -------------------------
app.use(passport.initialize());
app.use(passport.session());

// -------------------------
// Passport Strategy
// -------------------------
require("./config/passport"); // GoogleStrategy setup

// -------------------------
// Serve static profile images (local environment only)
// -------------------------
if (!isServerless) {
  const uploadPath = path.join(__dirname, "uploads/profilePictures");
  app.use("/uploads/profilePictures", express.static(uploadPath));
}

// -------------------------
// API Routes
// -------------------------
const authRoutes = require("./routes/authRoutes");
const customerRoutes = require("./routes/customer/customerRoutes");
const shipperRoutes = require("./routes/shipper/shipperRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/shipper", shipperRoutes);

// -------------------------
// Default Route
// -------------------------
app.get("/", (req, res) => {
  res.send("🐎 Horse Shipt Backend API is running...");
});

// -------------------------
// 404 - Not Found
// -------------------------
app.use((req, res, next) => {
  res.status(404).json({ message: "Route not found" });
});

// -------------------------
// Global Error Handler
// -------------------------
app.use((err, req, res, next) => {
  console.error("Global Error Handler:", err.stack);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// -------------------------
// Start Server
// -------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(
    `🐎 Server running in ${
      process.env.NODE_ENV || "development"
    } mode on port ${PORT}`
  );
});
