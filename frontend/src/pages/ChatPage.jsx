import React, { useState, useEffect, useRef, useCallback } from "react";
import { useWebSocket } from "../context/WebSocketContext";
import { useCall } from "../context/CallContext";
import { useLocation, useNavigate } from "react-router-dom";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";
import {
    initE2ESessionKey,
    getCachedPrivateKey,
    encryptMessage,
    decryptMessage,
    encryptFileBytes,
    decryptFileBytes,
} from "../utils/e2eCrypto";

const API_URL = import.meta.env.VITE_REACT_APP_BACKEND_URL || "/api/v1";

const C = {
    primary:      "#10b981", // Emerald 500
    primaryDark:  "#059669", // Emerald 600
    myBubble:     "#dcfce7", // Emerald 100
    chatBg:       "#f0fdf4", // Emerald 50
    inputBar:     "#f8fafc", 
    selectedRow:  "#dcfce7", // Emerald 100
    tickGray:     "#9ca3af",
    tickBlue:     "#10b981", // Emerald 500
};

function useQuery() {
    return new URLSearchParams(useLocation().search);
}

const formatTime = (isoString) => {
    if (!isoString) return "";
    try {
        const date = new Date(isoString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return "";
    }
};

// ── Tick indicator ─────────────────────────────────────────────────────────────
function Ticks({ msg }) {
    const isTmp = typeof msg._id === "string" && msg._id.startsWith("tmp-");
    if (isTmp) {
        // Single gray tick — sending
        return (
            <span title="Sending" style={{ fontSize: 11, color: C.tickGray, marginLeft: 4, lineHeight: 1 }}>
                ✓
            </span>
        );
    }
    if (msg.read) {
        // Double blue tick — read
        return (
            <span title="Read" style={{ fontSize: 11, color: C.tickBlue, marginLeft: 4, lineHeight: 1, letterSpacing: -2 }}>
                ✓✓
            </span>
        );
    }
    // Double gray tick — delivered
    return (
        <span title="Delivered" style={{ fontSize: 11, color: C.tickGray, marginLeft: 4, lineHeight: 1, letterSpacing: -2 }}>
            ✓✓
        </span>
    );
}

// ── Payment bubble ─────────────────────────────────────────────────────────────
function PaymentBubble({ amount, isMe, msg }) {
    return (
        <div style={{
            display: "inline-flex", flexDirection: "column",
            background: isMe ? C.myBubble : "#fff",
            border: `1.5px solid ${isMe ? C.primary : "#e0e0e0"}`,
            borderRadius: 16, padding: "12px 20px",
            minWidth: 180, maxWidth: 260, gap: 6,
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                    width: 36, height: 36, borderRadius: "50%", background: C.primary,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, color: "#fff", fontWeight: 700, flexShrink: 0,
                }}>₹</div>
                <div>
                    <div style={{ fontSize: 11, color: "#888", fontWeight: 500 }}>
                        {isMe ? "You sent" : "Received"}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: C.primaryDark, lineHeight: 1.1 }}>
                        ₹{Number(amount).toLocaleString("en-IN")}
                    </div>
                </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 12, color: C.primary, fontWeight: 600 }}>
                        ✓ {isMe ? "Payment Sent" : "Payment Received"}
                    </span>
                    <span style={{ fontSize: 10, color: "#888", fontWeight: 400 }}>
                        {formatTime(msg.timestamp)}
                    </span>
                </div>
                {isMe && <Ticks msg={msg} />}
            </div>
        </div>
    );
}

// ── Pay modal ──────────────────────────────────────────────────────────────────
function PayModal({ recipient, onClose, onSuccess, token }) {
    const [amount, setAmount] = useState("");
    const [balance, setBalance] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch(`${API_URL}/account/balance`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(d => setBalance(Number(d.balance).toFixed(2)))
            .catch(() => {});
    }, [token]);

    const handleSend = async () => {
        const amt = parseFloat(amount);
        if (!amt || amt <= 0) { setError("Enter a valid amount"); return; }
        if (balance !== null && amt > parseFloat(balance)) { setError("Insufficient balance"); return; }
        setLoading(true); setError("");
        try {
            const res = await fetch(`${API_URL}/account/transfer`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ to: recipient._id, amount: amt }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.message || "Transfer failed"); setLoading(false); return; }
            onSuccess(amt);
        } catch { setError("Network error"); setLoading(false); }
    };

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
        }}>
            <div style={{
                background: "#fff", borderRadius: 20, padding: "32px 28px",
                width: "min(340px, calc(100vw - 32px))",
                boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                display: "flex", flexDirection: "column", gap: 18,
            }}>
                <div style={{ textAlign: "center" }}>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                        <Avatar user={recipient} size={56} fontSize={24} />
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>
                        {recipient.firstName} {recipient.lastName}
                    </div>
                    {balance !== null && (
                        <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
                            Balance: <b style={{ color: C.primaryDark }}>₹{Number(balance).toLocaleString("en-IN")}</b>
                        </div>
                    )}
                </div>
                <div style={{ position: "relative" }}>
                    <span style={{
                        position: "absolute", left: 14, top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: 22, fontWeight: 700, color: C.primaryDark,
                    }}>₹</span>
                    <input
                        type="number" min="1" placeholder="0" value={amount}
                        onChange={e => { setAmount(e.target.value); setError(""); }}
                        onKeyDown={e => e.key === "Enter" && handleSend()}
                        autoFocus
                        style={{
                            width: "100%", boxSizing: "border-box",
                            padding: "14px 16px 14px 36px",
                            fontSize: 28, fontWeight: 700, textAlign: "center",
                            border: "2px solid #e0e0e0", borderRadius: 12,
                            outline: "none", color: "#111",
                        }}
                    />
                </div>
                {error && <div style={{ color: "#e53935", fontSize: 13, textAlign: "center", marginTop: -8 }}>{error}</div>}
                <button onClick={handleSend} disabled={loading} style={{
                    background: loading ? "#aaa" : C.primary,
                    color: "#fff", border: "none", borderRadius: 12,
                    padding: "14px 0", fontSize: 16, fontWeight: 700,
                    cursor: loading ? "not-allowed" : "pointer", width: "100%",
                }}>
                    {loading ? "Sending…" : `Send${amount ? ` ₹${Number(amount).toLocaleString("en-IN")}` : ""}`}
                </button>
                <button onClick={onClose} disabled={loading} style={{
                    background: "none", color: "#888", border: "1.5px solid #e0e0e0",
                    borderRadius: 12, padding: "10px 0", fontSize: 15,
                    cursor: "pointer", width: "100%",
                }}>Cancel</button>
            </div>
        </div>
    );
}

// ── Avatar — shows profile image or initials fallback ─────────────────────────
function ChatSkeleton() {
    const rows = [
        { side: "left",  widths: [140] },
        { side: "right", widths: [200] },
        { side: "left",  widths: [180, 160] },
        { side: "right", widths: [120] },
        { side: "left",  widths: [220] },
        { side: "right", widths: [170, 130] },
    ];
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "20px 16px" }}>
            <style>{`
                @keyframes shimmer {
                    0% { background-position: -400px 0; }
                    100% { background-position: 400px 0; }
                }
                .skeleton-bubble {
                    background: linear-gradient(90deg, #e8e8e8 25%, #f5f5f5 50%, #e8e8e8 75%);
                    background-size: 800px 100%;
                    animation: shimmer 1.4s infinite linear;
                    border-radius: 16px;
                    height: 38px;
                }
            `}</style>
            {rows.map((row, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: row.side === "right" ? "flex-end" : "flex-start" }}>
                    {row.widths.map((w, j) => (
                        <div key={j} className="skeleton-bubble" style={{ width: w }} />
                    ))}
                </div>
            ))}
        </div>
    );
}

function Avatar({ user, size = 40, fontSize = 18 }) {
    const initials = ((user?.firstName?.[0] || "") + (user?.lastName?.[0] || "")).toUpperCase() || "?";
    if (user?.profileImage) {
        return (
            <img
                src={user.profileImage}
                alt={initials}
                style={{
                    width: size, height: size, borderRadius: "50%",
                    objectFit: "cover", flexShrink: 0,
                    border: "2px solid rgba(255,255,255,0.3)",
                }}
            />
        );
    }
    return (
        <div style={{
            width: size, height: size, borderRadius: "50%", background: C.primary,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize, color: "#fff", fontWeight: 700, flexShrink: 0,
        }}>
            {initials}
        </div>
    );
}

// ── Encrypted file display ─────────────────────────────────────────────────────
function EncryptedFileDisplay({ msg, senderPublicKey, myPrivateKey, isMe }) {
    const [objectUrl, setObjectUrl] = useState(null);
    const [status, setStatus] = useState("decrypting");

    const originalName = (msg.fileName || "file").replace(/\.enc$/, "");
    const isAudio = /\.(webm|mp3|wav|ogg|m4a)$/i.test(originalName);
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(originalName);

    useEffect(() => {
        if (!senderPublicKey || !myPrivateKey) { setStatus("no-keys"); return; }
        let revoke = null;
        (async () => {
            try {
                const resp = await fetch(msg.fileUrl);
                const buf = new Uint8Array(await resp.arrayBuffer());
                const plain = await decryptFileBytes(buf, senderPublicKey, myPrivateKey);
                const mime = isAudio ? "audio/webm" : isImage ? "image/jpeg" : "application/octet-stream";
                const url = URL.createObjectURL(new Blob([plain], { type: mime }));
                revoke = url;
                setObjectUrl(url);
                setStatus("ready");
            } catch {
                setStatus("error");
            }
        })();
        return () => { if (revoke) URL.revokeObjectURL(revoke); };
    }, [msg.fileUrl, senderPublicKey, myPrivateKey]);

    const bubbleStyle = {
        background: isMe ? C.myBubble : "#fff",
        padding: "8px 12px", borderRadius: 12,
        boxShadow: "0 1px 2px rgba(0,0,0,0.07)",
    };

    if (status !== "ready") {
        return (
            <div style={{ ...bubbleStyle, color: "#888", fontSize: 13 }}>
                {status === "decrypting" ? "🔓 Decrypting…" : status === "error" ? "🔒 Encrypted file" : "🔒 Keys unavailable"}
            </div>
        );
    }

    if (isAudio) {
        return (
            <div style={{ ...bubbleStyle, minWidth: 200 }}>
                <audio src={objectUrl} controls preload="metadata" style={{ height: 35, width: 220 }} />
            </div>
        );
    }
    if (isImage) {
        return (
            <div style={{ ...bubbleStyle, padding: 4, maxWidth: 300 }}>
                <img src={objectUrl} alt="photo" style={{ width: "100%", borderRadius: 8, display: "block", cursor: "pointer", maxHeight: 400, objectFit: "cover" }}
                    onClick={() => window.open(objectUrl, "_blank")} />
            </div>
        );
    }
    return (
        <a href={objectUrl} download={originalName} style={{
            display: "inline-block", ...bubbleStyle,
            color: C.primaryDark, textDecoration: "underline",
            maxWidth: 320, wordBreak: "break-all",
        }}>📎 {originalName}</a>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ChatPage() {
    const { ws, wsVersion } = useWebSocket();
    const { callData, setCallData, myUser } = useCall();
    const [convoUsers, setConvoUsers] = useState([]);
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [search, setSearch] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [showEmoji, setShowEmoji] = useState(false);
    const [showPayModal, setShowPayModal] = useState(false);
    const [unreadScroll, setUnreadScroll] = useState(0);   // new msgs while scrolled up
    const [unreadCounts, setUnreadCounts] = useState({});  // badge per user in sidebar

    // Voice Message states
    const [isRecording, setIsRecording] = useState(false);
    const [recDuration, setRecDuration] = useState(0);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const recTimerRef = useRef(null);

    // Industry features states
    const [presenceMap, setPresenceMap] = useState({}); // { userId: { status, lastSeen } }
    const [typingMap, setTypingMap] = useState({});     // { userId: boolean }
    const [hoveredMsgId, setHoveredMsgId] = useState(null);
    const [activeTrayMsgId, setActiveTrayMsgId] = useState(null);
    const [showFullReactionPicker, setShowFullReactionPicker] = useState(null); // stores messageId
    const [activeDropdownMsgId, setActiveDropdownMsgId] = useState(null);
    const [dropdownPos, setDropdownPos] = useState(null); // { top, left?, right? } for fixed dropdown
    const [showDeleteModal, setShowDeleteModal] = useState(null); // { msgId, isMine }
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [showSidebar, setShowSidebar] = useState(true);
    const typingTimeoutRef = useRef({});

    // E2E encryption state
    const [myPrivateKey, setMyPrivateKey] = useState(null);
    const [selectedUserPublicKey, setSelectedUserPublicKey] = useState(null);
    const [decryptedMessages, setDecryptedMessages] = useState([]);
    const [decrypting, setDecrypting] = useState(false);

    // AI assistant state
    const [showAiInput, setShowAiInput] = useState(false);
    const [aiInput, setAiInput] = useState("");
    const [aiLoading, setAiLoading] = useState(false);

    const fileInputRef = useRef(null);
    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const isAtBottomRef = useRef(true);
    const jumpToBottomRef = useRef(false);          // force-scroll after history load
    const prevWsVersionRef = useRef(0);             // detect reconnects for history re-sync
    const token = sessionStorage.getItem("token");
    const query = useQuery();
    const navigate = useNavigate();

    // ── Helpers ────────────────────────────────────────────────────────────────
    const scrollToBottom = useCallback((behavior = "smooth") => {
        messagesEndRef.current?.scrollIntoView({ behavior });
        setUnreadScroll(0);
        isAtBottomRef.current = true;
    }, []);

    const handleScroll = () => {
        const el = messagesContainerRef.current;
        if (!el) return;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        isAtBottomRef.current = atBottom;
        if (atBottom) setUnreadScroll(0);
        // close any open dropdown when the list scrolls
        setActiveDropdownMsgId(null);
    };

    // ── Seed presenceMap with currently online users on every WS (re)connect ────
    useEffect(() => {
        if (!wsVersion || !token) return;
        fetch(`${API_URL}/user/online`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(d => {
                const now = new Date();
                const initial = {};
                (d.userIds || []).forEach(id => { initial[id] = { status: "ONLINE", lastSeen: now }; });
                setPresenceMap(prev => ({ ...initial, ...prev }));
            })
            .catch(() => {});
    }, [wsVersion, token]);

    // ── Mobile resize handler ──────────────────────────────────────────────────
    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener("resize", handler);
        return () => window.removeEventListener("resize", handler);
    }, []);

    // ── Restore selected user from URL ─────────────────────────────────────────
    useEffect(() => {
        const id = query.get("id");
        if (id) {
            setSelectedUserId(id);
            if (window.innerWidth < 768) setShowSidebar(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Keep URL in sync ───────────────────────────────────────────────────────
    useEffect(() => {
        if (selectedUserId) navigate(`/chatpage?id=${selectedUserId}`, { replace: true });
    }, [selectedUserId, navigate]);

    // ── Load own E2E private key from session cache ────────────────────────────
    useEffect(() => {
        if (!myUser || myPrivateKey || !token) return;
        // Lazy init for users who are already logged in but missing keys (production update case)
        initE2ESessionKey(myUser._id, token, API_URL)
            .then(() => {
                const pk = getCachedPrivateKey(myUser._id);
                if (pk) setMyPrivateKey(pk);
            })
            .catch(err => console.error("Auto key init failed:", err));
    }, [myUser, myPrivateKey, token]);

    // ── Fetch selected user's public key ──────────────────────────────────────
    useEffect(() => {
        if (!selectedUserId || !token) { setSelectedUserPublicKey(null); return; }
        fetch(`${API_URL}/user/keys/${selectedUserId}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(d => setSelectedUserPublicKey(d.publicKey || null))
            .catch(() => setSelectedUserPublicKey(null));
    }, [selectedUserId, token]);

    // ── Decrypt messages whenever messages or keys change ─────────────────────
    useEffect(() => {
        if (!myPrivateKey || !selectedUserPublicKey) {
            setDecrypting(messages.some(m => m.content?.startsWith("e2e:")));
            setDecryptedMessages(messages.map(msg =>
                msg.content?.startsWith("e2e:") ? { ...msg, content: "" } : msg
            ));
            return;
        }
        setDecrypting(true);
        let cancelled = false;
        (async () => {
            const result = await Promise.all(messages.map(async (msg) => {
                if (msg._plaintext !== undefined) return { ...msg, content: msg._plaintext };
                if (msg.isDeleted || !msg.content?.startsWith("e2e:")) return msg;
                const content = await decryptMessage(msg.content, selectedUserPublicKey, myPrivateKey);
                return { ...msg, content };
            }));
            if (!cancelled) { setDecryptedMessages(result); setDecrypting(false); }
        })();
        return () => { cancelled = true; };
    }, [messages, myPrivateKey, selectedUserPublicKey]);

    // ── Fetch conversation list ────────────────────────────────────────────────
    useEffect(() => {
        if (!token) return;
        fetch(`${API_URL}/message/conversations`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(async d => {
                const ids = d.users || [];
                if (!ids.length) return;
                const res = await fetch(`${API_URL}/user/bulk?filter=`, { headers: { Authorization: `Bearer ${token}` } });
                const all = (await res.json()).users || [];
                const seen = new Set();
                const unique = ids
                    .map(id => all.find(u => u._id === id))
                    .filter(u => { if (!u || seen.has(u._id)) return false; seen.add(u._id); return true; });
                setConvoUsers(unique);
            });
    }, [token]);

    // ── Add selected user to sidebar if absent ─────────────────────────────────
    useEffect(() => {
        if (!selectedUserId || !token || convoUsers.find(u => u._id === selectedUserId)) return;
        fetch(`${API_URL}/user/bulk?filter=`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(d => {
                const user = (d.users || []).find(u => u._id === selectedUserId);
                if (user) setConvoUsers(prev => prev.some(u => u._id === user._id) ? prev : [...prev, user]);
            });
    }, [selectedUserId, token, convoUsers]);

    // ── Search bar ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!search) { setSearchResults([]); return; }
        fetch(`${API_URL}/user/bulk?filter=${encodeURIComponent(search)}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(d => setSearchResults(d.users || []));
    }, [search, token]);

    // ── Fetch history + mark as read when selecting a user ────────────────────
    useEffect(() => {
        if (!selectedUserId || !token) return;

        // Clear unread badge for this user
        setUnreadCounts(prev => ({ ...prev, [selectedUserId]: 0 }));
        setUnreadScroll(0);

        // Fetch history
        fetch(`${API_URL}/message/history/${selectedUserId}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(d => {
                setMessages(d.messages || []);
                jumpToBottomRef.current = true;
            });

        // Mark messages from this user as read on the server
        fetch(`${API_URL}/message/read`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ from: selectedUserId }),
        }).catch(() => {});
    }, [selectedUserId, token]);


    // ── Send read receipt via WS after myUser is known ─────────────────────────
    useEffect(() => {
        if (!selectedUserId || !myUser || !ws?.current) return;
        if (ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({
                type: "read_receipt",
                from: myUser._id,
                to: selectedUserId,
            }));
        }
    }, [selectedUserId, myUser, ws, wsVersion]);

    // ── Re-sync history on WS reconnect (catches events missed during drop) ──────
    useEffect(() => {
        if (!wsVersion || !selectedUserId || !token) return;

        if (prevWsVersionRef.current === 0) {
            // First connection — history already loaded by the selectedUserId effect
            prevWsVersionRef.current = wsVersion;
            return;
        }
        if (wsVersion === prevWsVersionRef.current) return;
        prevWsVersionRef.current = wsVersion;

        // Silently re-fetch the current chat so any missed events (deletes, reactions)
        // are reflected without requiring a page reload
        fetch(`${API_URL}/message/history/${selectedUserId}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(d => { if (d.messages) setMessages(d.messages); })
            .catch(() => {});
    }, [wsVersion, selectedUserId, token]);

    // ── Scroll on new messages ─────────────────────────────────────────────────
    useEffect(() => {
        if (jumpToBottomRef.current) {
            scrollToBottom("instant");
            jumpToBottomRef.current = false;
        } else if (isAtBottomRef.current) {
            scrollToBottom("smooth");
        }
    }, [messages, scrollToBottom]);

    // ── Incoming WebSocket messages ────────────────────────────────────────────
    useEffect(() => {
        if (!ws?.current || !myUser) return;
        // Capture the socket at effect-run time so the cleanup removes from the
        // correct (possibly old) socket even after ws.current is replaced on reconnect
        const socket = ws.current;
        const handle = (event) => {
            try {
                const msg = JSON.parse(event.data);

                // Handling industrial features
                if (msg.type === "presence") {
                    setPresenceMap(prev => ({
                        ...prev,
                        [msg.userId]: { status: msg.status, lastSeen: msg.lastSeen }
                    }));
                }
                if (msg.type === "typing") {
                    setTypingMap(prev => ({ ...prev, [msg.from]: true }));
                    if (typingTimeoutRef.current[msg.from]) clearTimeout(typingTimeoutRef.current[msg.from]);
                    typingTimeoutRef.current[msg.from] = setTimeout(() => {
                        setTypingMap(prev => ({ ...prev, [msg.from]: false }));
                    }, 3000);
                }
                if (msg.type === "reaction_update") {
                    setMessages(prev => prev.map(m => m._id === msg.messageId ? { ...m, reactions: msg.reactions } : m));
                }

                if (msg.type === "message_deleted") {
                    setMessages(prev => {
                        if (msg.everyone) {
                            // If deleted for everyone, update the content placeholder
                            return prev.map(m => m._id === msg.messageId ? {
                                ...m,
                                content: "🚫 This message was deleted",
                                fileUrl: "",
                                fileName: "",
                                isDeleted: true,
                                reactions: {}
                            } : m);
                        } else {
                            // If deleted for me only, remove it from list
                            return prev.filter(m => m._id !== msg.messageId);
                        }
                    });
                    return; // don't let this fall through to chat-message logic
                }
                
                // Call signals are handled globally by CallContext / VoiceCall
                if (["call_offer", "call_answer", "ice_candidate", "call_rejected", "call_ended"].includes(msg.type)) return;

                // 1. Read receipt — update our sent messages to blue ticks
                if (msg.type === "read_receipt" && msg.from === selectedUserId) {
                    setMessages(prev => prev.map(m =>
                        m.from === myUser._id ? { ...m, read: true } : m
                    ));
                    return;
                }

                // 2. Message in current chat (either from OTHER or reflected from ME)
                const isFromOther = (msg.from === selectedUserId && msg.to === myUser._id);
                const isFromMeReflected = (msg.from === myUser._id && msg.to === selectedUserId);

                if (isFromOther || isFromMeReflected) {
                    setMessages(prev => {
                        // A. Check if this exact ID already exists (resolved by REST or already handled by WS)
                        if (prev.some(m => m._id === msg._id)) return prev;

                        // B. For reflected messages, replace matching optimistic entry (tmp-...)
                        if (isFromMeReflected) {
                            const tmpIdx = prev.findIndex(m =>
                                typeof m._id === "string" && m._id.startsWith("tmp-") &&
                                m.content === msg.content &&
                                m.to === msg.to
                            );
                            if (tmpIdx !== -1) {
                                // Update the optimistic message with server data
                                const newMessages = [...prev];
                                newMessages[tmpIdx] = { ...msg };
                                return newMessages;
                            }
                        }

                        // C. Otherwise, add as a new message
                        return [...prev, msg];
                    });

                    if (isFromOther && !isAtBottomRef.current) {
                        setUnreadScroll(prev => prev + 1);
                    }

                    // Immediately send read receipt back if it's from the other person
                    if (isFromOther && ws.current.readyState === WebSocket.OPEN) {
                        ws.current.send(JSON.stringify({
                            type: "read_receipt",
                            from: myUser._id,
                            to: msg.from,
                        }));
                    }
                    return;
                }

                // 3. Message from someone else (not current chat) — sidebar badge
                if (msg.to === myUser._id && msg.from && !msg.type) {
                    setUnreadCounts(prev => ({
                        ...prev,
                        [msg.from]: (prev[msg.from] || 0) + 1,
                    }));
                    setConvoUsers(prev => {
                        if (prev.some(u => u._id === msg.from)) return prev;
                        fetch(`${API_URL}/user/bulk?filter=`, { headers: { Authorization: `Bearer ${token}` } })
                            .then(r => r.json())
                            .then(d => {
                                const user = (d.users || []).find(u => u._id === msg.from);
                                if (user) setConvoUsers(p => p.some(u => u._id === user._id) ? p : [...p, user]);
                            });
                        return prev;
                    });
                }
            } catch { /* ignore */ }
        };
        socket.addEventListener("message", handle);
        return () => socket.removeEventListener("message", handle);
    }, [ws, wsVersion, selectedUserId, myUser, token]);

    // ── Send text message ──────────────────────────────────────────────────────
    const sendMessage = async () => {
        if (!input.trim() || !selectedUserId || !myUser) return;
        const plaintext = input.trim();
        setInput("");

        // Encrypt if keys are available, otherwise send plaintext as fallback
        let content = plaintext;
        if (myPrivateKey && selectedUserPublicKey) {
            content = await encryptMessage(plaintext, selectedUserPublicKey, myPrivateKey);
        }

        const optimisticId = `tmp-${Date.now()}`;
        const optimistic = {
            _id: optimisticId, from: myUser._id, to: selectedUserId,
            content, _plaintext: plaintext, timestamp: new Date().toISOString(), read: false,
        };
        setMessages(prev => [...prev, optimistic]);

        fetch(`${API_URL}/message/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ to: selectedUserId, content }),
        }).then(r => r.json()).then(d => {
            if (d.msg) {
                setMessages(prev => prev.map(m =>
                    m._id === optimisticId ? { ...d.msg, from: myUser._id, _plaintext: plaintext } : m
                ));
            }
        }).catch(() => {});
    };

    // ── Payment success callback ───────────────────────────────────────────────
    const handlePaymentSuccess = async (amount) => {
        setShowPayModal(false);
        const plaintext = `__PAYMENT__:${amount}`;
        let content = plaintext;
        if (myPrivateKey && selectedUserPublicKey) {
            content = await encryptMessage(plaintext, selectedUserPublicKey, myPrivateKey);
        }
        const optimisticId = `tmp-pay-${Date.now()}`;
        const optimistic = {
            _id: optimisticId, from: myUser._id, to: selectedUserId,
            content, _plaintext: plaintext, timestamp: new Date().toISOString(), read: false,
        };
        setMessages(prev => [...prev, optimistic]);
        fetch(`${API_URL}/message/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ to: selectedUserId, content }),
        }).then(r => r.json()).then(d => {
            if (d.msg) {
                setMessages(prev => prev.map(m =>
                    m._id === optimisticId ? { ...d.msg, from: myUser._id, _plaintext: plaintext } : m
                ));
            }
        }).catch(() => {});
    };

    // ── Send file ──────────────────────────────────────────────────────────────
    const sendFile = async (e) => {
        const file = e.target.files[0];
        if (!file || !selectedUserId || !myUser) return;

        const formData = new FormData();
        formData.append("to", selectedUserId);

        if (myPrivateKey && selectedUserPublicKey) {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const encrypted = await encryptFileBytes(bytes, selectedUserPublicKey, myPrivateKey);
            const encFile = new File([encrypted], file.name + ".enc", { type: "application/octet-stream" });
            formData.append("file", encFile);
        } else {
            formData.append("file", file);
        }

        try {
            await fetch(`${API_URL}/message/send-file`, {
                method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData,
            });
        } catch { /* ignore */ } finally {
            fileInputRef.current.value = "";
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Check for supported MIME types
            const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") 
                ? "audio/webm;codecs=opus" 
                : "audio/webm";

            const recorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            };

            recorder.onstop = async () => {
                if (audioChunksRef.current.length === 0) {
                    console.warn("No audio data captured");
                    return;
                }
                const blob = new Blob(audioChunksRef.current, { type: mimeType });
                const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
                await uploadVoiceMessage(file);
                stream.getTracks().forEach(t => t.stop());
            };

            recorder.start(200); // Collect data every 200ms for better reliability
            setIsRecording(true);
            setRecDuration(0);
            recTimerRef.current = setInterval(() => setRecDuration(d => d + 1), 1000);
        } catch (err) {
            console.error("Recording error:", err);
            alert("Could not access microphone or recording failed");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(recTimerRef.current);
        }
    };

    const cancelRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.onstop = null; // Prevent upload
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
            setIsRecording(false);
            clearInterval(recTimerRef.current);
        }
    };

    const deleteMessage = async (messageId, everyone) => {
        // Update UI instantly — don't wait for the network
        if (everyone) {
            setMessages(prev => prev.map(m => m._id === messageId ? {
                ...m, content: "🚫 This message was deleted",
                fileUrl: "", fileName: "", isDeleted: true, reactions: {}
            } : m));
        } else {
            setMessages(prev => prev.filter(m => m._id !== messageId));
        }
        setShowDeleteModal(null);

        try {
            await fetch(`${API_URL}/message/delete`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ messageId, everyone })
            });
            // Backend broadcasts message_deleted to the other user via WS — no further action needed here
        } catch (error) {
            console.error("Delete error:", error);
        }
    };

    const uploadVoiceMessage = async (file) => {
        const formData = new FormData();
        formData.append("to", selectedUserId);

        if (myPrivateKey && selectedUserPublicKey) {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const encrypted = await encryptFileBytes(bytes, selectedUserPublicKey, myPrivateKey);
            const encFile = new File([encrypted], file.name + ".enc", { type: "application/octet-stream" });
            formData.append("file", encFile);
        } else {
            formData.append("file", file);
        }

        try {
            await fetch(`${API_URL}/message/send-file`, {
                method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData,
            });
        } catch (err) {
            console.error("Voice upload failed:", err);
        }
    };

    const formatRecTime = (s) => {
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    // ── AI assistant ───────────────────────────────────────────────────────────
    const sendAiMessage = async () => {
        if (!aiInput.trim() || !selectedUserId || !myUser || aiLoading) return;
        const userText = aiInput.trim();
        setAiInput("");
        setAiLoading(true);

        // Show user's AI query as a special message
        const userAiMsg = {
            _id: `ai-q-${Date.now()}`, from: myUser._id, to: selectedUserId,
            content: userText, timestamp: new Date().toISOString(),
            read: false, isAiQuery: true,
        };
        setMessages(prev => [...prev, userAiMsg]);

        try {
            const res = await fetch(`${API_URL}/ai/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    message: userText,
                    recipientId: selectedUserId,
                    chatHistory: messages.slice(-30).map(m => ({
                        from: m.from,
                        content: decryptedMessages.find(d => d._id === m._id)?.content || m.content
                    }))
                }),
            });
            const data = await res.json();

            // Add AI reply bubble
            const aiReplyMsg = {
                _id: `ai-r-${Date.now()}`, from: "ai", to: myUser._id,
                content: data.reply || "Sorry, I couldn't process that.",
                timestamp: new Date().toISOString(), read: true, isAiReply: true,
            };
            setMessages(prev => [...prev, aiReplyMsg]);

            // If AI executed a payment, also send a payment message in chat
            if (data.actions?.length) {
                for (const action of data.actions) {
                    if (action.type === "payment") {
                        const payContent = `__PAYMENT__:${action.amount}`;
                        let encContent = payContent;
                        if (myPrivateKey && selectedUserPublicKey) {
                            encContent = await encryptMessage(payContent, selectedUserPublicKey, myPrivateKey);
                        }
                        await fetch(`${API_URL}/message/send`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ to: selectedUserId, content: encContent }),
                        });
                    }
                }
            }
        } catch {
            setMessages(prev => [...prev, {
                _id: `ai-err-${Date.now()}`, from: "ai", to: myUser._id,
                content: "AI service unavailable. Please try again.",
                timestamp: new Date().toISOString(), isAiReply: true,
            }]);
        } finally {
            setAiLoading(false);
        }
    };

    const handleTyping = () => {
        if (!selectedUserId || !ws?.current) return;
        ws.current.send(JSON.stringify({ type: "typing", to: selectedUserId }));
    };

    const addReaction = async (messageId, emoji) => {
        try {
            const res = await fetch(`${API_URL}/message/reaction`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ messageId, emoji }),
            });
            const d = await res.json();
            if (d.reactions) {
                setMessages(prev => prev.map(m => m._id === messageId ? { ...m, reactions: d.reactions } : m));
            }
        } catch {}
    };

    const handleSelectUser = (user) => {
        setConvoUsers(prev => prev.some(u => u._id === user._id) ? prev : [...prev, user]);
        setSelectedUserId(user._id);
        setSearch(""); setSearchResults([]);
        if (isMobile) setShowSidebar(false);
    };

    const selectedUser = convoUsers.find(u => u._id === selectedUserId);
    // ── Message bubble renderer ────────────────────────────────────────────────
    const renderMessageContent = (msg, isMe) => {
        // AI query bubble (user's question to AI)
        if (msg.isAiQuery) {
            return (
                <div style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    background: "linear-gradient(135deg, #10b981, #059669)", // Emerald gradient
                    color: "#fff", padding: "10px 16px", borderRadius: 16,
                    fontSize: 14, maxWidth: 320, wordBreak: "break-word",
                    boxShadow: "0 2px 8px rgba(16,185,129,0.3)",
                }}>
                    <span style={{ fontSize: 16 }}>✨</span>
                    <span>{msg.content}</span>
                </div>
            );
        }

        // AI reply bubble
        if (msg.isAiReply) {
            return (
                <div style={{
                    display: "inline-block",
                    background: "linear-gradient(135deg, #f0fdf4, #dcfce7)", // Light emerald gradient
                    border: "1.5px solid #86efac", // Emerald-300
                    color: "#064e3b", // Emerald-900
                    padding: "12px 16px", borderRadius: 16,
                    fontSize: 14, maxWidth: 340, wordBreak: "break-word",
                    boxShadow: "0 2px 8px rgba(16,185,129,0.1)",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 16 }}>🤖</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: 0.5 }}>PayCircle AI</span>
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{msg.content}</div>
                </div>
            );
        }

        if (msg.isDeleted) {
            return (
                <div style={{
                    padding: "8px 16px", borderRadius: 16,
                    background: "#f5f5f5", color: "#999", fontSize: 13,
                    fontStyle: "italic", border: "1px solid #eee",
                    display: "flex", alignItems: "center", gap: 8,
                    maxWidth: 320, boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)"
                }}>
                    <span style={{ fontSize: 14 }}>🚫</span> This message was deleted
                </div>
            );
        }

        if (msg.content?.startsWith("__PAYMENT__:")) {
            const amount = msg.content.split(":")[1];
            return <PaymentBubble amount={amount} isMe={isMe} msg={msg} />;
        }

        if (msg.fileUrl) {
            // Encrypted file — decrypt and display using EncryptedFileDisplay
            if (msg.fileUrl.endsWith(".enc")) {
                return (
                    <EncryptedFileDisplay
                        msg={msg} isMe={isMe}
                        senderPublicKey={selectedUserPublicKey}
                        myPrivateKey={myPrivateKey}
                    />
                );
            }

            const isAudio = msg.fileUrl.match(/\.(webm|mp3|wav|ogg|m4a)$/i);
            const isImage = msg.fileUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            
            if (isAudio) {
                return (
                    <div style={{
                        background: isMe ? C.myBubble : "#fff",
                        padding: "8px 12px", borderRadius: 12,
                        color: "#222", boxShadow: "0 1px 2px rgba(0,0,0,0.07)",
                        minWidth: 200,
                    }}>
                        <audio 
                            src={msg.fileUrl} 
                            controls 
                            preload="metadata"
                            onLoadedMetadata={(e) => {
                                if (e.target.duration === Infinity || isNaN(e.target.duration)) {
                                    e.target.currentTime = 1e101;
                                    e.target.ontimeupdate = () => {
                                        e.target.ontimeupdate = null;
                                        e.target.currentTime = 0;
                                    };
                                }
                            }}
                            style={{ height: 35, width: 220 }} 
                        />
                    </div>
                );
            }
            if (isImage) {
                return (
                    <div style={{
                        background: isMe ? C.myBubble : "#fff",
                        padding: 4, borderRadius: 12,
                        boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                        maxWidth: 300,
                    }}>
                        <img 
                            src={msg.fileUrl} 
                            alt="photo" 
                            style={{ 
                                width: "100%", borderRadius: 8, 
                                display: "block", cursor: "pointer",
                                maxHeight: 400, objectFit: "cover"
                            }} 
                            onClick={() => window.open(msg.fileUrl, "_blank")}
                        />
                    </div>
                );
            }
            return (
                <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" style={{
                    display: "inline-block",
                    background: isMe ? C.myBubble : "#fff",
                    padding: "10px 16px", borderRadius: 12,
                    color: C.primaryDark, textDecoration: "underline",
                    maxWidth: 320, wordBreak: "break-all",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.07)",
                }}>📎 {msg.fileName || "File"}</a>
            );
        }

        return (
            <div style={{
                display: "inline-block", padding: "10px 16px", borderRadius: 16,
                background: isMe ? C.myBubble : "#fff",
                color: "#111", fontSize: 15,
                maxWidth: 320, wordBreak: "break-word",
                boxShadow: "0 1px 2px rgba(0,0,0,0.07)",
            }}>
                {msg.content}
            </div>
        );
    };

    const renderMessage = (msg, i) => {
        const isMe = myUser && msg.from === myUser._id;
        const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "😋"];

        // AI messages render simply — no ticks, reactions, or dropdown
        if (msg.isAiQuery || msg.isAiReply) {
            return (
                <div key={msg._id || i} style={{ textAlign: msg.isAiReply ? "left" : "right", margin: "6px 24px" }}>
                    {renderMessageContent(msg, msg.isAiQuery)}
                    <div style={{ fontSize: 10, color: "#aaa", marginTop: 3, textAlign: msg.isAiReply ? "left" : "right" }}>
                        {formatTime(msg.timestamp)}
                    </div>
                </div>
            );
        }

        return (
            <div key={msg._id || i} 
                onMouseEnter={() => setHoveredMsgId(msg._id)}
                onMouseLeave={() => setHoveredMsgId(null)}
                style={{ textAlign: isMe ? "right" : "left", margin: "8px 24px", position: "relative" }}
            >
                {/* ── Reaction Tray (WhatsApp Style) ── */}
                {activeTrayMsgId === msg._id && (
                    <div style={{
                        position: "absolute",
                        bottom: "100%",
                        [isMe ? "right" : "left"]: 0,
                        zIndex: 100,
                        background: "#222",
                        padding: "6px 12px",
                        borderRadius: 30,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
                        marginBottom: 4,
                        animation: "fadeInUp 0.15s ease-out"
                    }}>
                        {QUICK_EMOJIS.map(emo => (
                            <span 
                                key={emo} 
                                onClick={() => { addReaction(msg._id, emo); setActiveTrayMsgId(null); }}
                                style={{ cursor: "pointer", fontSize: 20, transition: "transform 0.1s" }}
                                onMouseEnter={e => e.currentTarget.style.transform = "scale(1.2)"}
                                onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                            >{emo}</span>
                        ))}
                        <button 
                            onClick={() => { setShowFullReactionPicker(msg._id); setActiveTrayMsgId(null); }}
                            style={{
                                background: "#444", color: "#fff", border: "none",
                                borderRadius: "50%", width: 28, height: 28,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 18, cursor: "pointer"
                            }}
                        >+</button>
                    </div>
                )}

                <div style={{ display: "flex", alignItems: "center", justifyContent: isMe ? "flex-end" : "flex-start", gap: 8 }}>
                    
                    {/* Smiley Trigger - Left side for My Messages */}
                    {isMe && (hoveredMsgId === msg._id || activeTrayMsgId === msg._id) && (
                        <button 
                            onClick={() => setActiveTrayMsgId(msg._id === activeTrayMsgId ? null : msg._id)}
                            style={{
                                background: "#f0f0f0", border: "none", borderRadius: "50%",
                                width: 32, height: 32, cursor: "pointer", fontSize: 16,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                opacity: 0.8, transition: "opacity 0.2s"
                            }}
                            onMouseEnter={e => e.currentTarget.style.opacity = 1}
                        >😊</button>
                    )}

                    <div style={{ position: "relative" }}>
                        {/* Dropdown Chevron Trigger */}
                        {(hoveredMsgId === msg._id || activeDropdownMsgId === msg._id) && !msg.isDeleted && (
                            <div
                                onClick={(e) => {
                                    if (msg._id === activeDropdownMsgId) {
                                        setActiveDropdownMsgId(null);
                                        return;
                                    }
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const APPROX_H = 7 * 32 + 10; // 7 items × ~32px + padding
                                    const fitsBelow = rect.bottom + 6 + APPROX_H < window.innerHeight - 8;
                                    setDropdownPos({
                                        ...(fitsBelow
                                            ? { top: rect.bottom + 6 }
                                            : { top: Math.max(8, rect.top - APPROX_H - 6) }),
                                        ...(isMe
                                            ? { right: window.innerWidth - rect.right }
                                            : { left: rect.left }),
                                    });
                                    setActiveDropdownMsgId(msg._id);
                                }}
                                style={{
                                    position: "absolute", top: 4, [isMe ? "right" : "left"]: 6, cursor: "pointer",
                                    color: "#888", background: "rgba(255,255,255,0.7)", borderRadius: "50%",
                                    width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: 12, zIndex: 10, backdropFilter: "blur(4px)"
                                }}
                            >⌄</div>
                        )}

                        {renderMessageContent(msg, isMe)}

                        {/* Options Dropdown Menu — position:fixed escapes the overflow:auto
                             scroll container so it's never clipped */}
                        {activeDropdownMsgId === msg._id && dropdownPos && (
                            <div
                                onClick={e => e.stopPropagation()}
                                style={{
                                    position: "fixed",
                                    top: dropdownPos.top,
                                    ...(dropdownPos.right != null ? { right: dropdownPos.right } : { left: dropdownPos.left }),
                                    background: "#1f1f1f",
                                    borderRadius: 10,
                                    padding: "4px 0",
                                    minWidth: 155,
                                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    zIndex: 9000,
                                    animation: "fadeInUp 0.12s ease-out",
                                    overflow: "hidden",
                                }}>
                                {[
                                    { label: "Reply",   icon: "↩" },
                                    { label: "React",   icon: "☺", action: () => { setActiveTrayMsgId(msg._id); setActiveDropdownMsgId(null); } },
                                    { label: "Star",    icon: "★" },
                                    { label: "Pin",     icon: "⊕" },
                                    { label: "Forward", icon: "→" },
                                    { label: "Copy",    icon: "⧉", action: () => { navigator.clipboard.writeText(msg.content || ""); setActiveDropdownMsgId(null); } },
                                    { label: "Delete",  icon: "✕", color: "#ff5555", action: () => { setShowDeleteModal({ msgId: msg._id, isMine: isMe }); setActiveDropdownMsgId(null); } },
                                ].map((opt, idx, arr) => (
                                    <div key={opt.label}>
                                        {/* Divider before Delete */}
                                        {idx === arr.length - 1 && (
                                            <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "3px 0" }} />
                                        )}
                                        <div
                                            onClick={() => opt.action ? opt.action() : setActiveDropdownMsgId(null)}
                                            style={{
                                                padding: "7px 14px",
                                                cursor: "pointer",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 10,
                                                color: opt.color || "#d8d8d8",
                                                fontSize: 13,
                                                fontWeight: opt.color ? 500 : 400,
                                                transition: "background 0.1s",
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.07)"}
                                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                                        >
                                            <span style={{ fontSize: 13, width: 16, textAlign: "center", flexShrink: 0 }}>
                                                {opt.icon}
                                            </span>
                                            {opt.label}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        {/* Reaction Display Badges */}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && !msg.isDeleted && (
                            <div style={{
                                position: "absolute", bottom: -12, [isMe ? "left" : "right"]: -8,
                                display: "flex", gap: 2, background: "#fff", padding: "2px 5px",
                                borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.15)", fontSize: 13, zIndex: 1
                            }}>
                                {Array.from(new Set(Object.values(msg.reactions))).slice(0, 3).map((emo, idx) => (
                                    <span key={idx}>{emo}</span>
                                ))}
                                {Object.keys(msg.reactions).length > 1 && (
                                    <span style={{ color: "#666", fontSize: 11, marginLeft: 2, fontWeight: 600 }}>
                                        {Object.keys(msg.reactions).length}
                                    </span>
                                )}
                            </div>
                        )}
                        
                        <div style={{ display: "flex", gap: 6, marginTop: 4, justifyContent: isMe ? "flex-end" : "flex-start", alignItems: "center" }}>
                            <span style={{ fontSize: 10, color: "#888" }}>{formatTime(msg.timestamp)}</span>
                            {isMe && <Ticks msg={msg} />}
                        </div>
                    </div>

                    {/* Smiley Trigger - Right side for Other Messages */}
                    {!isMe && (hoveredMsgId === msg._id || activeTrayMsgId === msg._id) && (
                        <button 
                            onClick={() => setActiveTrayMsgId(msg._id === activeTrayMsgId ? null : msg._id)}
                            style={{
                                background: "#f0f0f0", border: "none", borderRadius: "50%",
                                width: 32, height: 32, cursor: "pointer", fontSize: 16,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                opacity: 0.8, transition: "opacity 0.2s"
                            }}
                            onMouseEnter={e => e.currentTarget.style.opacity = 1}
                        >😊</button>
                    )}
                </div>
            </div>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div style={{ display: "flex", height: "100vh", background: "#f0f5ff" }}>

            {/* ── Deletion Modal ── */}
            {showDeleteModal && (
                <div style={{
                    position: "fixed", inset: 0, zIndex: 3000,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)"
                }} onClick={() => setShowDeleteModal(null)}>
                    <div 
                        style={{
                            background: "#fff", padding: "24px", borderRadius: 16,
                            width: 320, boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
                            animation: "fadeInUp 0.15s ease-out"
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 style={{ margin: "0 0 12px 0", fontSize: 18 }}>Delete Message?</h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {showDeleteModal.isMine && (
                                <button 
                                    onClick={() => deleteMessage(showDeleteModal.msgId, true)}
                                    style={{
                                        padding: "12px", border: "1px solid #ddd", borderRadius: 8,
                                        background: "none", cursor: "pointer", textAlign: "left", fontSize: 14
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"}
                                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                                >Delete for Everyone</button>
                            )}
                            <button 
                                onClick={() => deleteMessage(showDeleteModal.msgId, false)}
                                style={{
                                    padding: "12px", border: "1px solid #ddd", borderRadius: 8,
                                    background: "none", cursor: "pointer", textAlign: "left", fontSize: 14
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"}
                                onMouseLeave={e => e.currentTarget.style.background = "none"}
                            >Delete for Me</button>
                            <button 
                                onClick={() => setShowDeleteModal(null)}
                                style={{
                                    padding: "12px", border: "none", borderRadius: 8,
                                    background: "none", cursor: "pointer", textAlign: "right", 
                                    fontSize: 14, color: C.primary, fontWeight: 600
                                }}
                            >Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {showPayModal && selectedUser && (
                <PayModal
                    recipient={selectedUser} token={token}
                    onClose={() => setShowPayModal(false)}
                    onSuccess={handlePaymentSuccess}
                />
            )}

            {/* ── Sidebar ────────────────────────────────────────────────────── */}
            <div style={{
                width: isMobile ? "100%" : 280,
                borderRight: isMobile ? "none" : "1px solid #e0e0e0",
                background: "#fff",
                display: isMobile && !showSidebar ? "none" : "flex",
                flexDirection: "column",
            }}>
                <div style={{
                    padding: "20px 16px 8px 16px", fontWeight: 700,
                    fontSize: 22, color: C.primaryDark, borderBottom: "1px solid #e0e0e0",
                }}>My Chats</div>

                {/* Search */}
                <div style={{ padding: "12px 16px 8px 16px", position: "relative" }}>
                    <input
                        placeholder="Search users by name..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            width: "100%", padding: "8px 12px", borderRadius: 20,
                            border: "1px solid #e0e0e0", outline: "none", background: "#f6f6f6",
                            boxSizing: "border-box",
                        }}
                    />
                    {search && searchResults.length > 0 && (
                        <ul style={{
                            position: "absolute", top: 44, left: 0, right: 0,
                            background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8,
                            zIndex: 10, maxHeight: 220, overflowY: "auto",
                            margin: 0, padding: 0, listStyle: "none",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                        }}>
                            {searchResults.map(u => (
                                <li key={u._id}
                                    style={{ cursor: "pointer", padding: "8px 12px", borderBottom: "1px solid #f0f0f0" }}
                                    onClick={() => handleSelectUser(u)}
                                >
                                    {u.firstName} {u.lastName}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Conversation list */}
                <ul style={{ listStyle: "none", padding: 0, margin: 0, flex: 1, overflowY: "auto" }}>
                    {convoUsers.map(u => {
                        const badge = unreadCounts[u._id] || 0;
                        return (
                            <li key={u._id}
                                style={{
                                    cursor: "pointer",
                                    background: selectedUserId === u._id ? C.selectedRow : "transparent",
                                    borderRadius: 8, margin: "2px 8px", padding: "8px 10px",
                                    display: "flex", alignItems: "center", transition: "background 0.15s",
                                }}
                                onClick={() => {
                                    setSelectedUserId(u._id);
                                    setUnreadCounts(prev => ({ ...prev, [u._id]: 0 }));
                                    if (isMobile) setShowSidebar(false);
                                }}
                            >
                                {/* Avatar */}
                                <div style={{ marginRight: 12, flexShrink: 0 }}>
                                    <Avatar user={u} size={40} fontSize={18} />
                                </div>
                                {/* Name */}
                                <span style={{ fontWeight: 500, fontSize: 15, flex: 1 }}>
                                    {u.firstName} {u.lastName}
                                </span>
                                {/* Unread badge */}
                                {badge > 0 && (
                                    <div style={{
                                        background: C.primary, color: "#fff",
                                        borderRadius: "50%", minWidth: 20, height: 20,
                                        fontSize: 11, fontWeight: 700,
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        padding: "0 4px", flexShrink: 0,
                                    }}>
                                        {badge > 99 ? "99+" : badge}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>

            {/* ── Main chat area ──────────────────────────────────────────────── */}
            <div style={{ flex: 1, display: isMobile && showSidebar ? "none" : "flex", flexDirection: "column", position: "relative", background: C.chatBg, width: isMobile ? "100%" : undefined }}>

                {/* Header */}
                <div style={{
                    height: 64, background: C.primaryDark, color: "#fff",
                    display: "flex", alignItems: "center", padding: "0 12px",
                    fontWeight: 500, fontSize: 20, boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                    flexShrink: 0, gap: 8,
                }}>
                    {isMobile ? (
                        <button
                            onClick={() => setShowSidebar(true)}
                            style={{
                                background: "rgba(255,255,255,0.15)", color: "#fff",
                                border: "none", borderRadius: "50%", width: 36, height: 36,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                cursor: "pointer", flexShrink: 0,
                            }}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
                                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                            </svg>
                        </button>
                    ) : (
                        <span style={{ fontWeight: 700, marginRight: 8, flexShrink: 0 }}>PayCircle</span>
                    )}
                    {selectedUser && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                            <Avatar user={selectedUser} size={36} fontSize={15} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 16, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedUser.firstName} {selectedUser.lastName}</div>
                                <div style={{ fontSize: 11, color: typingMap[selectedUserId] ? "#bef264" : "#e0e7ff", opacity: 0.9, display: "flex", alignItems: "center", gap: 4 }}>
                                    {typingMap[selectedUserId] ? "typing..." : (presenceMap[selectedUserId]?.status === "ONLINE" ? "Online" : "")}
                                    {myPrivateKey && selectedUserPublicKey && (
                                        <span title="End-to-end encrypted" style={{ marginLeft: 4, fontSize: 10, background: "rgba(255,255,255,0.2)", padding: "1px 5px", borderRadius: 6 }}>
                                            🔒 E2E Encrypted
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {selectedUser && (
                        <button
                            onClick={() => setCallData({ type: "outgoing", targetUser: selectedUser, withVideo: false })}
                            title="Voice call"
                            style={{
                                marginLeft: 16, background: "rgba(255,255,255,0.15)", color: "#fff",
                                border: "none", borderRadius: "50%", width: 36, height: 36,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                cursor: "pointer",
                            }}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
                                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                            </svg>
                        </button>
                    )}
                    {selectedUser && (
                        <button
                            onClick={() => setCallData({ type: "outgoing", targetUser: selectedUser, withVideo: true })}
                            title="Video call"
                            style={{
                                marginLeft: 8, background: "rgba(255,255,255,0.15)", color: "#fff",
                                border: "none", borderRadius: "50%", width: 36, height: 36,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                cursor: "pointer",
                            }}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
                                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                            </svg>
                        </button>
                    )}

                    <button onClick={() => navigate("/dashboard")} title="Dashboard" style={{
                        marginLeft: "auto", background: "#fff", color: C.primaryDark,
                        border: "none", borderRadius: isMobile ? "50%" : 20,
                        padding: isMobile ? 0 : "8px 20px",
                        width: isMobile ? 36 : undefined, height: isMobile ? 36 : undefined,
                        fontWeight: 600, fontSize: 14, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                    }}>
                        {isMobile ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill={C.primaryDark}>
                                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                            </svg>
                        ) : "Dashboard"}
                    </button>
                </div>

                {/* Messages container */}
                <div
                    ref={messagesContainerRef}
                    onScroll={handleScroll}
                    style={{
                        flex: 1, overflowY: "auto", padding: "16px 0",
                        display: "flex", flexDirection: "column",
                    }}
                >
                    {/* Spacer — pushes messages to the bottom when there are few */}
                    <div style={{ flex: 1 }} />

                    {!selectedUser && (
                        <div style={{ textAlign: "center", color: "#888", marginBottom: 40, fontSize: 15 }}>
                            Select a conversation or search for a user
                        </div>
                    )}

                    {decrypting ? (
                        <ChatSkeleton />
                    ) : (
                        decryptedMessages.map((msg, i) => renderMessage(msg, i))
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* ── Scroll-down pill (new messages while scrolled up) ──────── */}
                {unreadScroll > 0 && (
                    <div style={{
                        position: "absolute",
                        bottom: selectedUser ? 80 : 24,
                        right: 24,
                        zIndex: 50,
                    }}>
                        <button
                            onClick={() => scrollToBottom("smooth")}
                            style={{
                                background: C.primary, color: "#fff", border: "none",
                                borderRadius: 20, padding: "8px 16px",
                                fontWeight: 600, fontSize: 13, cursor: "pointer",
                                boxShadow: "0 2px 10px rgba(79,70,229,0.4)",
                                display: "flex", alignItems: "center", gap: 6,
                            }}
                        >
                            ↓ {unreadScroll} new message{unreadScroll > 1 ? "s" : ""}
                        </button>
                    </div>
                )}

                {/* ── Input bar ──────────────────────────────────────────────── */}
                {/* ── AI Assistant Panel ──────────────────────────────────── */}
                {selectedUser && showAiInput && (
                    <div style={{
                        padding: "10px 16px", borderTop: "1px solid #c7d7fd",
                        background: "linear-gradient(135deg, #f5f3ff, #ede9fe)",
                        display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
                    }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1-8.313-12.454z"/>
                            <path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>
                        </svg>
                        <input
                            value={aiInput}
                            onChange={e => setAiInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && sendAiMessage()}
                            placeholder="Ask AI — What's my balance? / Pay ₹200 / Summarize chat"
                            disabled={aiLoading}
                            autoFocus
                            style={{
                                flex: 1, padding: "10px 16px", borderRadius: 24,
                                border: "1.5px solid #c4b5fd", fontSize: 14, outline: "none",
                                background: "#fff", color: "#1e1b4b",
                            }}
                        />
                        <button onClick={sendAiMessage} disabled={aiLoading || !aiInput.trim()} style={{
                            background: aiLoading ? "#aaa" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                            color: "#fff", border: "none", borderRadius: "50%",
                            width: 40, height: 40, cursor: aiLoading ? "not-allowed" : "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                            {aiLoading ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
                                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                                </svg>
                            ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(45deg)", marginLeft: "-2px" }}>
                                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                                </svg>
                            )}
                        </button>
                    </div>
                )}

                {selectedUser && (
                    <div style={{
                        padding: "10px 16px", borderTop: "1px solid #d9d9d9",
                        background: C.inputBar,
                        display: "flex", alignItems: "center", gap: 8,
                        position: "relative", flexShrink: 0,
                    }}>
                        <button onClick={() => { setShowAiInput(v => !v); setShowEmoji(false); }} title="Ask AI" style={{
                            background: showAiInput ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "none",
                            border: "none", cursor: "pointer", padding: "4px 6px",
                            borderRadius: 8, color: showAiInput ? "#fff" : "#6366f1",
                            fontWeight: 700, transition: "all 0.2s",
                            display: "flex", alignItems: "center", justifyContent: "center"
                        }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                                <path d="M5 3v4M3 5h4M21 17v4M19 19h4"/>
                            </svg>
                        </button>

                        <button onClick={() => setShowEmoji(!showEmoji)} style={{
                            background: "none", border: "none",
                            cursor: "pointer", padding: "4px", color: "#666",
                            display: "flex", alignItems: "center", justifyContent: "center"
                        }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
                            </svg>
                        </button>

                        {showEmoji && (
                            <div style={{ position: "absolute", bottom: 60, left: 0, zIndex: 100 }}>
                                <Picker data={data} onEmojiSelect={(emoji) => {
                                    setInput(prev => prev + emoji.native);
                                    setShowEmoji(false);
                                }} />
                            </div>
                        )}

                        <button onClick={() => fileInputRef.current.click()} style={{
                            background: "none", border: "none",
                            cursor: "pointer", padding: "4px", color: "#666",
                            display: "flex", alignItems: "center", justifyContent: "center"
                        }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.51a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                            </svg>
                        </button>
                        <input type="file" ref={fileInputRef} style={{ display: "none" }} onChange={sendFile} />

                        <button onClick={() => setShowPayModal(true)} title="Send Money" style={{
                            background: C.primary, border: "none", borderRadius: "50%",
                            width: 36, height: 36, cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: "#fff", flexShrink: 0,
                            boxShadow: "0 2px 8px rgba(79,70,229,0.3)"
                        }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="18" x2="12" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><path d="M12 9H8.5a1.5 1.5 0 1 0 0 3h7a1.5 1.5 0 1 1 0 3H12"/>
                            </svg>
                        </button>

                        {isRecording ? (
                            <div style={{
                                flex: 1, display: "flex", alignItems: "center", gap: 12,
                                background: "#fff", padding: "8px 16px", borderRadius: 24,
                            }}>
                                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", animation: "pulse 1s infinite" }} />
                                <span style={{ fontSize: 14, fontWeight: 600, color: "#333", flex: 1 }}>
                                    Recording Voice Message... {formatRecTime(recDuration)}
                                </span>
                                <button onClick={cancelRecording} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 13 }}>Cancel</button>
                                <button onClick={stopRecording} style={{ background: C.primary, color: "#fff", border: "none", borderRadius: 12, padding: "5px 12px", cursor: "pointer", fontWeight: 600 }}>Send</button>
                            </div>
                        ) : (
                            <>
                                    <input
                                        value={input}
                                        onChange={e => {
                                            setInput(e.target.value);
                                            handleTyping();
                                        }}
                                        onKeyDown={e => e.key === "Enter" && sendMessage()}
                                        placeholder="Type a message..."
                                    style={{
                                        flex: 1, padding: "10px 18px", borderRadius: 24,
                                        border: "none", fontSize: 15, outline: "none", background: "#fff",
                                    }}
                                />

                                {input.trim() ? (
                                    <button onClick={sendMessage} style={{
                                        background: C.primary, color: "#fff", border: "none",
                                        borderRadius: "50%", width: 42, height: 42,
                                        cursor: "pointer",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        flexShrink: 0,
                                        boxShadow: "0 2px 10px rgba(79,70,229,0.3)"
                                    }}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(45deg)", marginLeft: "-2px" }}>
                                            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                                        </svg>
                                    </button>
                                ) : (
                                    <button onClick={startRecording} style={{
                                        background: "none", color: "#666", border: "none",
                                        width: 42, height: 42, cursor: "pointer",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        flexShrink: 0,
                                    }}>
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                                            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                                        </svg>
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* ── Full Emoji Picker Modal ── */}
            {showFullReactionPicker && (
                <div style={{
                    position: "fixed", inset: 0, zIndex: 2000,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)"
                }} onClick={() => setShowFullReactionPicker(null)}>
                    <div style={{ animation: "fadeInUp 0.15s ease-out" }} onClick={e => e.stopPropagation()}>
                        <Picker 
                            data={data} 
                            onEmojiSelect={(emoji) => {
                                addReaction(showFullReactionPicker, emoji.native);
                                setShowFullReactionPicker(null);
                            }} 
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
