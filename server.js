// server.js

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const passport = require("passport");
const connectDB = require("./config/db");
const fs = require("fs");

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
// CORS Configuration
// -------------------------
const allowedOrigins = [
  "http://localhost:3000", // local dev
  "https://horse-shipt.vercel.app", // production frontend
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin like Postman or curl
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("CORS policy: Origin not allowed"));
      }
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
// Session Middleware
// -------------------------
app.use(
  session({
    secret: process.env.SESSION_SECRET || "mysecretkey",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === "production", // HTTPS only in prod
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  })
);

// -------------------------
// Passport Initialization
// -------------------------
app.use(passport.initialize());
app.use(passport.session());

// -------------------------
// API Routes
// -------------------------
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

// -------------------------
// Serve React frontend (production mode)
// -------------------------
const frontendBuildPath = path.join(__dirname, "build");

if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));

  // Send index.html for all non-API routes
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(frontendBuildPath, "index.html"));
  });
} else {
  console.warn(
    "⚠️  React build folder not found! Make sure 'build' exists inside backend."
  );
}

// -------------------------
// Default Route
// -------------------------
app.get("/api", (req, res) => {
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
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
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
