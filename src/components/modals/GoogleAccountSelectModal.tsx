import React from 'react';
import { X, CheckCircle, ShieldCheck, Database, FolderCheck, ExternalLink } from 'lucide-react';

interface GoogleAccountSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmConnect: () => void;
  isLoading: boolean;
  currentEmail?: string;
}

export const GoogleAccountSelectModal: React.FC<GoogleAccountSelectModalProps> = ({
  isOpen,
  onClose,
  onConfirmConnect,
  isLoading,
  currentEmail,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <svg className="w-4 h-4" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Pilih & Hubungkan Akun Google
              </h2>
              <p className="text-[11px] text-slate-500">
                Pilih akun Google Anda sebelum menghubungkan
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4 text-xs">
          {currentEmail ? (
            <div className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/30">
              <span className="block text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                Akun Google Terakhir
              </span>
              <p className="font-semibold text-slate-800 dark:text-slate-100 font-mono mt-0.5">
                {currentEmail}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Anda dapat memilih akun yang sama atau berganti ke akun Google baru pada layar pemilihan Google berikutnya.
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <p className="text-slate-600 dark:text-slate-300">
                Sebelum menghubungkan, jendela Google akan menampilkan <strong>Pemilih Akun (Account Chooser)</strong> agar Anda dapat menentukan akun Google mana yang ingin dijadikan tempat penyimpanan data sekolah.
              </p>
            </div>
          )}

          {/* Permitted integrations */}
          <div className="space-y-2">
            <span className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Layanan yang Akan Dihubungkan:
            </span>

            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80">
                <FolderCheck className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-slate-800 dark:text-slate-200 font-semibold">
                    Folder Google Drive Otomatis
                  </strong>
                  <span className="text-[11px] text-slate-500">
                    Membuat folder &quot;DISIPLIN KITA BISA - Database Sekolah&quot; untuk menyimpan cadangan berkas & foto siswa.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80">
                <Database className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-slate-800 dark:text-slate-200 font-semibold">
                    Spreadsheet Database Presensi
                  </strong>
                  <span className="text-[11px] text-slate-500">
                    Menyinkronkan lembar data Siswa, Kelas, Presensi, Izin Keluar Kelas, dan Poin Pelanggaran secara real-time.
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-start gap-2 text-[11px]">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
            <div>
              <strong className="block font-semibold">Protokol Google OAuth 2.0 Aktif</strong>
              <span>
                Email dapat diganti kapan saja. Folder Drive & Google Sheets otomatis dibuat dan mengikuti akun email yang Anda pilih saat ditautkan kembali tanpa error.
              </span>
            </div>
          </div>

          {typeof window !== 'undefined' && window.self !== window.top && (
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 flex items-center justify-between text-[11px]">
              <span>Tampilan pratinjau (iframe) terdeteksi.</span>
              <a
                href={window.location.href}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>Buka Tab Baru</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={onConfirmConnect}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 rounded-lg shadow-xs transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <span>Menghubungkan...</span>
            ) : (
              <>
                <span>Buka OAuth 2.0 Google</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
