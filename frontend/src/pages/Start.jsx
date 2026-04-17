import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button.jsx";

export function Start() {
    const navigate = useNavigate();

    function change() {
        navigate("/signup");
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <div className="max-w-md p-8 space-y-4 bg-white rounded-lg shadow-xl text-center">
                <h1 className="text-3xl font-bold">Welcome to the Money Sharing App</h1>
                <p className="text-lg text-gray-700">A simple and secure way to share money with your friends and family.</p>
                <p className="text-gray-600">Get started today and experience hassle-free money transfers!</p>
                <Button onClick={change} label="Get Started" className="w-full px-4 py-2 text-white bg-emerald-600 rounded-md hover:bg-emerald-500 focus:outline-none focus:ring focus:ring-emerald-200 focus:ring-opacity-50" />
                <p className="text-sm text-gray-500 mt-2">Already have an account? <span className="text-emerald-600 cursor-pointer" onClick={() => navigate("/signin")}>Log in here</span></p>
            </div>
        </div>
    );
}
