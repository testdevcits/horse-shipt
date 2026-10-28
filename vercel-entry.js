// Vercel Function entry point. server.js creates the shared Express and
// Socket.IO application while preserving its normal AWS/local startup path.
const app = require("./server");

module.exports = app.server;
