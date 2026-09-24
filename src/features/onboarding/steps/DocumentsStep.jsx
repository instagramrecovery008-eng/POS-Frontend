import React, { useState } from 'react';
import { FileText, UploadCloud, Loader2, File, Check, AlertTriangle, XCircle, ShieldCheck } from 'lucide-react';
import { onboardingApi } from '../../../api/onboarding.api';
import useOnboardingStore from '../onboardingStore';
import { StepCard, Notice } from '../components/OnboardingShell';
import { Select, StepActions, configLabel } from '../components/controls';
import { hasValidDocument, VALID_DOCUMENT_STATUSES } from '../onboarding.lib';

const formatFileSize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const STATUS_META = {
  PENDING: { label: 'Pending', cls: 'bg-amber-50 text-amber-600' },
  UNDER_REVIEW: { label: 'Under Review', cls: 'bg-blue-50 text-blue-600' },
  VERIFIED: { label: 'Verified', cls: 'bg-emerald-50 text-emerald-600' },
  REJECTED: { label: 'Rejected', cls: 'bg-red-50 text-red-600' },
};

/**
 * Business Documents step (step 3).
 *
 * Critical rule (also enforced server-side at every gate): NO individual
 * document type is mandatory, but the applicant must upload at least ONE
 * valid document before continuing. 0 documents blocks the step — frontend
 * state can never bypass it because Continue is gated on the uploaded list
 * and every later backend gate re-checks the document count.
 *
 * Applicant-side documents are append-only (the applicant API has no delete);
 * review/verify/reject is done by SUPER_ADMIN. To replace a rejected file the
 * applicant simply uploads another document.
 */
export default function DocumentsStep({ onBack, onDone, onExitToLogin }) {
  const { payload, config } = useOnboardingStore();
  const [documents, setDocuments] = useState(() => payload?.documents || []);
  const [documentType, setDocumentType] = useState('');
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [uploaded, setUploaded] = useState(false);
  const [continuing, setContinuing] = useState(false);

  const docLabels = configLabel(config, 'documentTypes');
  const maxSizeBytes = (config && config.maxDocumentSizeBytes) || 10 * 1024 * 1024;
  const allowedExt = (config && config.allowedDocumentExtensions) || ['.pdf', '.jpg', '.jpeg', '.png'];
  const validCount = documents.filter((d) => VALID_DOCUMENT_STATUSES.includes(d.status)).length;
  const rejectedDocs = documents.filter((d) => d.status === 'REJECTED');
  const canContinue = hasValidDocument(documents);

  const chooseFile = (f) => {
    setFile(f);
    setUploaded(false);
    setUploadError('');
    if (!f) return;
    const name = String(f.name || '').toLowerCase();
    const dot = name.lastIndexOf('.');
    const ext = dot >= 0 ? name.slice(dot) : '';
    if (!allowedExt.includes(ext)) {
      setUploadError(`Only ${allowedExt.join(', ')} files are allowed`);
      return;
    }
    if (f.size > maxSizeBytes) {
      setUploadError('File size must be 10 MB or less');
    }
  };

  const handleUpload = async () => {
    if (uploading) return;
    if (!documentType) { setErrors({ documentType: 'Select the document type' }); return; }
    if (!file) { setErrors({ file: 'Choose a file to upload' }); return; }
    if (uploadError) return;
    setErrors({});
    setUploadError('');
    setUploaded(false);
    setUploadProgress(0);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('documentType', documentType);
      formData.append('file', file);
      const resp = await onboardingApi.uploadDocument(formData, {
        onUploadProgress: (e) => {
          if (e && e.total) setUploadProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
        },
      });
      const doc = resp && resp.data ? resp.data : resp;
      if (doc && doc.id) {
        setDocuments((prev) => [doc, ...prev]);
        setFile(null);
        setDocumentType('');
        setUploadProgress(0);
        setUploaded(true);
      } else {
        setUploadError('The server did not return an upload confirmation. Please try again.');
      }
    } catch (e) {
      setUploadError(e.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Refresh the canonical status and let the wizard move on — the backend
  // re-derives the stage from the stored documents (≥1 valid → Legal step).
  const handleContinue = async () => {
    if (continuing || !canContinue) return;
    setContinuing(true);
    try {
      await useOnboardingStore.getState().refresh();
      if (onDone) onDone();
    } finally {
      setContinuing(false);
    }
  };

  return (
    <>
      <StepCard
        icon={FileText}
        title="Business Documents"
        subtitle="Upload at least one business document for verification"
      >
        {rejectedDocs.length > 0 && (
          <div className="mb-4 space-y-2">
            {rejectedDocs.map((d) => (
              <Notice key={d.id} tone="error">
                <span className="flex items-start gap-1.5">
                  <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    <b>{docLabels[d.documentType] || d.documentType}</b> was rejected
                    {d.rejectionReason ? ` — ${d.rejectionReason}` : ''}. Please upload a replacement.
                  </span>
                </span>
              </Notice>
            ))}
          </div>
        )}

        {/* ── At-least-one-valid rule ── */}
        <div className={`rounded-xl border px-4 py-3 flex items-start gap-2 mb-5 ${validCount > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          {validCount > 0
            ? <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
          <div>
            {validCount > 0 ? (
              <p className="text-xs font-bold text-emerald-700">
                {validCount} valid document{validCount > 1 ? 's' : ''} uploaded — you can continue.
              </p>
            ) : (
              <p className="text-xs font-bold text-amber-700">Please upload at least one valid business document to continue.</p>
            )}
            <p className="text-[10px] text-slate-500 mt-0.5">
              No individual document type is mandatory — upload one, several, or all supported documents.
            </p>
          </div>
        </div>

        {/* ── Upload control ── */}
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50/50 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select name="docType" label="Document Type" value={documentType} error={errors.documentType}
              onChange={(e) => { setDocumentType(e.target.value); setErrors((er) => ({ ...er, documentType: undefined })); }}>
              <option value="">Select type…</option>
              {Object.entries(docLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">File</label>
              <label className={`flex items-center justify-center gap-2 h-10 px-3 border rounded-xl text-xs font-semibold transition-all cursor-pointer ${errors.file ? 'border-red-300 bg-red-50 text-red-600' : 'border-slate-200 bg-white text-slate-500 hover:border-[#16A34A]/60'}`}>
                <UploadCloud className="w-4 h-4 shrink-0" />
                <span className="truncate max-w-[210px]">{file ? file.name : 'Choose file…'}</span>
                <input type="file" className="hidden" accept={allowedExt.join(',')}
                  onChange={(e) => chooseFile(e.target.files && e.target.files[0])} />
              </label>
              {errors.file
                ? <p className="text-[10px] font-semibold text-red-600">{errors.file}</p>
                : <p className="text-[9px] text-slate-400">PDF, JPG or PNG — max 10 MB</p>}
            </div>
          </div>

          {uploadError && (
            <p className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-red-600">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {uploadError}
            </p>
          )}
          {uploaded && !uploadError && (
            <p className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600">
              <Check className="w-3.5 h-3.5 shrink-0" /> Document uploaded successfully
            </p>
          )}
          {uploading && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 mb-1">
                <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin text-[#16A34A]" /> Uploading…</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-[#16A34A] transition-all" style={{ width: `${Math.max(5, uploadProgress)}%` }} />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !!uploadError}
            className="mt-4 h-9 px-4 bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
            {uploading ? 'Uploading…' : 'Upload Document'}
          </button>
        </div>

        {/* ── Uploaded documents ── */}
        <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">
          Uploaded Documents {documents.length > 0 && <span className="text-slate-400">({documents.length})</span>}
        </h3>
        {documents.length === 0 ? (
          <div className="text-center py-6 border border-slate-100 rounded-xl bg-slate-50/50">
            <File className="w-7 h-7 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-400">No documents uploaded yet</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {documents.map((doc) => {
              const meta = STATUS_META[doc.status] || STATUS_META.PENDING;
              return (
                <li key={doc.id} className="flex items-center gap-3 border border-slate-100 rounded-xl px-3.5 py-2.5 bg-white">
                  <div className="w-9 h-9 rounded-lg bg-[#16A34A]/5 border border-[#16A34A]/15 flex items-center justify-center shrink-0">
                    <File className="w-4 h-4 text-[#16A34A]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate">{doc.originalFileName}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {docLabels[doc.documentType] || doc.documentType} • {formatFileSize(doc.fileSize)}
                    </p>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-1 rounded-full shrink-0 ${meta.cls}`}>{meta.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </StepCard>

      <StepActions
        onExitToLogin={onExitToLogin}
        onBack={onBack}
        onContinue={handleContinue}
        continueDisabled={!canContinue || continuing}
        loading={continuing ? 'Checking…' : false}
        continueLabel="Continue to Legal"
      />
    </>
  );
}
