import { Balance } from "../components/Balance";
import { Users } from "../components/Users";
import { Appbar } from "../components/Appbar.jsx";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button.jsx";

export const Dashboard = () => {
    const [balance, setBalance] = useState(0);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchBalance = async () => {
            const token = sessionStorage.getItem("token");
            try {
                const backendUrl = import.meta.env.VITE_REACT_APP_BACKEND_URL || "/api/v1";
                const response = await fetch(`${backendUrl}/account/balance`, {
                    headers: {
                        Authorization: "Bearer " + token
                    }
                });
                if (response.status === 200) {
                    const data = await response.json();
                    setBalance(Number(data.balance).toFixed(2));
                } else {
                    console.log("Error in fetching balance");
                }
            } catch (error) {
                console.error("Error:", error);
            }
        };
        fetchBalance();
    }, []);

    const handleLoginToAnotherAccount = () => {
        navigate("/signin");
    };

    return (
        <div className="bg-gradient-to-br from-blue-50 to-emerald-100 min-h-screen">
            <Appbar />
            <div className="container mx-auto mt-10 px-4">
                <h1 className="text-3xl font-bold text-center text-emerald-700 mb-10 drop-shadow">
                    Dashboard
                </h1>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-white shadow-lg rounded-xl p-8 transition-transform hover:scale-105">
                        <h2 className="text-xl font-semibold mb-6 text-emerald-600">Account Balance</h2>
                        <Balance value={balance} />
                    </div>
                    <div className="bg-white shadow-lg rounded-xl p-8 transition-transform hover:scale-105">
                        <h2 className="text-xl font-semibold mb-6 text-emerald-600">Users</h2>
                        <Users />
                    </div>
                </div>

            </div>
        </div>
    );
};