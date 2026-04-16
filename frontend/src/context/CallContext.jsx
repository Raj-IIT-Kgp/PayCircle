import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useWebSocket } from "./WebSocketContext";
import VoiceCall from "../components/VoiceCall";

const API_URL = import.meta.env.VITE_REACT_APP_BACKEND_URL || "/api/v1";
const CallContext = createContext(null);

export function CallProvider({ children }) {
    const { ws, wsVersion } = useWebSocket();
    const [callData, setCallData] = useState(null);
    const [myUser, setMyUser] = useState(null);

    // Use a ref so the WS listener never needs callData in its dep array
    const callDataRef = useRef(callData);
    useEffect(() => { callDataRef.current = callData; }, [callData]);

    const token = sessionStorage.getItem("token");

    // Fetch current user info once (shared with ChatPage via context)
    useEffect(() => {
        if (!token) return;
        fetch(`${API_URL}/user/info`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(d => { if (d.user) setMyUser(d.user); })
            .catch(console.error);
    }, [token]);

    // Global WS listener — picks up incoming calls regardless of which page is open
    useEffect(() => {
        if (!ws?.current) return;
        const socket = ws.current;

        const handle = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === "call_offer" && !callDataRef.current) {
                    const parts = (msg.callerName || "").split(" ");
                    setCallData({
                        type:      "incoming",
                        offer:     msg.offer,
                        withVideo: !!msg.withVideo,
                        targetUser: {
                            _id:       msg.from,
                            firstName: parts[0] || "Caller",
                            lastName:  parts.slice(1).join(" ") || "",
                        }
                    });
                }
            } catch { /* ignore */ }
        };

        socket.addEventListener("message", handle);
        return () => socket.removeEventListener("message", handle);
    }, [ws, wsVersion]);

    return (
        <CallContext.Provider value={{ callData, setCallData, myUser, setMyUser }}>
            {children}
            {callData && (
                <VoiceCall
                    ws={ws}
                    myUser={myUser}
                    selectedUser={callData.targetUser}
                    initialOffer={callData.offer}
                    isIncoming={callData.type === "incoming"}
                    withVideo={callData.withVideo || false}
                    onCallEnd={() => setCallData(null)}
                />
            )}
        </CallContext.Provider>
    );
}

export const useCall = () => useContext(CallContext);
