'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';

interface Props {
  dirty: boolean;
  saving: boolean;
  issueCount: number;
  onSave: () => void;
  onDiscard: () => void;
  onJumpToIssue: () => void;
  primaryColor: string;
  /** Server error text (API 400 messages shown verbatim). */
  serverError?: string | null;
  saveLabel?: string;
  /** Left-side text when there are no issues, e.g. "2 unsaved changes". */
  statusText?: string;
}

/** Sticky bottom bar, rendered only while dirty. Save stays enabled even with issues. */
export function BuilderSaveBar({
  dirty,
  saving,
  issueCount,
  onSave,
  onDiscard,
  onJumpToIssue,
  primaryColor,
  serverError,
  saveLabel = 'Save changes',
  statusText = 'Unsaved changes',
}: Props) {
  if (!dirty && !serverError) return null;
  return (
    <div className="sticky bottom-0 z-10 -mx-6 lg:-mx-8 px-6 lg:px-8 py-3 bg-white/95 backdrop-blur border-t flex items-center justify-between gap-4">
      <div className="min-w-0 text-sm">
        {serverError ? (
          <p className="text-red-600 font-medium whitespace-pre-line">{serverError}</p>
        ) : issueCount > 0 ? (
          <button type="button" onClick={onJumpToIssue} className="inline-flex items-center gap-1.5 text-red-600 font-medium hover:underline">
            <AlertTriangle className="w-4 h-4" />
            {issueCount} issue{issueCount === 1 ? '' : 's'} to fix
          </button>
        ) : (
          <span className="text-gray-500">{statusText}</span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {dirty && (
          <button type="button" onClick={onDiscard} disabled={saving} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-60">
            Discard
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:brightness-90 disabled:opacity-60"
          style={{ backgroundColor: primaryColor }}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  );
}
