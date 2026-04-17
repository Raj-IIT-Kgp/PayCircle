const express = require('express');
const router = express.Router();
const zod = require("zod");
const prisma = require("../db");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config");
const { authMiddleware } = require("../middleware");
const { getOnlineUserIds } = require('../websocket');
const twilio = require("twilio");

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// In-memory OTP store: { [phone]: { otp, expires } }
const otpStore = {};

async function sendOtp(phone) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[phone] = { otp, expires: Date.now() + 5 * 60 * 1000 };
    await twilioClient.messages.create({
        body: `Your PayCircle OTP is: ${otp}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone
    });
    return otp;
}

// ─── Signup: Step 1 — request OTP ───────────────────────────────────────────

router.post("/signup/request-otp", async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone number is required" });

    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) return res.status(409).json({ message: "Phone number already registered" });

    try {
        await sendOtp(phone);
        res.json({ message: "OTP sent to your phone" });
    } catch (err) {
        console.error("Twilio error:", err.message);
        res.status(500).json({ message: "Failed to send OTP", error: err.message });
    }
});

// ─── Signup: Step 2 — verify OTP and create account ─────────────────────────

const signupBody = zod.object({
    phone: zod.string().min(10),
    otp: zod.string().length(6),
    firstName: zod.string().min(1),
    lastName: zod.string().min(1),
    password: zod.string().min(1),
    email: zod.string().email().optional().or(zod.literal(""))
});

router.post("/signup", async (req, res) => {
    console.log("Signup request received:", req.body);
    try {
        const { success, error: zodError } = signupBody.safeParse(req.body);
        if (!success) {
            console.log("Zod validation failed:", zodError);
            return res.status(400).json({ message: "Incorrect inputs", details: zodError.errors });
        }

        const { phone, otp, firstName, lastName, password, email } = req.body;

        // Verify OTP
        const record = otpStore[phone];
        if (!record || record.otp !== otp || Date.now() > record.expires) {
            return res.status(401).json({ message: "Invalid or expired OTP" });
        }
        delete otpStore[phone];

        const existing = await prisma.user.findUnique({ where: { phone } });
        if (existing) return res.status(409).json({ message: "Phone number already registered" });

        const user = await prisma.user.create({
            data: {
                phone,
                password,
                firstName,
                lastName,
                email: email || null,
            }
        });

        await prisma.account.create({
            data: {
                userId: user.id,
                balance: (1 + Math.random() * 10000).toFixed(2)
            }
        });

        const token = jwt.sign({ userId: user.id }, JWT_SECRET);
        console.log("Signup successful for user:", user.phone);
        res.json({ message: "User created successfully", token });
    } catch (error) {
        console.error("Signup error details:", error);
        res.status(500).json({ message: "Internal server error during signup", error: error.message });
    }
});

// ─── Signin: password ────────────────────────────────────────────────────────

const signinBody = zod.object({
    phone: zod.string().min(10),
    password: zod.string().min(1)
});

router.post("/signin", async (req, res) => {
    try {
        const { success } = signinBody.safeParse(req.body);
        if (!success) return res.status(400).json({ message: "Incorrect inputs" });

        const user = await prisma.user.findFirst({
            where: { phone: req.body.phone, password: req.body.password }
        });

        if (user) {
            const token = jwt.sign({ userId: user.id }, JWT_SECRET);
            res.json({ message: "Logged in successfully", token });
        } else {
            res.status(401).json({ message: "Incorrect phone number or password" });
        }
    } catch (e) {
        res.status(500).json({ message: "Error while logging in" });
    }
});

// ─── Signin: OTP — Step 1 ────────────────────────────────────────────────────

router.post("/signin/request-otp", async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone number is required" });

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) return res.status(404).json({ message: "No account found with this phone number" });

    try {
        await sendOtp(phone);
        res.json({ message: "OTP sent to your phone" });
    } catch (err) {
        console.error("Twilio error:", err.message);
        res.status(500).json({ message: "Failed to send OTP", error: err.message });
    }
});

// ─── Signin: OTP — Step 2 ────────────────────────────────────────────────────

router.post("/signin/verify-otp", async (req, res) => {
    const { phone, otp } = req.body;
    const record = otpStore[phone];
    if (!record || record.otp !== otp || Date.now() > record.expires) {
        return res.status(401).json({ message: "Invalid or expired OTP" });
    }

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) return res.status(404).json({ message: "User not found" });

    delete otpStore[phone];
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    res.json({ message: "Logged in with OTP", token });
});

// ─── Update user ─────────────────────────────────────────────────────────────

const updateBody = zod.object({
    password: zod.string().optional(),
    firstName: zod.string().optional(),
    lastName: zod.string().optional(),
});

router.put("/update", authMiddleware, async (req, res) => {
    const { success } = updateBody.safeParse(req.body);
    if (!success) return res.status(400).json({ message: "Error while updating information" });

    const data = {};
    if (req.body.password !== undefined) data.password = req.body.password;
    if (req.body.firstName !== undefined) data.firstName = req.body.firstName;
    if (req.body.lastName !== undefined) data.lastName = req.body.lastName;

    await prisma.user.update({ where: { id: req.userId }, data });
    res.json({ message: "Updated successfully" });
});

// ─── Get current user info ───────────────────────────────────────────────────

router.get("/info", authMiddleware, async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { id: true, phone: true, firstName: true, lastName: true, profileImage: true, lastSeen: true }
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({
        user: { _id: user.id, phone: user.phone, firstName: user.firstName, lastName: user.lastName, profileImage: user.profileImage, lastSeen: user.lastSeen }
    });
});

// ─── Search users ─────────────────────────────────────────────────────────────

router.get("/bulk", authMiddleware, async (req, res) => {
    const filter = req.query.filter || "";

    const users = await prisma.user.findMany({
        where: {
            id: { not: req.userId },
            OR: [
                { firstName: { contains: filter, mode: 'insensitive' } },
                { lastName: { contains: filter, mode: 'insensitive' } },
                { phone: { contains: filter } }
            ]
        },
        select: { id: true, phone: true, firstName: true, lastName: true, profileImage: true, lastSeen: true }
    });

    res.json({
        users: users.map(u => ({ _id: u.id, phone: u.phone, firstName: u.firstName, lastName: u.lastName, profileImage: u.profileImage, lastSeen: u.lastSeen }))
    });
});

// ─── Currently online users ───────────────────────────────────────────────────
router.get("/online", authMiddleware, (req, res) => {
    res.json({ userIds: getOnlineUserIds() });
});

// ─── E2E public key: upload own ───────────────────────────────────────────────
router.post("/keys", authMiddleware, async (req, res) => {
    const { publicKey } = req.body;
    if (!publicKey || typeof publicKey !== 'string') {
        return res.status(400).json({ message: "publicKey required" });
    }
    await prisma.user.update({ where: { id: req.userId }, data: { publicKey } });
    res.json({ message: "Public key stored" });
});

// ─── E2E public key: fetch another user's ────────────────────────────────────
router.get("/keys/:userId", authMiddleware, async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.params.userId },
        select: { publicKey: true }
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ publicKey: user.publicKey || null });
});

module.exports = router;
