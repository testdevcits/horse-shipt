const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const startBackupWatcher = () => {
  const db = mongoose.connection;

  db.once("open", () => {
    console.log("Backup watcher started...");

    const changeStream = db.watch();

    changeStream.on("change", async (change) => {
      try {
        const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

        // Folder: backups/2026-03-25/
        const backupDir = path.join(__dirname, `../backups/${today}`);

        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }

        const collectionName = change.ns.coll;

        // File: users.json / shipments.json
        const filePath = path.join(backupDir, `${collectionName}.json`);

        const logData = {
          operation: change.operationType,
          collection: collectionName,
          time: new Date(),
          data: change.fullDocument || null,
          update: change.updateDescription || null,
          documentKey: change.documentKey,
        };

        // Append data
        fs.appendFileSync(filePath, JSON.stringify(logData) + ",\n");

        console.log(`Backup saved: ${collectionName}`);
      } catch (error) {
        console.error("Backup Error:", error.message);
      }
    });
  });
};

module.exports = startBackupWatcher;
