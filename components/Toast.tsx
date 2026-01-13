import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'ok' | 'warn' | 'bad' | 'info';
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    ok: 'bg-green-500',
    warn: 'bg-amber-500',
    bad: 'bg-rose-500',
    info: 'bg-blue-500',
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-700 shadow-xl rounded-xl text-sm text-slate-200 animate-in slide-in-from-right fade-in duration-300">
      <div className={`w-2.5 h-2.5 rounded-full ${colors[type]}`} />
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="text-slate-500 hover:text-white">
        <X size={14} />
      </button>
    </div>
  );
};
