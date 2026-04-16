import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

const WebSocketContext = createContext(null);

export const WebSocketProvider = ({ children }) => {
    const ws = useRef(null);
    // Increments every time a new connection is successfully opened.
    // Consumers add this to their effect deps so listeners re-attach after reconnects.
    const [wsVersion, setWsVersion] = useState(0);

    const location = useLocation();
    const [token, setToken] = useState(sessionStorage.getItem("token"));

    useEffect(() => {
        setToken(sessionStorage.getItem("token"));
    }, [location]);

    useEffect(() => {
        if (!token) {
            console.log("No token found, skipping WebSocket connection");
            return;
        }

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const url = `${protocol}//${window.location.host}/ws?token=${token}`;

        const connect = () => {
            if (ws.current?.readyState === WebSocket.OPEN) return;

            console.log("🔄 Connecting to WebSocket...");
            ws.current = new WebSocket(url);

            ws.current.onopen = () => {
                console.log("✅ WebSocket connected");
                // Signal consumers to re-attach their event listeners to this new socket
                setWsVersion(v => v + 1);
            };

            ws.current.onerror = (err) => {
                console.error("❌ WebSocket error:", err);
            };

            ws.current.onclose = (e) => {
                if (e.code !== 1000) { // Not normal closure
                    console.warn(`⚠️ WebSocket disconnected (${e.code}), retrying in 3s...`);
                    setTimeout(connect, 3000);
                } else {
                    console.log("🔌 WebSocket closed normally");
                }
            };
        };

        connect();

        return () => {
            if (ws.current) {
                ws.current.close(1000); // Normal closure
            }
        };
    }, [token]);

    return (
        <WebSocketContext.Provider value={{ ws, wsVersion }}>
            {children}
        </WebSocketContext.Provider>
    );
};

export const useWebSocket = () => useContext(WebSocketContext);
