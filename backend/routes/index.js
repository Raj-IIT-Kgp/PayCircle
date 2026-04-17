// backend/user/index.js
const express = require('express');
const userRouter = require("./user");
const accountRouter = require("./account");
const messageRouter = require("./message");
const aiRouter = require("./ai");

const router = express.Router();

router.use("/user", userRouter);
router.use("/account", accountRouter);
router.use("/message", messageRouter);
router.use("/ai", aiRouter);

module.exports = router;