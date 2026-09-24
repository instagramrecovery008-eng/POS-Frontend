import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  variant = 'danger',
  isLoading = false,
}) => {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: 'text-red-500 bg-red-50',
      button: 'bg-red-600 hover:bg-red-700 text-white',
      border: 'border-red-100',
    },
    warning: {
      icon: 'text-amber-500 bg-amber-50',
      button: 'bg-amber-600 hover:bg-amber-700 text-white',
      border: 'border-amber-100',
    },
    info: {
      icon: 'text-blue-500 bg-blue-50',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
      border: 'border-blue-100',
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-100 p-6 animate-slide-up">
        <div className="flex flex-col items-center text-center gap-3">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${styles.icon}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>

          {/* Title */}
          <h3 className="text-base font-extrabold text-slate-800">{title}</h3>

          {/* Message */}
          <p className="text-sm text-slate-500 leading-relaxed">{message}</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-2.5 mt-6">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 h-11 border-2 border-slate-200 hover:border-slate-300 rounded-xl text-sm font-bold text-slate-600 hover:text-slate-800 transition-all disabled:opacity-50 cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 h-11 rounded-xl text-sm font-bold transition-all disabled:opacity-50 ${styles.button} cursor-pointer flex items-center justify-center gap-1.5`}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processing...
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationDialog;
