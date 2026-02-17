// server.js
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
// Load environment variables
// -------------------------
dotenv.config({ path: ".env" });

// -------------------------
// Connect to MongoDB
// -------------------------
connectDB();

// -------------------------
// Initialize Express App
// -------------------------
const app = express();

// =================================================
// DYNAMIC CORS CONFIG (BEST & SAFE)
// =================================================

app.use((req, res, next) => {
  const origin = req.headers.origin;

  const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://admin-horse-shipt.vercel.app",
    "https://horse-shipt-frontend.vercel.app",
    "https://horse-shipt.vercel.app",
  ];

  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

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
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

// -------------------------
// Passport Initialization
// -------------------------
app.use(passport.initialize());
app.use(passport.session());
require("./config/passport");

// -------------------------
// Upload Directory Setup
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

console.log("Upload directory ready:", uploadPath);

app.use("/uploads/profilePictures", express.static(uploadPath));
app.use("/assets", express.static(path.join(__dirname, "assets")));

// -------------------------
// API Routes
// -------------------------
const authRoutes = require("./routes/authRoutes");
const customerRoutes = require("./routes/customer/customerRoutes");
const shipperRoutes = require("./routes/shipper/shipperRoutes");
const shipmentQuestionRoutes = require("./routes/common/shipmentQuestion.routes");

const adminRoutes = require("./routes/admin/admin.routes");
const adminBreedRoutes = require("./routes/admin/breed.routes");
const adminShipperRoutes = require("./routes/admin/adminShipper.routes");

app.use("/api/auth", authRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/shipper", shipperRoutes);
app.use("/api/driver", shipperRoutes);
app.use("/api/questions", shipmentQuestionRoutes);

app.use("/api/admin", adminRoutes);
app.use("/api/admin/breeds", adminBreedRoutes);
app.use("/api/admin/shippers", adminShipperRoutes);

// -------------------------
// Default Route
// -------------------------
app.get("/", (req, res) => {
  res.send("🐎 Horse Shipt Backend API is running...");
});

// -------------------------
// 404 Handler
// -------------------------
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
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
    origin: true,
    credentials: true,
  },
});

app.set("io", io);

require("./sockets/chatSocket")(io);

io.on("connection", (socket) => {
  console.log("🔹 New Socket Connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("🔹 Socket Disconnected:", socket.id);
  });
});

// -------------------------
// Start Server
// -------------------------
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(
    `🐎 Server running in ${
      process.env.NODE_ENV || "development"
    } mode on port ${PORT}`
  );
});

module.exports = app;
