import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from "axios";
import { useState } from 'react';

export const SendMoney = () => {
    const [searchParams] = useSearchParams();
    const id = searchParams.get("id");
    const name = searchParams.get("name");
    const [amount, setAmount] = useState(0);
    const navigate = useNavigate();

    return (
        <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-8">
            <div className="max-w-md w-full p-6 bg-white rounded-xl shadow-lg">
                <h2 className="text-3xl font-bold text-center mb-6 text-indigo-700">Send Money</h2>
                <div className="flex items-center space-x-4 mb-6">
                    <div className="w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center">
                        <span className="text-2xl text-white">{name[0].toUpperCase()}</span>
                    </div>
                    <h3 className="text-2xl font-semibold">{name}</h3>
                </div>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="amount" className="text-sm font-medium">
                            Amount (in Rs)
                        </label>
                        <input
                            onChange={(e) => setAmount(e.target.value)}
                            type="number"
                            id="amount"
                            placeholder="Enter amount"
                            className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring focus:ring-blue-500"
                        />
                    </div>
                    <button
                        onClick={async () => {
                            try {
                                const response = await axios.post("/api/v1/account/transfer", {
                                    to: id,
                                    amount
                                }, {
                                    headers: {
                                        Authorization: "Bearer " + sessionStorage.getItem("token")
                                    }
                                })
                                alert(response.data.message);
                            } catch (error) {
                                    alert('An error occurred while trying to send money');
                                }
                            }
                        }
                        className="w-full h-10 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring focus:ring-indigo-500"
                    >
                        Initiate Transfer
                    </button>
                    <button
                        onClick={() => navigate("/dashboard")}
                        className="w-full h-10 px-4 py-2 text-sm font-medium text-white bg-gray-500 rounded-md hover:bg-gray-600 focus:outline-none focus:ring focus:ring-gray-500"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        </div>
    );
};
