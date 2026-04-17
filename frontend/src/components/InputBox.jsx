export function InputBox({ label, placeholder, value, onChange, type = "text" }) {
    return (
        <div className="flex flex-col mb-4 text-left">
            <label className="text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                {label}
            </label>
            <input
                type={type}
                placeholder={placeholder}
                value={value}
                onChange={onChange}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
            />
        </div>
    );
}
