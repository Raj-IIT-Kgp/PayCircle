import React, { useState, useEffect, useRef, useCallback } from "react";

const PULSE_CSS = `
@keyframes vcPulse {
  0%   { transform: scale(1);    opacity: 0.45; }
  75%  { transform: scale(1.7);  opacity: 0;    }
  100% { transform: scale(1.7);  opacity: 0;    }
}
.vc-p1 { animation: vcPulse 2.2s ease-out infinite; }
.vc-p2 { animation: vcPulse 2.2s ease-out 0.7s infinite; }
`;

const S = {
    DIALING:   "DIALING",
    RINGING:   "RINGING",
    CONNECTED: "CONNECTED",
    ERROR:     "ERROR",
};

export default function VoiceCall({
    ws, myUser, selectedUser, onCallEnd, isIncoming, initialOffer,
}) {
    const [status,   setStatus]   = useState(isIncoming ? S.RINGING : S.DIALING);
    const [muted,    setMuted]    = useState(false);
    const [duration, setDuration] = useState(0);
    const [errMsg,   setErrMsg]   = useState("");

    const pcRef      = useRef(null);
    const localRef   = useRef(null);
    const audioRef   = useRef(null);
    const timerRef   = useRef(null);
    const startedRef = useRef(false);

    /* ── timer ──────────────────────────────────────────────────────────────── */
    const startTimer = () => {
        clearInterval(timerRef.current);
        timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    };
    const fmtTime = (s) =>
        `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

    /* ── ws helper ──────────────────────────────────────────────────────────── */
    const send = useCallback((payload) => {
        if (ws?.current?.readyState === WebSocket.OPEN)
            ws.current.send(JSON.stringify(payload));
    }, [ws]);

    /* ── cleanup ────────────────────────────────────────────────────────────── */
    const cleanupMedia = useCallback(() => {
        localRef.current?.getTracks().forEach(t => t.stop());
        localRef.current = null;
        pcRef.current?.close();
        pcRef.current = null;
        if (audioRef.current) audioRef.current.srcObject = null;
        clearInterval(timerRef.current);
    }, []);

    const closeCall = useCallback(() => {
        cleanupMedia();
        onCallEnd?.();
    }, [cleanupMedia, onCallEnd]);

    /* ── peer connection ────────────────────────────────────────────────────── */
    const createPC = useCallback(() => {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
            ],
        });
        pc.onicecandidate = (e) => {
            if (e.candidate)
                send({ type: "ice_candidate", to: selectedUser._id, candidate: e.candidate });
        };
        pc.ontrack = (e) => {
            if (audioRef.current) {
                audioRef.current.srcObject = e.streams[0];
                audioRef.current.play().catch(() => {});
            }
        };
        pc.onconnectionstatechange = () => {
            if (["disconnected", "failed", "closed"].includes(pc.connectionState)) closeCall();
        };
        pcRef.current = pc;
        return pc;
    }, [send, selectedUser, closeCall]);

    /* ── mic helper ─────────────────────────────────────────────────────────── */
    const getMic = async () => {
        try {
            const s = await navigator.mediaDevices.getUserMedia({ audio: true });
            localRef.current = s;
            return s;
        } catch (err) {
            const m =
                err.name === "NotAllowedError" ? "Microphone access denied. Allow mic and retry." :
                err.name === "NotFoundError"   ? "No microphone found on this device." :
                                                 `Mic error: ${err.message}`;
            setErrMsg(m);
            setStatus(S.ERROR);
            return null;
        }
    };

    /* ── outgoing ────────────────────────────────────────────────────────────── */
    const startCall = useCallback(async () => {
        const stream = await getMic();
        if (!stream) return;
        try {
            const pc = createPC();
            stream.getTracks().forEach(t => pc.addTrack(t, stream));
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            send({
                type:       "call_offer",
                to:         selectedUser._id,
                offer,
                callerName: `${myUser?.firstName || ""} ${myUser?.lastName || ""}`.trim(),
            });
        } catch (err) {
            setErrMsg("Failed to start call: " + err.message);
            setStatus(S.ERROR);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [createPC, send, selectedUser, myUser]);

    /* ── accept ──────────────────────────────────────────────────────────────── */
    const acceptCall = async () => {
        setStatus(S.CONNECTED);
        const stream = await getMic();
        if (!stream) return;
        try {
            const pc = createPC();
            stream.getTracks().forEach(t => pc.addTrack(t, stream));
            await pc.setRemoteDescription(new RTCSessionDescription(initialOffer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            send({ type: "call_answer", to: selectedUser._id, answer });
            startTimer();
        } catch (err) {
            setErrMsg("Failed to connect: " + err.message);
            setStatus(S.ERROR);
        }
    };

    const declineCall = () => { send({ type: "call_rejected", to: selectedUser._id }); closeCall(); };
    const endCall     = () => { send({ type: "call_ended",    to: selectedUser._id }); closeCall(); };

    const toggleMute = () => {
        if (localRef.current) {
            const next = !muted;
            localRef.current.getAudioTracks().forEach(t => { t.enabled = !next; });
            setMuted(next);
        }
    };

    /* ── init ────────────────────────────────────────────────────────────────── */
    useEffect(() => {
        if (startedRef.current || isIncoming) return;
        startedRef.current = true;
        startCall();
    }, [isIncoming, startCall]);

    /* ── ws signals ──────────────────────────────────────────────────────────── */
    useEffect(() => {
        if (!ws?.current) return;
        const handle = (ev) => {
            let d; try { d = JSON.parse(ev.data); } catch { return; }
            if (d.type === "call_answer" && pcRef.current) {
                setStatus(S.CONNECTED);
                pcRef.current.setRemoteDescription(new RTCSessionDescription(d.answer)).catch(console.error);
                startTimer();
            } else if (d.type === "ice_candidate" && pcRef.current) {
                pcRef.current.addIceCandidate(new RTCIceCandidate(d.candidate)).catch(() => {});
            } else if (d.type === "call_rejected") {
                setErrMsg("Call declined.");
                setStatus(S.ERROR);
                cleanupMedia();
            } else if (d.type === "call_ended") {
                closeCall();
            }
        };
        ws.current.addEventListener("message", handle);
        return () => ws.current?.removeEventListener("message", handle);
    }, [ws, cleanupMedia, closeCall]);

    useEffect(() => () => cleanupMedia(), [cleanupMedia]);

    /* ── derived ─────────────────────────────────────────────────────────────── */
    const initials = ((selectedUser?.firstName?.[0] || "") + (selectedUser?.lastName?.[0] || "")).toUpperCase() || "?";
    const name     = `${selectedUser?.firstName || ""} ${selectedUser?.lastName || ""}`.trim() || "Unknown";
    const pulsing  = status === S.DIALING || status === S.RINGING;

    /* ── render ──────────────────────────────────────────────────────────────── */
    return (
        <>
            <style>{PULSE_CSS}</style>

            {/* Full-screen overlay */}
            <div style={{
                position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                zIndex: 9999,
                background: "linear-gradient(180deg, #1a1035 0%, #2d1f6e 45%, #1a1035 100%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                color: "#fff",
                fontFamily: "system-ui, -apple-system, sans-serif",
                overflow: "hidden",
                userSelect: "none",
            }}>

                {/* ── Top bar ─────────────────────────────────────────────────── */}
                <div style={{
                    width: "100%", padding: "52px 24px 0",
                    textAlign: "center",
                }}>
                    <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>
                        {status === S.RINGING   ? "Incoming call"  :
                         status === S.DIALING   ? "PayCircle call" :
                         status === S.CONNECTED ? "PayCircle call" : "Call ended"}
                    </div>
                </div>

                {/* ── Avatar section ──────────────────────────────────────────── */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>

                    {/* Avatar + pulse rings */}
                    <div style={{ position: "relative", width: 140, height: 140, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {pulsing && (
                            <>
                                <div className="vc-p1" style={{ position: "absolute", inset: -14, borderRadius: "50%", background: "rgba(124,58,237,0.25)", pointerEvents: "none" }} />
                                <div className="vc-p2" style={{ position: "absolute", inset: -14, borderRadius: "50%", background: "rgba(124,58,237,0.2)",  pointerEvents: "none" }} />
                            </>
                        )}
                        <div style={{
                            width: 120, height: 120, borderRadius: "50%",
                            background: "linear-gradient(135deg, #6d28d9, #4f46e5)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 46, fontWeight: 700, color: "#fff",
                            boxShadow: status === S.CONNECTED
                                ? "0 0 0 4px rgba(99,102,241,0.5), 0 8px 40px rgba(99,102,241,0.4)"
                                : "0 8px 32px rgba(0,0,0,0.4)",
                            position: "relative", zIndex: 1,
                            transition: "box-shadow 0.4s",
                        }}>
                            {initials}
                        </div>
                    </div>

                    {/* Name */}
                    <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: -0.5, marginBottom: 10 }}>
                            {name}
                        </div>

                        {/* Status / Timer */}
                        <div style={{ fontSize: 17, color: "rgba(255,255,255,0.6)", minHeight: 26, fontVariantNumeric: "tabular-nums" }}>
                            {status === S.DIALING   && "Calling…"}
                            {status === S.RINGING   && "Incoming call…"}
                            {status === S.CONNECTED && <span style={{ color: "#a5f3a5", fontWeight: 600 }}>{fmtTime(duration)}</span>}
                            {status === S.ERROR     && <span style={{ color: "#fca5a5" }}>{errMsg}</span>}
                        </div>
                    </div>
                </div>

                {/* ── Controls ────────────────────────────────────────────────── */}
                <div style={{ width: "100%", paddingBottom: 56 }}>

                    {/* Mute + Speaker row (only when dialing or connected) */}
                    {(status === S.DIALING || status === S.CONNECTED) && (
                        <div style={{ display: "flex", justifyContent: "center", gap: 52, marginBottom: 40 }}>
                            <CtrlBtn
                                icon={muted ? <MicOffSVG /> : <MicSVG />}
                                label={muted ? "Unmute" : "Mute"}
                                active={muted}
                                onClick={toggleMute}
                            />
                            <CtrlBtn
                                icon={<SpeakerSVG />}
                                label="Speaker"
                                active={false}
                                onClick={() => {}}
                            />
                            <CtrlBtn
                                icon={<KeypadSVG />}
                                label="Keypad"
                                active={false}
                                onClick={() => {}}
                            />
                        </div>
                    )}

                    {/* Main call buttons */}
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 56 }}>
                        {status === S.RINGING ? (
                            <>
                                {/* Decline */}
                                <CallBtn bg="#ef4444" label="Decline" onClick={declineCall} size={72}>
                                    <EndSVG size={30} />
                                </CallBtn>
                                {/* Accept */}
                                <CallBtn bg="#22c55e" label="Accept" onClick={acceptCall} size={72}>
                                    <PhoneSVG size={30} />
                                </CallBtn>
                            </>
                        ) : status === S.ERROR ? (
                            <CallBtn bg="#4b5563" label="Close" onClick={closeCall} size={72}>
                                <CloseSVG />
                            </CallBtn>
                        ) : (
                            <CallBtn
                                bg="#ef4444"
                                label={status === S.DIALING ? "Cancel" : "End call"}
                                onClick={endCall}
                                size={72}
                            >
                                <EndSVG size={30} />
                            </CallBtn>
                        )}
                    </div>
                </div>

            </div>

            {/* Hidden remote audio */}
            <audio ref={audioRef} autoPlay playsInline style={{ display: "none" }} />
        </>
    );
}

/* ── Shared button components ─────────────────────────────────────────────── */

function CallBtn({ bg, label, onClick, size = 64, children }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <button
                onClick={onClick}
                style={{
                    width: size, height: size, borderRadius: "50%",
                    background: bg, border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: `0 4px 20px ${bg}66`,
                    transition: "transform 0.12s",
                    outline: "none",
                }}
                onMouseDown={e => { e.currentTarget.style.transform = "scale(0.91)"; }}
                onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
                onTouchStart={e => { e.currentTarget.style.transform = "scale(0.91)"; }}
                onTouchEnd={e => { e.currentTarget.style.transform = "scale(1)"; }}
            >
                {children}
            </button>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", letterSpacing: 0.2 }}>{label}</span>
        </div>
    );
}

function CtrlBtn({ icon, label, active, onClick }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <button
                onClick={onClick}
                style={{
                    width: 56, height: 56, borderRadius: "50%", border: "none",
                    background: active ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.12)",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.15s",
                    outline: "none",
                }}
            >
                {icon}
            </button>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{label}</span>
        </div>
    );
}

/* ── SVG icons ────────────────────────────────────────────────────────────── */
function PhoneSVG({ size = 26 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff">
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.58.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C10.6 21 3 13.4 3 4c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.24 1.01L6.6 10.8z"/>
        </svg>
    );
}
function EndSVG({ size = 26 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff" style={{ transform: "rotate(135deg)" }}>
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.58.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C10.6 21 3 13.4 3 4c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.24 1.01L6.6 10.8z"/>
        </svg>
    );
}
function MicSVG() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
        </svg>
    );
}
function MicOffSVG() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff">
            <path d="M19 11c0 1.19-.34 2.3-.9 3.28l-1.23-1.23c.27-.62.43-1.31.43-2.05H19zm-7 7c-2.76 0-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V22h2v-3.08c.55-.08 1.08-.22 1.58-.43l-1.46-1.46c-.36.1-.74.17-1.12.17zm7.19 3.19L4.27 4.27 3 5.54l4.36 4.36C7.13 10.28 7 10.62 7 11H5c0 3.53 2.61 6.43 6 6.92V22h2v-3.08c1.07-.15 2.07-.6 2.89-1.26L18.46 21 19.73 19.73zM12 4c1.66 0 3 1.34 3 3v.37L9.37 1.74C10.12 1.29 11.03 1 12 1c3.31 0 6 2.69 6 6v6c0 .29-.02.58-.07.86l-1.74-1.74C16.18 11.74 16 11.38 16 11V7c0-2.21-1.79-4-4-4z"/>
        </svg>
    );
}
function SpeakerSVG() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
        </svg>
    );
}
function KeypadSVG() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff">
            <path d="M3 17h2v2H3v-2zm4 0h2v2H7v-2zm4 0h2v2h-2v-2zm-8-4h2v2H3v-2zm4 0h2v2H7v-2zm4 0h2v2h-2v-2zm-8-4h2v2H3V9zm4 0h2v2H7V9zm4 0h2v2h-2V9zm-8-4h2v2H3V5zm4 0h2v2H7V5zm4 0h2v2h-2V5zm4 4h2v2h-2V9zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2zm0-12h2v2h-2V5z"/>
        </svg>
    );
}
function CloseSVG() {
    return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
    );
}
