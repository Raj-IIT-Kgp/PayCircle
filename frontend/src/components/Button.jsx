export const Button = ({ onClick, label, variant = "primary", className = "", disabled = false }) => {
    const base = "w-full font-semibold rounded-xl text-sm px-5 py-3 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2";
    const variants = {
        primary: "bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500 shadow-sm",
        secondary: "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 focus:ring-slate-300 shadow-sm",
        ghost: "bg-transparent hover:bg-slate-100 text-slate-600 focus:ring-slate-300",
        danger: "bg-red-500 hover:bg-red-600 text-white focus:ring-red-400 shadow-sm",
    };
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`${base} ${variants[variant] || variants.primary} ${className}`}
        >
            {label}
        </button>
    );
};
