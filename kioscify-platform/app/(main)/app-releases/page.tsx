// kioscify-platform/app/(main)/app-releases/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import type { AppRelease } from '@/types';
import { Plus, Pencil, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';

const UPLOAD_MAX_SIZE = 200 * 1024 * 1024; // 200 MB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === 'PUBLISHED'
      ? 'bg-green-100 text-green-700'
      : 'bg-gray-100 text-gray-500';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles}`}>
      {status}
    </span>
  );
}

interface UploadForm {
  versionName: string;
  versionCode: string;
  releaseNotes: string;
  forceUpdate: boolean;
  status: 'DRAFT' | 'PUBLISHED';
}

const defaultUploadForm: UploadForm = {
  versionName: '',
  versionCode: '',
  releaseNotes: '',
  forceUpdate: false,
  status: 'DRAFT',
};

interface EditForm {
  releaseNotes: string;
  forceUpdate: boolean;
  status: 'DRAFT' | 'PUBLISHED';
}

export default function AppReleasesPage() {
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [loading, setLoading] = useState(true);

  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState<UploadForm>(defaultUploadForm);
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editTarget, setEditTarget] = useState<AppRelease | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    releaseNotes: '',
    forceUpdate: false,
    status: 'DRAFT',
  });
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AppRelease | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadReleases() {
    setLoading(true);
    try {
      setReleases(await api.getAppReleases());
    } catch {
      toast.error('Failed to load releases');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadReleases(); }, []);

  function openEdit(release: AppRelease) {
    setEditTarget(release);
    setEditForm({
      releaseNotes: release.releaseNotes.join('\n'),
      forceUpdate: release.forceUpdate,
      status: release.status,
    });
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploadError('');

    if (!apkFile) { setUploadError('Please select an APK file'); return; }
    if (apkFile.size > UPLOAD_MAX_SIZE) {
      setUploadError('File too large (max 200 MB)');
      return;
    }
    if (!uploadForm.versionName.trim()) {
      setUploadError('Version name is required');
      return;
    }
    if (!uploadForm.versionCode || isNaN(parseInt(uploadForm.versionCode))) {
      setUploadError('Version code must be a number');
      return;
    }

    const formData = new FormData();
    formData.append('apk', apkFile);
    formData.append('versionName', uploadForm.versionName);
    formData.append('versionCode', uploadForm.versionCode);
    formData.append(
      'releaseNotes',
      JSON.stringify(
        uploadForm.releaseNotes.split('\n').map((l) => l.trim()).filter(Boolean),
      ),
    );
    formData.append('forceUpdate', String(uploadForm.forceUpdate));
    formData.append('status', uploadForm.status);

    setUploading(true);
    try {
      await api.uploadAppRelease(formData);
      toast.success('APK uploaded successfully');
      setShowUpload(false);
      setUploadForm(defaultUploadForm);
      setApkFile(null);
      await loadReleases();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setUploadError(axiosErr?.response?.data?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setSaving(true);
    try {
      await api.updateAppRelease(editTarget.id, {
        releaseNotes: editForm.releaseNotes
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
        forceUpdate: editForm.forceUpdate,
        status: editForm.status,
      });
      toast.success('Release updated');
      setEditTarget(null);
      await loadReleases();
    } catch {
      toast.error('Failed to update release');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteAppRelease(deleteTarget.id);
      toast.success('Release deleted');
      setDeleteTarget(null);
      await loadReleases();
    } catch {
      toast.error('Failed to delete release');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kiosk App</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage APK releases for the Kioscify Kiosk Android app
          </p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" />
          Upload APK
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : releases.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          No APK releases yet. Upload one to get started.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Version Name', 'Version Code', 'File Size', 'Force Update', 'Status', 'Uploaded', 'Actions'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {releases.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {r.versionName}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.versionCode}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatBytes(r.fileSize)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {r.forceUpdate ? (
                      <span className="text-red-600 font-medium">Yes</span>
                    ) : (
                      <span className="text-gray-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <a
                        href={r.apkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                        title="Download APK"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => openEdit(r)}
                        className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(r)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Modal — portaled to document.body; an in-place fixed overlay
          nested this deep in the layout tree renders short at the top edge
          (see kioscify-company's brands/[brandId]/page.tsx Modal for notes). */}
      {showUpload && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-900">Upload New APK</h2>
              <button
                onClick={() => { setShowUpload(false); setUploadError(''); }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleUpload} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  APK File <span className="text-red-500">*</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".apk,application/vnd.android.package-archive"
                  onChange={(e) => setApkFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  required
                />
                {apkFile && (
                  <p className="text-xs text-gray-400 mt-1">
                    {apkFile.name} — {formatBytes(apkFile.size)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Version Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1.0.5"
                    value={uploadForm.versionName}
                    onChange={(e) =>
                      setUploadForm((f) => ({ ...f, versionName: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Version Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 5"
                    value={uploadForm.versionCode}
                    onChange={(e) =>
                      setUploadForm((f) => ({ ...f, versionCode: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Release Notes (one per line)
                </label>
                <textarea
                  rows={4}
                  placeholder="Added inventory sync&#10;Fixed cashier logout issue"
                  value={uploadForm.releaseNotes}
                  onChange={(e) =>
                    setUploadForm((f) => ({ ...f, releaseNotes: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={uploadForm.forceUpdate}
                    onChange={(e) =>
                      setUploadForm((f) => ({ ...f, forceUpdate: e.target.checked }))
                    }
                    className="w-4 h-4 text-indigo-600"
                  />
                  <span className="text-sm text-gray-700">Force Update</span>
                </label>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Status</label>
                  <select
                    value={uploadForm.status}
                    onChange={(e) =>
                      setUploadForm((f) => ({
                        ...f,
                        status: e.target.value as 'DRAFT' | 'PUBLISHED',
                      }))
                    }
                    className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                  </select>
                </div>
              </div>

              {uploadError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-md">
                  {uploadError}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowUpload(false); setUploadError(''); }}
                  className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* Edit Modal — portaled to document.body */}
      {editTarget && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-900">
                Edit Release — {editTarget.versionName}
              </h2>
              <button
                onClick={() => setEditTarget(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleEdit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Release Notes (one per line)
                </label>
                <textarea
                  rows={4}
                  value={editForm.releaseNotes}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, releaseNotes: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.forceUpdate}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, forceUpdate: e.target.checked }))
                    }
                    className="w-4 h-4 text-indigo-600"
                  />
                  <span className="text-sm text-gray-700">Force Update</span>
                </label>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        status: e.target.value as 'DRAFT' | 'PUBLISHED',
                      }))
                    }
                    className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* Delete Confirmation — portaled to document.body */}
      {deleteTarget && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h2 className="font-semibold text-gray-900 mb-2">Delete Release?</h2>
            <p className="text-sm text-gray-500 mb-4">
              This will permanently delete{' '}
              <strong>{deleteTarget.versionName}</strong> and its APK file. This
              cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
