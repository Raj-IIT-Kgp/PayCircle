import { useState } from "react"
import { BottomWarning } from "../components/BottomWarning"
import { Button } from "../components/Button"
import { Heading } from "../components/Heading"
import { InputBox } from "../components/InputBox"
import { SubHeading } from "../components/SubHeading"
import axios from "axios";
import { useNavigate } from "react-router-dom"
import { initE2EKeys } from "../utils/e2eCrypto";

const backendUrl = import.meta.env.VITE_REACT_APP_BACKEND_URL || "/api/v1";

export const Signup = () => {
    const [step, setStep] = useState(1); // 1 = fill details, 2 = enter OTP
    const [phone, setPhone] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [otp, setOtp] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleRequestOtp = async () => {
        if (!phone || !firstName || !lastName || !password) {
            alert("Phone, name, and password are required");
            return;
        }
        setLoading(true);
        try {
            await axios.post(`${backendUrl}/user/signup/request-otp`, { phone });
            setStep(2);
        } catch (e) {
            alert(e.response?.data?.message || "Failed to send OTP");
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyAndCreate = async () => {
        if (!otp) { alert("Enter the OTP"); return; }
        setLoading(true);
        try {
            const response = await axios.post(`${backendUrl}/user/signup`, {
                phone, otp, firstName, lastName, password,
                email: email || undefined
            });
            const token = response.data.token;
            sessionStorage.setItem("token", token);
            const info = await axios.get(`${backendUrl}/user/info`, { headers: { Authorization: `Bearer ${token}` } });
            await initE2EKeys(info.data.user._id, token, password, backendUrl);
            navigate("/dashboard");
        } catch (e) {
            alert(e.response?.data?.message || "Signup failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-slate-300 min-h-screen flex justify-center py-8 px-4">
            <div className="flex flex-col justify-center w-full max-w-sm">
                <div className="rounded-lg bg-white w-full text-center p-2 h-max px-4">
                    <Heading label={"Sign up"} />
                    <SubHeading label={step === 1 ? "Enter your information to create an account" : "Enter the OTP sent to your phone"} />

                    {step === 1 && (
                        <>
                            <InputBox value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Raj" label={"First Name"} />
                            <InputBox value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Majumder" label={"Last Name"} />
                            <InputBox value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 9876543210" label={"Phone Number"} />
                            <InputBox value={email} onChange={e => setEmail(e.target.value)} placeholder="raj@gmail.com (optional)" label={"Email (optional)"} />
                            <InputBox value={password} onChange={e => setPassword(e.target.value)} placeholder="123456" label={"Password"} type="password" />
                            <div className="pt-4">
                                <Button onClick={handleRequestOtp} label={loading ? "Sending OTP..." : "Send OTP"} />
                            </div>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <p className="text-sm text-gray-500 mb-3">OTP sent to {phone}</p>
                            <InputBox value={otp} onChange={e => setOtp(e.target.value)} placeholder="6-digit OTP" label={"OTP"} />
                            <div className="pt-4">
                                <Button onClick={handleVerifyAndCreate} label={loading ? "Creating account..." : "Verify & Sign up"} />
                            </div>
                            <div className="pt-2">
                                <button className="text-sm text-blue-600 underline" onClick={() => { setStep(1); setOtp(""); }}>
                                    Change number
                                </button>
                            </div>
                        </>
                    )}

                    <BottomWarning label={"Already have an account?"} buttonText={"Sign in"} to={"/signin"} />
                </div>
            </div>
        </div>
    );
}
