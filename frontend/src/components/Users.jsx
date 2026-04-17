import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const AVATAR_COLORS = [
    "bg-violet-500", "bg-emerald-500", "bg-sky-500",
    "bg-emerald-500", "bg-amber-500", "bg-rose-500",
];

function avatarColor(name = "") {
    let hash = 0;
    for (let c of name) hash = c.charCodeAt(0) + hash;
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export const Users = () => {
    const [users, setUsers] = useState([]);
    const [filter, setFilter] = useState("");

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const token = sessionStorage.getItem("token");
                const backendUrl = import.meta.env.VITE_REACT_APP_BACKEND_URL || "/api/v1";
                const response = await axios.get(`${backendUrl}/user/bulk?filter=${filter}`, {
                    headers: { Authorization: "Bearer " + token }
                });
                setUsers(Array.isArray(response.data.users) ? response.data.users : []);
            } catch {
                setUsers([]);
            }
        };
        fetchUsers();
    }, [filter]);

    return (
        <div>
            {/* Search */}
            <div className="relative mb-4">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    onChange={(e) => setFilter(e.target.value)}
                    type="text"
                    placeholder="Search by name or phone..."
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                />
            </div>

            {/* User list */}
            <div className="space-y-2">
                {users.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-6">No users found</p>
                )}
                {users.map(user => <UserRow key={user._id} user={user} />)}
            </div>
        </div>
    );
};

function UserRow({ user }) {
    const navigate = useNavigate();
    const initials = ((user.firstName?.[0] || "") + (user.lastName?.[0] || "")).toUpperCase();
    const color = avatarColor(user.firstName);

    return (
        <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors group">
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center text-white text-sm font-bold shrink-0 overflow-hidden`}>
                    {user.profileImage
                        ? <img src={user.profileImage} alt="Profile" className="w-full h-full object-cover" />
                        : initials || "?"
                    }
                </div>
                <div>
                    <p className="text-sm font-semibold text-slate-800">{user.firstName} {user.lastName}</p>
                    {user.phone && <p className="text-xs text-slate-400">{user.phone}</p>}
                </div>
            </div>
            <div className="flex gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button
                    onClick={() => navigate(`/chatpage?id=${user._id}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    Message
                </button>
                <button
                    onClick={() => navigate(`/send?id=${user._id}&name=${user.firstName}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                >
                    <span>₹</span>
                    Send
                </button>
            </div>
        </div>
    );
}
