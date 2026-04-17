const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const { authMiddleware } = require('../middleware');
const prisma = require('../db');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are PayCircle AI — a smart financial assistant built into a chat and payments app.
You help users manage their money and understand their conversations.

You can:
- Check the user's balance
- Send money to the person they are currently chatting with
- Show recent transaction history
- Summarize the current chat conversation

Rules:
- Always confirm payment amounts before sending (ask "Send ₹X to [name]?" and wait for explicit confirmation like "yes" or "confirm")
- If asked to pay without confirmation, use send_payment only if the user's message clearly says "yes", "confirm", "send", "pay" along with an amount
- Be concise and friendly
- Format rupees as ₹X (e.g. ₹500)
- If you don't know something, say so honestly`;

const tools = [
    {
        type: "function",
        function: {
            name: "get_balance",
            description: "Get the current user's account balance in rupees",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: "send_payment",
            description: "Send money from the current user to the person they are chatting with. Only call this after the user has confirmed they want to send.",
            parameters: {
                type: "object",
                properties: {
                    amount: { type: "number", description: "Amount in rupees to send" },
                    note: { type: "string", description: "Optional note for the payment" }
                },
                required: ["amount"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_recent_transactions",
            description: "Get the user's last 10 transactions (sent and received)",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: "summarize_conversation",
            description: "Summarize the current chat conversation to highlight key points, decisions, or payment mentions",
            parameters: { type: "object", properties: {} }
        }
    }
];

// Execute a tool call and return the result
async function executeTool(name, args, context) {
    const { userId, recipientId, chatHistory } = context;

    if (name === "get_balance") {
        const account = await prisma.account.findUnique({ where: { userId } });
        return { balance: Number(account?.balance || 0).toFixed(2) };
    }

    if (name === "send_payment") {
        const { amount, note } = args;
        if (!recipientId) return { error: "No recipient — user is not in a chat" };
        if (!amount || amount <= 0) return { error: "Invalid amount" };

        // Run the actual transfer in a DB transaction
        try {
            await prisma.$transaction(async (tx) => {
                const from = await tx.account.findUnique({ where: { userId } });
                if (!from || Number(from.balance) < amount) throw new Error("Insufficient balance");

                const to = await tx.account.findUnique({ where: { userId: recipientId } });
                if (!to) throw new Error("Recipient account not found");

                await tx.account.update({ where: { userId }, data: { balance: { decrement: amount } } });
                await tx.account.update({ where: { userId: recipientId }, data: { balance: { increment: amount } } });

                const [fromUser, toUser] = await Promise.all([
                    tx.user.findUnique({ where: { id: userId } }),
                    tx.user.findUnique({ where: { id: recipientId } })
                ]);

                await tx.transfer.create({
                    data: {
                        fromUserId: userId,
                        toUserId: recipientId,
                        fromFullName: `${fromUser.firstName} ${fromUser.lastName}`,
                        toFullName: `${toUser.firstName} ${toUser.lastName}`,
                        amount
                    }
                });
            }, { isolationLevel: 'Serializable' });

            return { success: true, amount, note: note || "", recipientId };
        } catch (err) {
            return { error: err.message };
        }
    }

    if (name === "get_recent_transactions") {
        const transfers = await prisma.transfer.findMany({
            where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
            orderBy: { date: 'desc' },
            take: 10,
            select: { fromFullName: true, toFullName: true, amount: true, date: true, fromUserId: true }
        });
        return {
            transactions: transfers.map(t => ({
                direction: t.fromUserId === userId ? "sent" : "received",
                counterparty: t.fromUserId === userId ? t.toFullName : t.fromFullName,
                amount: Number(t.amount).toFixed(2),
                date: t.date
            }))
        };
    }

    if (name === "summarize_conversation") {
        if (!chatHistory?.length) return { summary: "No conversation history available." };
        const snippet = chatHistory.slice(-30).map(m => `${m.role}: ${m.text}`).join("\n");
        return { conversation: snippet };
    }

    return { error: `Unknown tool: ${name}` };
}

// Agentic loop: keep calling Groq until it gives a final text response (no more tool calls)
async function runAgent(messages, context) {
    const MAX_ITERATIONS = 5;
    let iteration = 0;

    while (iteration < MAX_ITERATIONS) {
        iteration++;
        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages,
            tools,
            tool_choice: "auto",
            max_tokens: 1024,
            temperature: 0.3,
        });

        const choice = response.choices[0];
        const assistantMsg = choice.message;
        messages.push(assistantMsg);

        // No tool calls — we have the final answer
        if (!assistantMsg.tool_calls?.length) {
            return { reply: assistantMsg.content, actions: [] };
        }

        // Execute all tool calls in parallel
        const toolResults = await Promise.all(
            assistantMsg.tool_calls.map(async (tc) => {
                const args = JSON.parse(tc.function.arguments || "{}");
                const result = await executeTool(tc.function.name, args, context);
                return { toolCall: tc, result };
            })
        );

        // Collect any payment actions to send back to the frontend
        const actions = toolResults
            .filter(r => r.toolCall.function.name === "send_payment" && r.result.success)
            .map(r => ({ type: "payment", amount: r.result.amount, recipientId: r.result.recipientId }));

        // Add tool results to messages
        for (const { toolCall, result } of toolResults) {
            messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
            });
        }

        // If there were payment actions, carry them to the final response
        if (actions.length) {
            const finalResponse = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages,
                max_tokens: 512,
                temperature: 0.3,
            });
            return {
                reply: finalResponse.choices[0].message.content,
                actions
            };
        }
    }

    return { reply: "I hit my iteration limit. Please try again.", actions: [] };
}

router.post("/chat", authMiddleware, async (req, res) => {
    const { message, chatHistory = [], recipientId } = req.body;
    if (!message) return res.status(400).json({ message: "Message required" });

    try {
        // Build message history for context
        const recentHistory = chatHistory.slice(-20).map(m => ({
            role: m.from === req.userId ? "user" : "assistant",
            content: m.content || ""
        })).filter(m => m.content && !m.content.startsWith("e2e:"));

        const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...recentHistory,
            { role: "user", content: message }
        ];

        const context = {
            userId: req.userId,
            recipientId,
            chatHistory: chatHistory.slice(-30).map(m => ({
                role: m.from === req.userId ? "You" : "Them",
                text: m.content || ""
            }))
        };

        const { reply, actions } = await runAgent(messages, context);

        res.json({ reply, actions });
    } catch (err) {
        console.error("AI agent error:", err);
        res.status(500).json({ message: "AI error: " + err.message });
    }
});

module.exports = router;
