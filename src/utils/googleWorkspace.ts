import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  Student,
  SchoolClass,
  AttendanceSession,
  AttendanceRecord,
  OutOfClassRecord,
  ViolationRecord,
  AppSettings,
} from '../types/index.js';

// Required Google Workspace scopes
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
];

// Initialize Firebase App singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const firebaseAuth = getAuth(app);

// In-memory token cache (Do NOT store in localStorage/sessionStorage!)
let inMemoryAccessToken: string | null = null;
let isSigningIn = false;

export interface ConnectedGoogleAccount {
  email: string;
  name: string;
  photo?: string;
  uid: string;
  connectedAt: string;
}

export const getAccessToken = async (): Promise<string | null> => {
  return inMemoryAccessToken;
};

export const hasValidGoogleToken = (): boolean => {
  return Boolean(inMemoryAccessToken);
};

export const setInMemoryToken = (token: string | null) => {
  inMemoryAccessToken = token;
};

export const initGoogleAuth = (
  onSuccess?: (user: User, token: string) => void,
  onFailure?: () => void
) => {
  return onAuthStateChanged(firebaseAuth, async (user: User | null) => {
    if (user && inMemoryAccessToken) {
      if (onSuccess) onSuccess(user, inMemoryAccessToken);
    } else if (user && !inMemoryAccessToken) {
      // User is authenticated in Firebase Auth, mark active
      if (onSuccess) onSuccess(user, '');
    } else if (!user) {
      inMemoryAccessToken = null;
      if (onFailure) onFailure();
    }
  });
};

/**
 * Preloads Google Identity Services script if not already present
 */
export const ensureGisLoaded = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  if ((window as any).google?.accounts?.oauth2) return true;

  return new Promise((resolve) => {
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      if ((window as any).google?.accounts?.oauth2) {
        return resolve(true);
      }
      existing.addEventListener('load', () => resolve(true));
      setTimeout(() => resolve(Boolean((window as any).google?.accounts?.oauth2)), 800);
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    }
  });
};

// Immediate pre-fetch on module load in browser
if (typeof window !== 'undefined') {
  ensureGisLoaded().catch(() => {});
}

/**
 * Request Google OAuth token via Google Identity Services (GIS)
 * Uses direct user gesture token client to guarantee prompt: select_account
 */
export const requestGoogleIdentityToken = async (
  promptSelectAccount: boolean = true
): Promise<{
  accessToken: string;
  accountInfo: ConnectedGoogleAccount;
  cancelled?: boolean;
}> => {
  const clientId = (firebaseConfig as any).oAuthClientId;
  if (!clientId) {
    throw new Error('Client ID OAuth Google tidak ditemukan pada konfigurasi aplikasi.');
  }

  await ensureGisLoaded();

  const google = (window as any).google;
  if (!google?.accounts?.oauth2) {
    throw new Error('Layanan Google Identity Services belum siap di browser. Harap periksa koneksi internet Anda.');
  }

  return new Promise((resolve, reject) => {
    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES.join(' '),
        prompt: promptSelectAccount ? 'select_account' : '',
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            // User closed popup or cancelled
            if (
              tokenResponse.error === 'access_denied' ||
              tokenResponse.error === 'popup_closed_by_user' ||
              tokenResponse.error === 'cancelled'
            ) {
              return resolve({ accessToken: '', accountInfo: null as any, cancelled: true });
            }
            if (tokenResponse.error === 'popup_blocked_by_browser') {
              return reject(new Error('Popup Google diblokir peramban. Harap izinkan pop-up (jendela sembulan) untuk situs ini.'));
            }
            return reject(new Error(tokenResponse.error_description || tokenResponse.error));
          }

          const token = tokenResponse.access_token;
          if (!token) {
            return reject(new Error('Gagal menerima Access Token dari Google.'));
          }

          inMemoryAccessToken = token;

          // Bridge to Firebase Auth using signInWithCredential so Firebase Auth is in sync without domain restrictions
          try {
            const credential = GoogleAuthProvider.credential(null, token);
            await signInWithCredential(firebaseAuth, credential);
          } catch (fbAuthErr: any) {
            console.info('[Firebase Auth bridge note]:', fbAuthErr?.message || fbAuthErr);
          }

          try {
            const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${token}` },
            });
            const userData = await userRes.json();
            const accountInfo: ConnectedGoogleAccount = {
              email: userData.email || 'akun-google@sekolah.sch.id',
              name: userData.name || userData.email || 'Admin Google',
              photo: userData.picture || undefined,
              uid: userData.sub || `g_${Date.now()}`,
              connectedAt: new Date().toISOString(),
            };
            resolve({ accessToken: token, accountInfo });
          } catch {
            resolve({
              accessToken: token,
              accountInfo: {
                email: 'akun-google@sekolah.sch.id',
                name: 'Admin Akun Google',
                uid: `g_${Date.now()}`,
                connectedAt: new Date().toISOString(),
              },
            });
          }
        },
        error_callback: (err: any) => {
          console.warn('[GIS Error Callback]:', err);
          if (err?.type === 'popup_closed' || err?.type === 'user_cancel') {
            resolve({ accessToken: '', accountInfo: null as any, cancelled: true });
          } else if (err?.type === 'popup_blocked') {
            reject(new Error('Popup Google diblokir peramban. Harap izinkan pop-up untuk situs ini.'));
          } else {
            reject(new Error(err?.message || 'Gagal memproses otentikasi Google.'));
          }
        },
      });

      client.requestAccessToken({ prompt: promptSelectAccount ? 'select_account' : '' });
    } catch (err: any) {
      reject(err);
    }
  });
};

/**
 * Sign in with Google using Firebase Auth SDK with requested Drive + Sheets scopes.
 * Guarantees account selection (select_account) and eliminates origin_mismatch errors.
 */
export const signInWithGoogle = async (
  promptSelectAccount: boolean = true
): Promise<{ user?: User; accessToken: string; accountInfo: ConnectedGoogleAccount; cancelled?: boolean }> => {
  try {
    isSigningIn = true;

    // 1. Primary: Firebase Auth SDK signInWithPopup (as prescribed by Google Workspace integration)
    const provider = new GoogleAuthProvider();
    SCOPES.forEach((scope) => provider.addScope(scope));

    if (promptSelectAccount) {
      provider.setCustomParameters({
        prompt: 'select_account',
      });
    }

    try {
      const result = await signInWithPopup(firebaseAuth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('Gagal mendapatkan Access Token dari otentikasi Google.');
      }

      inMemoryAccessToken = credential.accessToken;
      const accountInfo: ConnectedGoogleAccount = {
        email: result.user.email || '',
        name: result.user.displayName || result.user.email || 'Admin Google',
        photo: result.user.photoURL || undefined,
        uid: result.user.uid,
        connectedAt: new Date().toISOString(),
      };

      return {
        user: result.user,
        accessToken: inMemoryAccessToken,
        accountInfo,
      };
    } catch (firebaseErr: any) {
      // User closed popup or cancelled
      if (
        firebaseErr.code === 'auth/popup-closed-by-user' ||
        firebaseErr.code === 'auth/cancelled-popup-request'
      ) {
        return {
          accessToken: '',
          accountInfo: null as any,
          cancelled: true,
        };
      }

      if (firebaseErr.code === 'auth/popup-blocked') {
        throw new Error('Popup pemilihan akun Google diblokir peramban. Harap izinkan pop-up untuk situs ini.');
      }

      console.warn('[Firebase Auth fallback to GIS]:', firebaseErr?.message || firebaseErr);

      // 2. Secondary fallback: GIS Token Client
      if (typeof window !== 'undefined') {
        await ensureGisLoaded();
        if ((window as any).google?.accounts?.oauth2) {
          try {
            const gisResult = await requestGoogleIdentityToken(promptSelectAccount);
            return {
              user: firebaseAuth.currentUser || undefined,
              accessToken: gisResult.accessToken,
              accountInfo: gisResult.accountInfo,
              cancelled: gisResult.cancelled,
            };
          } catch (gisErr: any) {
            console.warn('[GIS fallback note]:', gisErr);
          }
        }
      }

      throw new Error(firebaseErr?.message || 'Gagal melakukan otentikasi Google.');
    }
  } finally {
    isSigningIn = false;
  }
};

/**
 * Disconnect Google Account and clear in-memory token
 */
export const disconnectGoogleAccount = async () => {
  try {
    await signOut(firebaseAuth);
  } catch (e) {
    console.warn('[Firebase signOut warning]:', e);
  }
  inMemoryAccessToken = null;
};

// ==========================================
// GOOGLE DRIVE & GOOGLE SHEETS API UTILITIES
// ==========================================

const FOLDER_NAME = 'DISIPLIN KITA BISA - Database Sekolah';
const SPREADSHEET_NAME = 'Database Presensi & Kedisiplinan - DISIPLIN KITA BISA';

/**
 * Find or create dedicated Google Drive folder
 */
export const getOrCreateDriveFolder = async (
  accessToken: string
): Promise<{ folderId: string; folderUrl: string }> => {
  // 1. Search existing folder
  const query = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchRes.ok) {
    const err = await searchRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal mencari folder di Google Drive (${searchRes.status})`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    const existing = searchData.files[0];
    return {
      folderId: existing.id,
      folderUrl: existing.webViewLink || `https://drive.google.com/drive/folders/${existing.id}`,
    };
  }

  // 2. Create folder if not found
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Folder basis data otomatis DISIPLIN KITA BISA (Presensi, Siswa, Rekapitulasi)',
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal membuat folder di Google Drive (${createRes.status})`);
  }

  const newFolder = await createRes.json();
  return {
    folderId: newFolder.id,
    folderUrl: newFolder.webViewLink || `https://drive.google.com/drive/folders/${newFolder.id}`,
  };
};

/**
 * Find or create dedicated Google Spreadsheet in the app's Drive folder
 */
export const getOrCreateSpreadsheet = async (
  accessToken: string,
  folderId?: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; isNew: boolean }> => {
  // 1. Search existing spreadsheet (scoped to folder first, then global)
  const baseQuery = `name='${SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  if (folderId) {
    const scopedQuery = `${baseQuery} and '${folderId}' in parents`;
    const scopedRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(scopedQuery)}&fields=files(id,name,webViewLink)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (scopedRes.ok) {
      const scopedData = await scopedRes.json();
      if (scopedData.files && scopedData.files.length > 0) {
        const existing = scopedData.files[0];
        return {
          spreadsheetId: existing.id,
          spreadsheetUrl: existing.webViewLink || `https://docs.google.com/spreadsheets/d/${existing.id}/edit`,
          isNew: false,
        };
      }
    }
  }

  // 1b. Search across user's files if not found inside specific folder
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(baseQuery)}&fields=files(id,name,webViewLink)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      const existing = searchData.files[0];
      if (folderId) {
        try {
          await fetch(
            `https://www.googleapis.com/drive/v3/files/${existing.id}?addParents=${folderId}&fields=id,parents`,
            {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );
        } catch {}
      }
      return {
        spreadsheetId: existing.id,
        spreadsheetUrl: existing.webViewLink || `https://docs.google.com/spreadsheets/d/${existing.id}/edit`,
        isNew: false,
      };
    }
  }

  // 2. Create spreadsheet with default sheets
  const sheetTitles = ['Siswa', 'Kelas', 'Sesi_Presensi', 'Presensi', 'Izin_Keluar', 'Pelanggaran', 'Pengaturan'];
  const createSheetRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: SPREADSHEET_NAME,
      },
      sheets: sheetTitles.map((title) => ({
        properties: {
          title,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
      })),
    }),
  });

  if (!createSheetRes.ok) {
    const err = await createSheetRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal membuat spreadsheet Google (${createSheetRes.status})`);
  }

  const sheetData = await createSheetRes.json();
  const spreadsheetId = sheetData.spreadsheetId;
  const spreadsheetUrl = sheetData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // 3. If folderId provided, move spreadsheet into folder
  if (folderId) {
    try {
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${folderId}&fields=id,parents`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
    } catch (e) {
      console.warn('[Google Workspace] Could not move spreadsheet into folder:', e);
    }
  }

  return {
    spreadsheetId,
    spreadsheetUrl,
    isNew: true,
  };
};

export interface SyncDataPayload {
  students: Student[];
  classes: SchoolClass[];
  sessions: AttendanceSession[];
  attendance: AttendanceRecord[];
  outOfClass: OutOfClassRecord[];
  violations: ViolationRecord[];
  settings: AppSettings;
}

/**
 * Synchronize all tables into Google Sheets
 */
export const syncAllDataToGoogleSheets = async (
  accessToken: string,
  spreadsheetId: string,
  data: SyncDataPayload
): Promise<{ success: boolean; rowsUpdated: number }> => {
  // Ensure the sheets exist in spreadsheet
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}));
    const errorObj: any = new Error(err.error?.message || `Gagal membaca Google Spreadsheet (${metaRes.status}).`);
    errorObj.statusCode = metaRes.status;
    throw errorObj;
  }

  const metaData = await metaRes.json();
  const existingSheetTitles: string[] = (metaData.sheets || []).map((s: any) => s.properties?.title);

  const requiredSheets = ['Siswa', 'Kelas', 'Sesi_Presensi', 'Presensi', 'Izin_Keluar', 'Pelanggaran', 'Pengaturan'];
  const missingSheets = requiredSheets.filter((title) => !existingSheetTitles.includes(title));

  if (missingSheets.length > 0) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: missingSheets.map((title) => ({
          addSheet: {
            properties: {
              title,
              gridProperties: { frozenRowCount: 1 },
            },
          },
        })),
      }),
    });
  }

  // 1. Format Siswa rows
  const siswaRows = [
    ['NIS', 'Nama Siswa', 'Kelas', 'Jenis Kelamin', 'RFID UID', 'Kode Kartu/NIS', 'Nama Orang Tua', 'Email Orang Tua', 'Status Keaktifan'],
    ...data.students.map((s) => [
      s.nis,
      s.name,
      s.class_id,
      s.gender === 'L' ? 'Laki-laki' : 'Perempuan',
      s.rfid_uid || '-',
      s.card_code || s.nis,
      s.parent_name || '-',
      s.parent_email || '-',
      s.nis ? 'Aktif' : 'Nonaktif',
    ]),
  ];

  // 2. Format Kelas rows
  const kelasRows = [
    ['ID Kelas', 'Nama Kelas', 'Tingkat', 'Jurusan', 'Nama Wali Kelas', 'Email Wali Kelas (Notifikasi Otomatis)'],
    ...data.classes.map((c) => [
      c.id,
      c.name,
      c.grade,
      c.major,
      c.homeroom_teacher_name || '-',
      c.homeroom_teacher_email || '-',
    ]),
  ];

  // 3. Format Sesi rows
  const sesiRows = [
    ['ID Sesi', 'Nama Sesi', 'Jam Mulai', 'Batas Tepat Waktu', 'Jam Selesai', 'Toleransi Terlambat (Menit)', 'Hari Aktif (0=Min,1=Sen..)', 'Status'],
    ...data.sessions.map((sess) => [
      sess.id,
      sess.name,
      sess.start_time,
      sess.on_time_limit,
      sess.end_time,
      sess.late_tolerance_minutes,
      (sess.active_days || [1, 2, 3, 4, 5]).join(', '),
      sess.is_active ? 'Aktif' : 'Nonaktif',
    ]),
  ];

  // 4. Format Presensi rows (most recent first)
  const studentMap = new Map(data.students.map((s) => [s.nis, s]));
  const presensiRows = [
    ['ID Presensi', 'Tanggal', 'Jam Pemindaian', 'NIS', 'Nama Siswa', 'Kelas', 'ID Sesi', 'Status Kehadiran', 'Terlambat (Menit)', 'Metode Scan', 'ID Perangkat', 'Catatan'],
    ...data.attendance.slice(0, 1500).map((a) => {
      const student = studentMap.get(a.student_id);
      return [
        a.id,
        a.date,
        a.timestamp ? new Date(a.timestamp).toLocaleTimeString('id-ID') : '-',
        a.student_id,
        student?.name || '-',
        student?.class_id || '-',
        a.session_id,
        a.status,
        a.late_minutes || 0,
        a.method || 'rfid',
        a.device_id || 'utama',
        a.notes || '',
      ];
    }),
  ];

  // 5. Format Izin Keluar rows
  const izinRows = [
    ['ID Izin', 'NIS', 'Nama Siswa', 'Kelas', 'Jenis Izin', 'Waktu Mulai', 'Batas Waktu', 'Waktu Kembali', 'Durasi (Menit)', 'Terlambat (Menit)', 'Status Izin', 'Metode Kembali', 'Catatan'],
    ...data.outOfClass.slice(0, 1000).map((o) => {
      const student = studentMap.get(o.student_id);
      return [
        o.id,
        o.student_id,
        student?.name || '-',
        o.class_id,
        o.type,
        new Date(o.started_at).toLocaleString('id-ID'),
        new Date(o.due_at).toLocaleTimeString('id-ID'),
        o.returned_at ? new Date(o.returned_at).toLocaleTimeString('id-ID') : '-',
        o.duration_minutes,
        o.late_return_minutes || 0,
        o.status,
        o.return_method || '-',
        o.return_notes || '',
      ];
    }),
  ];

  // 6. Format Pelanggaran rows
  const pelanggaranRows = [
    ['ID Pelanggaran', 'Tanggal & Waktu', 'NIS', 'Nama Siswa', 'Kelas', 'Jenis Pelanggaran', 'Kategori', 'Poin', 'Lokasi Kejadian', 'Petugas Pencatat', 'Keterangan'],
    ...data.violations.slice(0, 1000).map((v) => {
      const student = studentMap.get(v.student_id);
      return [
        v.id,
        new Date(v.recorded_at).toLocaleString('id-ID'),
        v.student_id,
        student?.name || '-',
        v.class_id,
        v.type_name,
        v.category,
        v.points,
        v.location || '-',
        v.recorded_by || 'Admin',
        v.notes || '',
      ];
    }),
  ];

  // 7. Format Pengaturan & Status
  const pengaturanRows = [
    ['Parameter Sistem', 'Nilai Saat Ini', 'Keterangan'],
    ['Nama Sekolah', data.settings.school_name, 'Nama identitas resmi sekolah'],
    ['Total Siswa Terdaftar', String(data.students.length), 'Jumlah siswa aktif & terdaftar'],
    ['Total Kelas', String(data.classes.length), 'Jumlah rombel kelas'],
    ['Total Catatan Presensi', String(data.attendance.length), 'Presensi tercatat di sistem'],
    ['Sinkron Terakhir', new Date().toLocaleString('id-ID'), 'Waktu sinkronisasi cloud real-time'],
    ['Mode Database', 'Google Sheets & Drive Terintegrasi', 'Database real-time cloud multi-device'],
  ];

  // Clear existing ranges then batch write
  const clearRanges = requiredSheets.map((title) => `${title}!A:Z`);
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ranges: clearRanges }),
  });

  // Batch update values
  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: 'Siswa!A1', values: siswaRows },
          { range: 'Kelas!A1', values: kelasRows },
          { range: 'Sesi_Presensi!A1', values: sesiRows },
          { range: 'Presensi!A1', values: presensiRows },
          { range: 'Izin_Keluar!A1', values: izinRows },
          { range: 'Pelanggaran!A1', values: pelanggaranRows },
          { range: 'Pengaturan!A1', values: pengaturanRows },
        ],
      }),
    }
  );

  if (!writeRes.ok) {
    const err = await writeRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal menulis data ke Google Sheets (${writeRes.status})`);
  }

  const result = await writeRes.json();
  return {
    success: true,
    rowsUpdated: result.totalUpdatedRows || siswaRows.length + presensiRows.length,
  };
};
