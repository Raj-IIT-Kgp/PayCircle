const express = require('express');
const { authMiddleware } = require('../middleware');
const prisma = require('../db');

const router = express.Router();

router.get("/balance", authMiddleware, async (req, res) => {
    const account = await prisma.account.findUnique({ where: { userId: req.userId } });
    if (!account) return res.status(404).json({ message: "Account not found" });
    res.json({ balance: account.balance });
});

router.post("/transfer", authMiddleware, async (req, res) => {
    const { amount, to } = req.body;

    if (amount < 0) {
        return res.status(400).json({ message: "abe ma**chod kar kya raha hai" });
    }

    try {
        await prisma.$transaction(async (tx) => {
            const fromAccount = await tx.account.findUnique({ where: { userId: req.userId } });

            if (!fromAccount || Number(fromAccount.balance) < amount) {
                throw Object.assign(new Error("Insufficient balance"), { status: 400 });
            }

            const toAccount = await tx.account.findUnique({ where: { userId: to } });
            if (!toAccount) {
                throw Object.assign(new Error("Invalid account"), { status: 400 });
            }

            await tx.account.update({
                where: { userId: req.userId },
                data: { balance: { decrement: amount } }
            });
            await tx.account.update({
                where: { userId: to },
                data: { balance: { increment: amount } }
            });

            const [fromUser, toUser] = await Promise.all([
                tx.user.findUnique({ where: { id: req.userId } }),
                tx.user.findUnique({ where: { id: to } })
            ]);

            await tx.transfer.create({
                data: {
                    fromUserId: req.userId,
                    toUserId: to,
                    fromFullName: `${fromUser.firstName} ${fromUser.lastName}`,
                    toFullName: `${toUser.firstName} ${toUser.lastName}`,
                    amount
                }
            });
        }, { isolationLevel: 'Serializable' });

        res.json({ message: "Transfer successful" });
    } catch (err) {
        const status = err.status || 500;
        res.status(status).json({ message: err.message || "Transfer failed" });
    }
});

router.get("/transactions", authMiddleware, async (req, res) => {
    // Delete transfers older than 7 days
    await prisma.transfer.deleteMany({
        where: { date: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
    });

    const transfers = await prisma.transfer.findMany({
        where: {
            OR: [{ fromUserId: req.userId }, { toUserId: req.userId }]
        },
        orderBy: { date: 'desc' },
        select: { fromFullName: true, toFullName: true, amount: true, date: true }
    });

    res.json(transfers);
});

module.exports = router;
