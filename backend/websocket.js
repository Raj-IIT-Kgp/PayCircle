const WebSocket = require('ws');
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("./config");
const prisma = require("./db");

// Map to track userId -> Set of active WebSocket connections
const userSockets = new Map();

let wss = null;

function initWebSocket(server) {
    wss = new WebSocket.Server({ server, path: '/ws' });
    console.log('✅ WebSocket server initialized at /ws');

    // Ping all clients every 25 s so Nginx/Vite proxy (60 s default timeout)
    // never sees the connection as idle and kills it.
    // Also evicts zombie sockets that disconnected without sending a close frame.
    const pingInterval = setInterval(() => {
        wss.clients.forEach(client => {
            if (client.isAlive === false) {
                client.terminate(); // zombie — kill it; 'close' event fires and cleans up userSockets
                return;
            }
            client.isAlive = false;
            client.ping();
        });
    }, 25000);

    wss.on('close', () => clearInterval(pingInterval));

    wss.on('connection', (ws, req) => {
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const token = url.searchParams.get('token');
        let userId = null;

        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                userId = decoded.userId;
                
                if (!userSockets.has(userId)) {
                    userSockets.set(userId, new Set());
                }
                userSockets.get(userId).add(ws);
                
                console.log(`✅ User ${userId} connected via WebSocket (Sockets: ${userSockets.get(userId).size})`);

                // Update lastSeen and broadcast ONLINE status
                prisma.user.update({
                    where: { id: userId },
                    data: { lastSeen: new Date() }
                }).catch(e => console.error("Error updating user presence:", e));

                broadcastPresence(userId, "ONLINE");
            } catch (err) {
                console.error("🚫 Invalid WS token:", err.message);
                ws.close(4001, "Invalid token");
                return;
            }
        } else {
            console.warn("⚠️ Connection attempt without token");
            ws.close(4002, "Token required");
            return;
        }

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message.toString());
                // Only relay WebRTC signaling + receipts — chat messages are pushed
                // by the REST route (with a real DB _id) to avoid duplicates
                const signalingTypes = [
                    'read_receipt',
                    'call_offer', 'call_answer',
                    'ice_candidate',
                    'call_rejected', 'call_ended',
                    'typing', 'reaction_update', 'message_deleted'
                ];
                if (data.type && signalingTypes.includes(data.type) && data.to) {
                    broadcastToUser(data.to, { ...data, from: userId });
                }
            } catch (e) {
                console.error("🚫 WS Message error:", e.message);
            }
        });

        ws.on('close', () => {
            if (userId && userSockets.has(userId)) {
                const sockets = userSockets.get(userId);
                sockets.delete(ws);
                if (sockets.size === 0) {
                    userSockets.delete(userId);
                    // Broadcast OFFLINE status and update lastSeen
                    prisma.user.update({
                        where: { id: userId },
                        data: { lastSeen: new Date() }
                    }).catch(e => console.error("Error updating lastSeen:", e));

                    broadcastPresence(userId, "OFFLINE");
                }
                console.log(`❌ User ${userId} disconnected (Remaining: ${sockets.size || 0})`);
            }
        });

        ws.on('error', (error) => console.error(`🚫 WS error for user ${userId}:`, error.message));
    });

    return wss;
}

function broadcastPresence(userId, status) {
    if (!wss) return;
    const presenceMsg = JSON.stringify({
        type: "presence",
        userId,
        status, // "ONLINE" or "OFFLINE"
        lastSeen: new Date()
    });

    // Broadcast to ALL connected users for simplicity in this industry upgrade
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(presenceMsg);
        }
    });
}

function broadcastToUser(userId, data) {
    const sockets = userSockets.get(userId);
    if (!sockets) {
        console.log(`📡 No active sockets for user ${userId}`);
        return false;
    }

    let deliveredCount = 0;
    sockets.forEach(socket => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(data));
            deliveredCount++;
        }
    });

    console.log(`📡 Broadcasted to user ${userId} (${deliveredCount} sockets)`);
    return deliveredCount > 0;
}

function getOnlineUserIds() {
    return [...userSockets.keys()];
}

module.exports = {
    initWebSocket,
    broadcastToUser,
    getOnlineUserIds
};
