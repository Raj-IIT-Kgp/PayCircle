export const Balance = ({ value }) => {
    return (
        <div className="bg-gradient-to-br from-emerald-600 to-violet-700 rounded-2xl p-6 text-white">
            <p className="text-sm font-medium text-emerald-200 mb-1">Available Balance</p>
            <p className="text-4xl font-bold tracking-tight">
                ₹{Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-emerald-300 mt-2">PayCircle Wallet</p>
        </div>
    );
};
