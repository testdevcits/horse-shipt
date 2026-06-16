const mongoose = require("mongoose");

let isConnected = false; // to prevent multiple connections in serverless

const ensureQuoteIndexes = async (connection) => {
  const collection = connection.db.collection("shipmentquotes");
  const activeQuoteIndexName = "shipment_1_shipper_1_active";

  try {
    const indexes = await collection.indexes();
    const oldQuoteIndex = indexes.find(
      (index) =>
        index.key?.shipment === 1 &&
        index.key?.shipper === 1 &&
        !index.partialFilterExpression
    );

    if (oldQuoteIndex) {
      await collection.dropIndex(oldQuoteIndex.name);
    }

    await collection.createIndex(
      { shipment: 1, shipper: 1 },
      {
        name: activeQuoteIndexName,
        unique: true,
        partialFilterExpression: { isActive: true },
      }
    );
  } catch (error) {
    if (error.codeName !== "NamespaceNotFound") {
      console.error(`Shipment quote index migration error: ${error.message}`);
    }
  }
};

const connectDB = async () => {
  if (isConnected) {
    return;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    isConnected = true;
    await ensureQuoteIndexes(conn.connection);
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1); // Exit process with failure
  }
};

module.exports = connectDB;
