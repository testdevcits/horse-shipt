const mongoose = require("mongoose");
const startBackupWatcher = require("../utils/backupWatcher");

let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    console.log("MongoDB already connected 🐎");
    return;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    isConnected = true;

    console.log(`MongoDB Connected: ${conn.connection.host} 🐎`);

    startBackupWatcher();
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
