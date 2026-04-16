const express = require('express');
const cors = require("cors");
const http = require('http');
const WebSocket = require('ws');
const prisma = require('./db');
const rootRouter = require("./routes/index");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("./config");

const app = express();
const server = http.createServer(app);

// Request logging middleware (MOVE TO TOP)
app.use((req, res, next) => {
    try {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Body: ${JSON.stringify(req.body || {})}`);
    } catch (e) {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - (Log error: ${e.message})`);
    }
    next();
});

app.use(cors());
app.use(express.json());

app.use("/api/v1", rootRouter);
app.use("/uploads", express.static(require("path").join(__dirname, "uploads")));

app.get('/', (req, res) => {
    res.send('Server is running! [SESSION_CODE: PAYCIRCLE_V2]');
});

const { initWebSocket } = require("./websocket");
initWebSocket(server);

// Explicitly bind to 0.0.0.0 for Docker
server.listen(3000, "0.0.0.0", () => {
    console.log("🚀 Server running on http://0.0.0.0:3000");
    console.log("🔌 WebSocket available at ws://0.0.0.0:3000/ws");
});

server.on('error', (error) => {
    console.error('🚫 Server error:', error);
    if (error.code === 'EADDRINUSE') {
        console.error('Port 3000 is already in use!');
    }
});

process.on('SIGTERM', async () => {
    await prisma.$disconnect();
    server.close();
});

// Prevent unhandled promise rejections from crashing the process
process.on('unhandledRejection', (reason) => {
    console.error('🚫 Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('🚫 Uncaught exception:', err);
});
