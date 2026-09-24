import React, { useState, useEffect } from 'react';
import { Building2, Clock, CheckCircle2, XCircle, AlertTriangle, CreditCard, Mail, Phone, MapPin } from 'lucide-react';
import { useAuthStore, useUiStore } from '../../store';
import { onboardingApi } from '../../api/onboarding.api';
import { formatINR } from './onboarding.lib';

/**
 * Application status page for applicants.
 * Shows the current status of their manual payment application.
 */
export default function ApplicationStatusPage() {
  const { user } = useAuthStore();
  const { addToast } = useUiStore();
  
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // Get application ID from local storage or user
  const applicationId = user?.restaurantId;
  
  useEffect(() => {
    loadStatus();
  }, []);
  
  const loadStatus = async () => {
    if (!applicationId) {
      setError('No application found');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const result = await onboardingApi.getManualApplicationDetail(applicationId);
      if (result.success && result.data) {
        setStatus(result.data);
      } else {
        setError(result.message || 'Failed to load application status');
      }
    } catch (e) {
      setError(e.message || 'Failed to load application status');
    } finally {
      setLoading(false);
    }
  };
  
  const getStatusIcon = () => {
    if (!status) return null;
    switch (status.onboardingStatus) {
      case 'MANUAL_PENDING':
        return <Clock className="w-5 h-5 text-amber-500" />;
      case 'MANUAL_PAYMENT_PENDING':
        return <CreditCard className="w-5 h-5 text-blue-500" />;
      case 'MANUAL_PAYMENT_RECEIVED':
        return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case 'MANUAL_APPROVED':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'MANUAL_REJECTED':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };
  
  const getStatusColor = () => {
    if (!status) return 'bg-slate-100 text-slate-600';
    switch (status.onboardingStatus) {
      case 'MANUAL_PENDING':
        return 'bg-amber-100 text-amber-700';
      case 'MANUAL_PAYMENT_PENDING':
        return 'bg-blue-100 text-blue-700';
      case 'MANUAL_PAYMENT_RECEIVED':
        return 'bg-emerald-100 text-emerald-700';
      case 'MANUAL_APPROVED':
        return 'bg-green-100 text-green-700';
      case 'MANUAL_REJECTED':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };
  
  const getStatusMessage = () => {
    if (!status) return '';
    switch (status.onboardingStatus) {
      case 'MANUAL_PENDING':
        return 'Your application is pending review by Super Admin.';
      case 'MANUAL_PAYMENT_PENDING':
        return 'Your application is awaiting payment verification.';
      case 'MANUAL_PAYMENT_RECEIVED':
        return 'Payment received. Your application is awaiting Super Admin approval.';
      case 'MANUAL_APPROVED':
        return 'Your application has been approved. You can now log in to the POS.';
      case 'MANUAL_REJECTED':
        return status.onboardingNote ? `Your application has been rejected. Reason: ${status.onboardingNote}` : 'Your application has been rejected.';
      default:
        return 'Your application is being processed.';
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#16A34A]/20 border-t-[#16A34A] rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-500 mt-4">Loading application status...</p>
        </div>
      </div>
    );
  }
  
  if (error && !status) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-md">
          <XCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-lg font-bold text-slate-700 mt-4">Application Not Found</h2>
          <p className="text-sm text-slate-500 mt-2">{error}</p>
          <button
            onClick={() => setRefreshing(true)}
            className="mt-4 h-10 px-4 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-[60vh] py-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#16A34A]/10 rounded-full flex items-center justify-center mx-auto">
            <Building2 className="w-8 h-8 text-[#16A34A]" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800 mt-4">Application Status</h1>
          <p className="text-sm text-slate-500 mt-1">Track your restaurant application progress</p>
        </div>
        
        {/* Application ID */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mb-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Application ID</p>
          <p className="text-lg font-extrabold text-slate-800 mt-1 font-mono">APP-{String(status?.id || '').padStart(4, '0')}</p>
        </div>
        
        {/* Status Card */}
        <div className={`rounded-xl p-6 border mb-6 ${status?.onboardingStatus === 'MANUAL_REJECTED' ? 'bg-red-50 border-red-200' : status?.onboardingStatus === 'MANUAL_APPROVED' ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${status?.onboardingStatus === 'MANUAL_REJECTED' ? 'bg-red-100' : status?.onboardingStatus === 'MANUAL_APPROVED' ? 'bg-green-100' : 'bg-slate-100'}`}>
              {getStatusIcon()}
            </div>
            <div className="flex-1">
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${getStatusColor()}`}>
                {status?.displayStatus || status?.onboardingStatus || 'Unknown'}
              </span>
              <h2 className="text-lg font-bold text-slate-800 mt-3">
                {status?.onboardingStatus === 'MANUAL_REJECTED' ? 'Application Rejected' :
                 status?.onboardingStatus === 'MANUAL_APPROVED' ? 'Application Approved' :
                 'Application in Progress'}
              </h2>
              <p className="text-sm text-slate-600 mt-2">{getStatusMessage()}</p>
            </div>
          </div>
        </div>
        
        {/* Restaurant Details */}
        {status?.name && (
          <div className="bg-white rounded-xl p-6 border border-slate-200 mb-6">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Restaurant Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Restaurant Name</p>
                <p className="font-semibold text-slate-700">{status.name}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Business Type</p>
                <p className="font-semibold text-slate-700">{status.businessType?.replace(/_/g, ' ') || '-'}</p>
              </div>
              {status.email && (
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                    <Mail className="w-3 h-3" /> Email
                  </p>
                  <p className="font-semibold text-slate-700">{status.email}</p>
                </div>
              )}
              {status.phone && (
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Phone
                  </p>
                  <p className="font-semibold text-slate-700">{status.phone}</p>
                </div>
              )}
              {status.address && (
                <div className="col-span-2">
                  <p className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Address
                  </p>
                  <p className="font-semibold text-slate-700">{status.address}{status.city ? `, ${status.city}` : ''}{status.state ? `, ${status.state}` : ''}</p>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Plan Details */}
        {status?.subscription && (
          <div className="bg-white rounded-xl p-6 border border-slate-200 mb-6">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Selected Plan</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Plan</p>
                <p className="font-semibold text-slate-700">{status.subscription.planName}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Amount</p>
                <p className="font-semibold text-slate-700">{formatINR(status.subscription.yearlyPrice)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Billing Cycle</p>
                <p className="font-semibold text-slate-700">Yearly</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Payment Status</p>
                <p className={`font-semibold ${status.onboardingStatus === 'MANUAL_PAYMENT_RECEIVED' ? 'text-emerald-600' : 'text-slate-700'}`}>
                  {status.onboardingStatus === 'MANUAL_PAYMENT_RECEIVED' ? 'Paid' : status.onboardingStatus === 'MANUAL_PENDING' ? 'Pending' : 'Awaiting Payment'}
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Rejection Reason */}
        {status?.onboardingStatus === 'MANUAL_REJECTED' && status?.onboardingNote && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-2">
              <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-red-700">Rejection Reason</p>
                <p className="text-sm text-red-600 mt-1">{status.onboardingNote}</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={loadStatus}
            className="flex-1 h-10 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
          >
            Refresh Status
          </button>
          {status?.onboardingStatus === 'MANUAL_APPROVED' && (
            <button
              onClick={() => {
                window.location.href = '/dashboard';
              }}
              className="flex-1 h-10 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              Go to POS
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
