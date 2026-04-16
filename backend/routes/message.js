const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware');
const prisma = require('../db');
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { broadcastToUser } = require('../websocket');

router.post('/send', authMiddleware, async (req, res) => {
    const { to, content } = req.body;
    if (!to || !content) {
        return res.status(400).json({ message: 'Recipient and content required' });
    }

    const msg = await prisma.message.create({
        data: { fromUserId: req.userId, toUserId: to, content }
    });

    const response = {
        message: 'Message sent',
        msg: { _id: msg.id, from: msg.fromUserId, to: msg.toUserId, content: msg.content, timestamp: msg.timestamp, read: msg.read }
    };

    // Broadcast to recipient
    broadcastToUser(to, response.msg);
    // Broadcast back to sender (for multi-tab sync)
    broadcastToUser(req.userId, response.msg);

    res.json(response);
});

router.get('/history/:userId', authMiddleware, async (req, res) => {
    const otherUserId = req.params.userId;
    const userId = req.userId;

    try {
        const messages = await prisma.message.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { fromUserId: userId, toUserId: otherUserId },
                            { fromUserId: otherUserId, toUserId: userId }
                        ]
                    },
                    {
                        // Show if deleted-for-everyone (always visible as placeholder),
                        // OR if this user hasn't deleted it for themselves
                        OR: [
                            { isDeleted: true },
                            { NOT: { deletedFor: { has: userId } } }
                        ]
                    }
                ]
            },
            orderBy: { timestamp: 'asc' }
        });

        res.json({
            messages: messages.map(m => ({
                _id: m.id, from: m.fromUserId, to: m.toUserId,
                content: m.isDeleted ? "🚫 This message was deleted" : m.content,
                fileUrl: m.isDeleted ? "" : m.fileUrl,
                fileName: m.isDeleted ? "" : m.fileName,
                isDeleted: m.isDeleted,
                reactions: m.isDeleted ? {} : m.reactions, // Hide reactions if deleted
                timestamp: m.timestamp, read: m.read
            }))
        });
    } catch (error) {
        console.error("Error fetching history:", error);
        res.status(500).json({ message: "Error fetching history" });
    }
});

router.get('/conversations', authMiddleware, async (req, res) => {
    const userId = req.userId;

    try {
        // Fetch all unique user IDs that have sent messages to me or received messages from me
        const sentTo = await prisma.message.findMany({
            where: { fromUserId: userId },
            select: { toUserId: true },
            distinct: ['toUserId']
        });

        const receivedFrom = await prisma.message.findMany({
            where: { toUserId: userId },
            select: { fromUserId: true },
            distinct: ['fromUserId']
        });

        const otherUserIds = [...new Set([
            ...sentTo.map(m => m.toUserId),
            ...receivedFrom.map(m => m.fromUserId)
        ])];

        res.json({ users: otherUserIds });
    } catch (error) {
        console.error("Error fetching conversations:", error);
        res.status(500).json({ message: "Error fetching conversations" });
    }
});

router.post('/read', authMiddleware, async (req, res) => {
    const { from } = req.body;
    await prisma.message.updateMany({
        where: { fromUserId: from, toUserId: req.userId, read: false },
        data: { read: true }
    });
    res.json({ message: 'Messages marked as read' });
});

const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

router.post("/send-file", authMiddleware, upload.single("file"), async (req, res) => {
    const { to } = req.body;
    if (!to || !req.file) {
        return res.status(400).json({ message: "Recipient and file required" });
    }

    const msg = await prisma.message.create({
        data: {
            fromUserId: req.userId,
            toUserId: to,
            fileUrl: `/uploads/${req.file.filename}`,
            fileName: req.file.originalname
        }
    });

    const response = {
        message: "File sent",
        msg: { _id: msg.id, from: msg.fromUserId, to: msg.toUserId, fileUrl: msg.fileUrl, fileName: msg.fileName, timestamp: msg.timestamp, read: false }
    };

    // Broadcast to recipient
    broadcastToUser(to, response.msg);
    // Broadcast back to sender
    broadcastToUser(req.userId, response.msg);

    res.json(response);
});

router.post("/reaction", authMiddleware, async (req, res) => {
    const { messageId, emoji } = req.body;
    if (!messageId || !emoji) return res.status(400).json({ message: "Message ID and emoji required" });

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.isDeleted) return res.status(404).json({ message: "Message not found or deleted" });

    const reactions = message.reactions || {};
    reactions[req.userId] = emoji; // Add or update user's reaction

    const updated = await prisma.message.update({
        where: { id: messageId },
        data: { reactions }
    });

    const updateEvent = {
        type: "reaction_update",
        messageId,
        reactions: updated.reactions,
        to: updated.fromUserId === req.userId ? updated.toUserId : updated.fromUserId
    };

    // Broadcast to the other person in the chat
    broadcastToUser(updateEvent.to, updateEvent);

    res.json({ message: "Reaction updated", reactions: updated.reactions });
});

router.post('/delete', authMiddleware, async (req, res) => {
    const { messageId, everyone } = req.body;
    const userId = req.userId;

    try {
        const message = await prisma.message.findUnique({ where: { id: messageId } });
        if (!message) return res.status(404).json({ message: "Message not found" });

        if (everyone) {
            // Can only delete for everyone if I sent it
            if (message.fromUserId !== userId) {
                return res.status(403).json({ message: "You can only delete your own messages for everyone" });
            }
            await prisma.message.update({
                where: { id: messageId },
                data: { isDeleted: true }
            });

            const targetUser = message.fromUserId === userId ? message.toUserId : message.fromUserId;
            // Broadcast to the recipient
            broadcastToUser(targetUser, { type: "message_deleted", messageId, everyone: true });
            // Broadcast back to sender (for multi-tab sync)
            broadcastToUser(userId, { type: "message_deleted", messageId, everyone: true });
        } else {
            // Delete for me only
            await prisma.message.update({
                where: { id: messageId },
                data: { 
                    deletedFor: { push: userId } 
                }
            });
            // Update the sender's own UI across tabs
            broadcastToUser(userId, { type: "message_deleted", messageId, everyone: false });
        }

        res.json({ message: "Message deleted" });
    } catch (error) {
        console.error("Delete error:", error);
        res.status(500).json({ message: "Error deleting message" });
    }
});

module.exports = router;
