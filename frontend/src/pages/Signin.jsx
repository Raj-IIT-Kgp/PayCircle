import { useState } from "react";
import { BottomWarning } from "../components/BottomWarning";
import { Button } from "../components/Button";
import { Heading } from "../components/Heading";
import { InputBox } from "../components/InputBox";
import { SubHeading } from "../components/SubHeading";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const backendUrl = import.meta.env.VITE_REACT_APP_BACKEND_URL || "/api/v1";

export const Signin = () => {
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [otpMode, setOtpMode] = useState(false);
    const [otpSent, setOtpSent] = useState(false);
    const [otp, setOtp] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handlePasswordSignin = async () => {
        setLoading(true);
        try {
            const response = await axios.post(`${backendUrl}/user/signin`, { phone, password });
            sessionStorage.setItem("token", response.data.token);
            navigate("/dashboard");
        } catch (e) {
            alert(e.response?.data?.message || "Sign in failed");
        } finally {
            setLoading(false);
        }
    };

    const handleRequestOtp = async () => {
        setLoading(true);
        try {
            await axios.post(`${backendUrl}/user/signin/request-otp`, { phone });
            setOtpSent(true);
        } catch (e) {
            alert(e.response?.data?.message || "Failed to send OTP");
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async () => {
        setLoading(true);
        try {
            const response = await axios.post(`${backendUrl}/user/signin/verify-otp`, { phone, otp });
            sessionStorage.setItem("token", response.data.token);
            navigate("/dashboard");
        } catch (e) {
            alert(e.response?.data?.message || "Invalid or expired OTP");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-slate-300 min-h-screen flex justify-center py-8 px-4">
            <div className="flex flex-col justify-center w-full max-w-sm">
                <div className="rounded-lg bg-white w-full text-center p-2 h-max px-4">
                    <Heading label={"Sign in"} />
                    <SubHeading label={"Enter your credentials to access your account"} />

                    <InputBox onChange={e => setPhone(e.target.value)} placeholder="+91 9876543210" label={"Phone Number"} />

                    {!otpMode && (
                        <>
                            <InputBox onChange={e => setPassword(e.target.value)} placeholder="123456" label={"Password"} type="password" />
                            <div className="pt-4">
                                <Button onClick={handlePasswordSignin} label={loading ? "Signing in..." : "Sign in with Password"} />
                            </div>
                            <div className="pt-2">
                                <Button onClick={() => setOtpMode(true)} label={"Sign in with OTP"} />
                            </div>
                        </>
                    )}

                    {otpMode && (
                        <>
                            {!otpSent ? (
                                <div className="pt-4">
                                    <Button onClick={handleRequestOtp} label={loading ? "Sending OTP..." : "Send OTP to Phone"} />
                                    <div className="pt-2">
                                        <button className="text-sm text-blue-600 underline" onClick={() => setOtpMode(false)}>
                                            Back to Password Login
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <p className="text-sm text-gray-500 mt-2">OTP sent to {phone}</p>
                                    <InputBox onChange={e => setOtp(e.target.value)} placeholder="6-digit OTP" label={"OTP"} />
                                    <div className="pt-4">
                                        <Button onClick={handleVerifyOtp} label={loading ? "Verifying..." : "Verify OTP & Sign in"} />
                                    </div>
                                    <div className="pt-2">
                                        <button className="text-sm text-blue-600 underline" onClick={() => { setOtpSent(false); setOtp(""); }}>
                                            Resend OTP
                                        </button>
                                    </div>
                                </>
                            )}
                        </>
                    )}

                    <BottomWarning label={"Don't have an account?"} buttonText={"Sign up"} to={"/signup"} />
                </div>
            </div>
        </div>
    );
};
