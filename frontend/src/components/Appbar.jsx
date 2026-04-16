import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";

export const Appbar = () => {
    const [name, setName] = useState("");
    const [profileImage, setProfileImage] = useState("");
    const [menuOpen, setMenuOpen] = useState(false);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const menuRef = useRef();

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const token = sessionStorage.getItem("token");
                const backendUrl = import.meta.env.VITE_REACT_APP_BACKEND_URL || "/api/v1";
                const response = await axios.get(`${backendUrl}/user/info`, {
                    headers: { Authorization: "Bearer " + token }
                });
                if (response.status === 200 && response.data.user) {
                    setName(response.data.user.firstName);
                    setProfileImage(response.data.user.profileImage);
                }
            } catch (error) {
                console.error("Error fetching user info:", error);
            }
        };
        fetchUser();
    }, []);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
        };
        if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [menuOpen]);

    const navLinks = [
        { label: "Dashboard", path: "/dashboard" },
        { label: "Messages", path: "/chatpage" },
        { label: "Transactions", path: "/transaction" },
    ];

    const isActive = (path) => location.pathname === path;

    return (
        <nav className="bg-white border-b border-slate-200 sticky top-0 z-40">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-6">
                {/* Logo */}
                <button
                    onClick={() => navigate("/dashboard")}
                    className="flex items-center gap-2 font-bold text-lg text-indigo-600 shrink-0"
                >
                    <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">
                        P
                    </div>
                    PayCircle
                </button>

                {/* Nav links */}
                <div className="hidden sm:flex items-center gap-1 flex-1">
                    {navLinks.map(link => (
                        <button
                            key={link.path}
                            onClick={() => navigate(link.path)}
                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                isActive(link.path)
                                    ? "bg-indigo-50 text-indigo-700"
                                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                            }`}
                        >
                            {link.label}
                        </button>
                    ))}
                </div>

                <div className="flex-1 sm:hidden" />

                {/* Hamburger – mobile only */}
                <button
                    onClick={() => setMobileNavOpen(o => !o)}
                    className="sm:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 mr-1"
                >
                    {mobileNavOpen ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    )}
                </button>

                {/* Profile */}
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={() => setMenuOpen(o => !o)}
                        className="flex items-center gap-2 focus:outline-none"
                    >
                        <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold overflow-hidden ring-2 ring-indigo-100">
                            {profileImage
                                ? <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                                : (name.charAt(0) || "U").toUpperCase()
                            }
                        </div>
                        <span className="hidden sm:block text-sm font-medium text-slate-700">{name}</span>
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {menuOpen && (
                        <div className="absolute right-0 top-12 w-44 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50">
                            <button
                                onClick={() => { setMenuOpen(false); navigate("/update"); }}
                                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                Edit Profile
                            </button>
                            <div className="border-t border-slate-100 my-1" />
                            <button
                                onClick={() => { sessionStorage.removeItem("token"); navigate("/signin"); }}
                                className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                                Sign Out
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Mobile nav dropdown */}
            {mobileNavOpen && (
                <div className="sm:hidden border-t border-slate-100 bg-white px-4 py-3 space-y-1">
                    {navLinks.map(link => (
                        <button
                            key={link.path}
                            onClick={() => { navigate(link.path); setMobileNavOpen(false); }}
                            className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                isActive(link.path)
                                    ? "bg-indigo-50 text-indigo-700"
                                    : "text-slate-600 hover:bg-slate-100"
                            }`}
                        >
                            {link.label}
                        </button>
                    ))}
                </div>
            )}
        </nav>
    );
};
