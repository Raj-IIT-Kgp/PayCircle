import {
    BrowserRouter,
    Route,
    Routes,
} from "react-router-dom";
import { Signup } from "./pages/Signup";
import { Signin } from "./pages/Signin";
import { Dashboard } from "./pages/Dashboard";
import { SendMoney } from "./pages/SendMoney";
import { Start } from "./pages/Start.jsx";
import { Update } from "./pages/Update.jsx";
import Transaction from "./pages/Transaction.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import { WebSocketProvider } from "./context/WebSocketContext";

function App() {
    return (
        <BrowserRouter>
            <WebSocketProvider>
                <Routes>
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/signin" element={<Signin />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/send" element={<SendMoney />} />
                    <Route path="/" element={<Start />} />
                    <Route path="/update" element={<Update />} />
                    <Route path="/transaction" element={<Transaction />} />
                    <Route path="/chatpage" element={<ChatPage />} />
                </Routes>
            </WebSocketProvider>
        </BrowserRouter>
    );
}

export default App;