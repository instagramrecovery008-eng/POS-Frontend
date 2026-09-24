import React, { useState } from 'react';
import { User, Lock, Eye, EyeOff } from 'lucide-react';
import AppInput from '../../../components/common/AppInput';
import AppButton from '../../../components/common/AppButton';

export default function LoginForm({ onSubmit, loading, error }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!userId || !password) return;
    onSubmit(userId, password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="text-[#E63946] bg-[#E63946]/5 border border-[#E63946]/20 rounded-xl p-3 text-center text-xs font-semibold">
          {error}
        </div>
      )}

      <AppInput
        label="Email or User ID"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        placeholder="Enter email or user ID"
        disabled={loading}
        icon={<User className="w-4 h-4" />}
      />

      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase text-[#16A34A] tracking-wider">
          Password
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <Lock className="w-4 h-4" />
          </span>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            disabled={loading}
            className="w-full h-11 pl-9 pr-10 bg-[#F8FAFC] border border-slate-200 hover:border-[#16A34A]/50 focus:border-[#16A34A] focus:bg-white rounded-xl outline-none text-xs font-semibold transition-all"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <AppButton type="submit" loading={loading} className="w-full h-11 text-sm">
        Log In
      </AppButton>
    </form>
  );
}
