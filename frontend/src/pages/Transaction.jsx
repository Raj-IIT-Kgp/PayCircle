import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from "react-router-dom";
import { Appbar } from "../components/Appbar.jsx";

function Transactions() {
    const [transactions, setTransactions] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchTransactions = async () => {
            try {
                const res = await axios.get('/api/v1/account/transactions', {
                    headers: {
                        'Authorization': `Bearer ${sessionStorage.getItem('token')}`
                    }
                });
                setTransactions(res.data);
            } catch (error) {
                console.error('Error fetching transactions:', error);
            }
        };

        fetchTransactions();
    }, []);

    return (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
            <Appbar />
            <div className="container mx-auto mt-10 px-4">
                <h1 className="text-3xl font-bold text-center text-indigo-700 mb-10 drop-shadow">
                    Transactions
                </h1>
                <div className="bg-white shadow-lg rounded-xl overflow-hidden">
                    {/* Mobile card view */}
                    <div className="sm:hidden divide-y divide-gray-100">
                        {transactions.map((transaction, index) => (
                            <div key={index} className="px-4 py-4">
                                <div className="flex justify-between items-start">
                                    <div className="min-w-0 mr-3">
                                        <p className="text-xs text-gray-400 mb-0.5">From</p>
                                        <p className="text-sm font-semibold text-gray-800 truncate">{transaction.fromFullName}</p>
                                        <p className="text-xs text-gray-400 mt-2 mb-0.5">To</p>
                                        <p className="text-sm text-gray-700 truncate">{transaction.toFullName}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <span className={`text-base font-bold ${transaction.amount > 0 ? "text-green-500" : "text-red-500"}`}>
                                            ₹{transaction.amount}
                                        </span>
                                        <p className="text-xs text-gray-400 mt-1">{new Date(transaction.date).toLocaleDateString()}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {/* Desktop table view */}
                    <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full table-auto">
                            <thead>
                                <tr className="bg-indigo-50 text-indigo-600 uppercase text-sm">
                                    <th className="py-3 px-4 text-left">From</th>
                                    <th className="py-3 px-4 text-left">To</th>
                                    <th className="py-3 px-4 text-center">Amount</th>
                                    <th className="py-3 px-4 text-center">Date</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-700">
                                {transactions.map((transaction, index) => (
                                    <tr key={index} className="border-b border-gray-200 hover:bg-blue-50 transition-colors">
                                        <td className="py-3 px-4">{transaction.fromFullName}</td>
                                        <td className="py-3 px-4">{transaction.toFullName}</td>
                                        <td className="py-3 px-4 text-center">
                                            <span className={transaction.amount > 0 ? "text-green-500" : "text-red-500"}>
                                                {transaction.amount}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-center">{new Date(transaction.date).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="text-center py-4">
                        <button onClick={() => navigate("/dashboard")}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50">
                            Go to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Transactions;
