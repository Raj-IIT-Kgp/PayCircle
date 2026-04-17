import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { InputBox } from "../components/InputBox.jsx";
import { useNavigate } from "react-router-dom";
import { FaCamera } from "react-icons/fa"; // install react-icons if not present
import { Appbar } from "../components/Appbar.jsx"; // Import Appbar
import imageCompression from "browser-image-compression";

export const Update = () => {
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [password, setPassword] = useState("");
    const [profileImage, setProfileImage] = useState("");
    const navigate = useNavigate();
    const fileInputRef = useRef();

    useEffect(() => {
        const fetchUser = async () => {
            const token = sessionStorage.getItem("token");
            const backendUrl = import.meta.env.VITE_REACT_APP_BACKEND_URL;
            try {
                const response = await axios.get(`${backendUrl}/user/info`, {
                    headers: { Authorization: "Bearer " + token }
                });
                console.log("User info response:", response.data); // Debug
                if (response.data && response.data.user) {
                    setFirstName(response.data.user.firstName || "");
                    setLastName(response.data.user.lastName || "");
                    setProfileImage(response.data.user.profileImage || "");
                    setPassword((response.data.user.password || ""));
                } else {
                    alert("User data not found in response");
                }
            } catch (e) {
                alert("Failed to fetch user info");
                console.error(e);
            }
        };
        fetchUser();
    }, []);

    const handleImageChange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            // Compress the image
            const options = {
                maxSizeMB: 0.1, // Target size (e.g., 100KB)
                maxWidthOrHeight: 300, // Resize to max 300px
                useWebWorker: true
            };
            try {
                const compressedFile = await imageCompression(file, options);
                const reader = new FileReader();
                reader.onloadend = () => setProfileImage(reader.result);
                reader.readAsDataURL(compressedFile);
            } catch (error) {
                alert("Image compression failed");
            }
        }
    };

    const handleCameraClick = () => {
        fileInputRef.current.click();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!firstName && !lastName && !password && !profileImage) {
            alert("Please enter at least one field to update");
            return;
        }
        const token = sessionStorage.getItem("token");
        const backendUrl = import.meta.env.VITE_REACT_APP_BACKEND_URL;
        try {
            const response = await axios.put(
                `${backendUrl}/user/update`,
                { firstName, lastName, password, profileImage },
                { headers: { Authorization: "Bearer " + token } }
            );
            if (response.data.message) {
                alert(response.data.message);
                navigate("/dashboard"); // Navigate after success
            }
        } catch {
            alert("Error while updating information");
        }
    };

    return (
        <div className="min-h-screen bg-gray-100">
            <Appbar />
        <div className="flex justify-center items-start px-4 py-8">
            <div className="max-w-md w-full p-6 bg-white rounded shadow-xl">
                <h2 className="text-2xl font-bold mb-4">Update Profile</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="firstName" className="block text-gray-700">First Name:</label>
                        <InputBox
                            type="text"
                            id="firstName"
                            value={firstName}
                            onChange={e => setFirstName(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring focus:ring-emerald-200 focus:ring-opacity-50"
                        />
                    </div>
                    <div>
                        <label htmlFor="lastName" className="block text-gray-700">Last Name:</label>
                        <InputBox
                            type="text"
                            id="lastName"
                            value={lastName}
                            onChange={e => setLastName(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring focus:ring-emerald-200 focus:ring-opacity-50"
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="block text-gray-700">Password:</label>
                        <InputBox
                            type="password"
                            id="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring focus:ring-emerald-200 focus:ring-opacity-50"
                        />
                    </div>
                    <div>
                        <label className="block text-gray-700">Profile Image:</label>
                        <div className="relative w-20 h-20 mt-2">
                            <img
                                src={profileImage}
                                alt="Preview"
                                className="w-20 h-20 object-cover rounded-full border"
                            />
                            <button
                                type="button"
                                onClick={handleCameraClick}
                                className="absolute bottom-0 right-0 bg-white rounded-full p-1 border shadow"
                                style={{ lineHeight: 0 }}
                                tabIndex={-1}
                            >
                                <FaCamera size={18} />
                            </button>
                            <input
                                type="file"
                                accept="image/*"
                                ref={fileInputRef}
                                onChange={handleImageChange}
                                className="hidden"
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        className="w-full px-3 py-2 text-white bg-emerald-600 rounded hover:bg-emerald-500 focus:outline-none focus:ring focus:ring-emerald-200 focus:ring-opacity-50"
                    >
                        Update
                    </button>
                </form>
                <button
                    onClick={() => navigate("/dashboard")}
                    className="w-full mt-2 px-3 py-2 text-white bg-gray-500 rounded hover:bg-gray-600 focus:outline-none focus:ring focus:ring-gray-200 focus:ring-opacity-50"
                >
                    Go Back
                </button>
            </div>
        </div>
        </div>
    );
};