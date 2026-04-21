// =========================
// server.js
// =========================

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const passport = require("passport");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");

const connectDB = require("./config/db");

// -------------------------
// Load Environment Variables
// -------------------------
dotenv.config({ path: ".env" });

// -------------------------
// Connect MongoDB
// -------------------------
connectDB();

// -------------------------
// Initialize App
// -------------------------
const app = express();

// -------------------------
// Disable ETag (FIX 304 ISSUE)
// -------------------------
app.disable("etag");

// -------------------------
// Prevent API Caching (IMPORTANT)
// -------------------------
app.use((req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

// -------------------------
// Allowed Origins
// -------------------------
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://admin-horse-shipt.vercel.app",
  "https://horse-shipt-frontend.vercel.app",
];

// -------------------------
// CORS Configuration
// -------------------------
// ==========================
// FORCE CORS HEADERS
// ==========================
app.use((req, res, next) => {
  const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://horse-shipt-frontend.vercel.app",
    "https://admin-horse-shipt.vercel.app",
  ];

  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,PATCH,OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// -------------------------
// Body Parsers
// -------------------------
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// -------------------------
// Session Middleware
// -------------------------
app.use(
  session({
    name: "horse-shipt.sid",
    secret: process.env.SESSION_SECRET || "horse-shipt-secret",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  })
);

// -------------------------
// Passport
// -------------------------
app.use(passport.initialize());
app.use(passport.session());
require("./config/passport");

// -------------------------
// Upload Directory (Vercel Safe)
// -------------------------
let uploadPath;

if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
  uploadPath = path.join("/tmp", "uploads/profilePictures");
} else {
  uploadPath = path.join(__dirname, "uploads/profilePictures");
}

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

console.log("Upload Path:", uploadPath);

app.use("/uploads/profilePictures", express.static(uploadPath));
app.use("/assets", express.static(path.join(__dirname, "assets")));

// -------------------------
// Routes
// -------------------------
const authRoutes = require("./routes/authRoutes");
const customerRoutes = require("./routes/customer/customerRoutes");
const shipperRoutes = require("./routes/shipper/shipperRoutes");
const shipmentQuestionRoutes = require("./routes/common/shipmentQuestion.routes");

const shipmentTrackingRoutes = require("./routes/common/shipmentTracking.routes");

const adminRoutes = require("./routes/admin/admin.routes");
const adminBreedRoutes = require("./routes/admin/breed.routes");
const adminShipperRoutes = require("./routes/admin/adminShipper.routes");
const adminVehicleRoutes = require("./routes/admin/adminVehicleRoutes");
const adminPlatformSettingsRoutes = require("./routes/admin/Payments/admin.platformSettingsRoutes");
const adminPaymentsRoutes = require("./routes/admin/Payments/adminPaymentsRoutes");
const stripeAdminRoutes = require("./routes/admin/Payments/stripeAdminRoutes");
const privacyPolicyRoutes = require("./routes/admin/privacyPolicy.routes");
const termsConditionRoutes = require("./routes/admin/termsCondition.routes");

const horseShippingNewsletterRoutes = require("./routes/horseShippingNewsletterRoutes");

// Public / App APIs
app.use("/api/auth", authRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/shipper", shipperRoutes);
app.use("/api/driver", shipperRoutes);
app.use("/api/questions", shipmentQuestionRoutes);

app.use("/api/tracking", shipmentTrackingRoutes);

// Admin APIs
app.use("/api/admin", adminRoutes);
app.use("/api/admin/breeds", adminBreedRoutes);
app.use("/api/admin/shippers", adminShipperRoutes);
app.use("/api/admin/vehicles", adminVehicleRoutes);
app.use("/api/admin/platform-settings", adminPlatformSettingsRoutes);
app.use("/api/admin/payments", adminPaymentsRoutes);
app.use("/api/admin/stripe", stripeAdminRoutes);
app.use("/api/admin/privacy-policy", privacyPolicyRoutes);
app.use("/api/admin/terms-condition", termsConditionRoutes);
app.use("/api/admin/horse-newsletter", horseShippingNewsletterRoutes);

app.use("/api/horse-newsletter", horseShippingNewsletterRoutes);

// -------------------------
// Health Check
// -------------------------
app.get("/", (req, res) => {
  res.status(200).send("🐎 Horse Shipt Backend API is running...");
});

// ================================
// Stripe Webhook (IMPORTANT)
// Must be before 404 handler
// ================================

const stripeController = require("./controllers/shipper/shipperStripeController");

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeController.stripeWebhook
);
// -------------------------
// 404 Handler
// -------------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// -------------------------
// Global Error Handler
// -------------------------
app.use((err, req, res, next) => {
  console.error("Global Error:", err.message);

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// =================================================
// HTTP SERVER + SOCKET.IO
// =================================================
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT"],
  },
  transports: ["websocket", "polling"],
  path: "/socket.io",
});

// Make io accessible
app.set("io", io);

// Attach socket logic
require("./sockets/chatSocket")(io);

// Debug socket connections
io.on("connection", (socket) => {
  console.log("Socket Connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Socket Disconnected:", socket.id);
  });
});

// -------------------------
// Start Server
// -------------------------
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(
    `Server running in ${
      process.env.NODE_ENV || "development"
    } mode on port ${PORT}`
  );
});

module.exports = app;
