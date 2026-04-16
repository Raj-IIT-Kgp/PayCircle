import { Link } from "react-router-dom";

export function BottomWarning({ label, buttonText, to }) {
    return (
        <p className="mt-5 text-sm text-slate-500 text-center">
            {label}{" "}
            <Link to={to} className="font-semibold text-indigo-600 hover:text-indigo-700 transition-colors">
                {buttonText}
            </Link>
        </p>
    );
}
