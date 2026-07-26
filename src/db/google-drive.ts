import { ref } from 'vue';
import { db, type CollectionSchema, type RecordEntry, type SavedView, type RecordTemplate } from './index';

// Reactive States for Google Drive Sync
export const isDriveConnected = ref(localStorage.getItem('bq_drive_connected') === 'true');
export const lastSyncTime = ref(localStorage.getItem('bq_last_sync_time') || '');
export const syncStatusMsg = ref('');
export const isSyncing = ref(false);

let googleGisClient: any = null;

/**
 * Load Google API script dynamically
 */
export function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById('google-gis-script')) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.id = 'google-gis-script';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Échec du chargement de Google GIS client.'));
    document.head.appendChild(script);
  });
}

/**
 * Initialize Google Identity Services Client
 */
export function initializeGisClient(clientId: string, callback: (token: string) => void) {
  if (googleGisClient) return;

  googleGisClient = (window as any).google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: (response: any) => {
      if (response.error) {
        syncStatusMsg.value = 'Authentification annulée ou refusée.';
        isDriveConnected.value = false;
        localStorage.setItem('bq_drive_connected', 'false');
        return;
      }
      const token = response.access_token;
      localStorage.setItem('bq_google_auth_token', token);
      localStorage.setItem('bq_google_token_expiry', String(Date.now() + (Number(response.expires_in) * 1000)));
      isDriveConnected.value = true;
      localStorage.setItem('bq_drive_connected', 'true');
      callback(token);
    }
  });
}

export function connectGoogleDrive() {
  if (googleGisClient) {
    googleGisClient.requestAccessToken();
  } else {
    const errorMsg = 'Erreur : Google Client non initialisé (vérifie que VITE_GOOGLE_CLIENT_ID est défini dans ton fichier .env local).';
    syncStatusMsg.value = errorMsg;
    console.error(errorMsg);
  }
}

export function disconnectGoogleDrive() {
  localStorage.removeItem('bq_google_auth_token');
  localStorage.removeItem('bq_google_token_expiry');
  localStorage.setItem('bq_drive_connected', 'false');
  isDriveConnected.value = false;
  syncStatusMsg.value = 'Compte Google déconnecté.';
}

export function checkSavedConnectionState() {
  const token = localStorage.getItem('bq_google_auth_token');
  const expiry = Number(localStorage.getItem('bq_google_token_expiry') || '0');
  
  if (token && Date.now() < expiry) {
    isDriveConnected.value = true;
    localStorage.setItem('bq_drive_connected', 'true');
  } else {
    disconnectGoogleDrive();
  }
}

async function getValidAuthToken(): Promise<string> {
  const token = localStorage.getItem('bq_google_auth_token');
  const expiry = Number(localStorage.getItem('bq_google_token_expiry') || '0');

  if (token && Date.now() < expiry) {
    return token;
  }

  return new Promise((resolve, reject) => {
    if (!googleGisClient) {
      reject(new Error('Google Client non initialisé.'));
      return;
    }
    googleGisClient.callback = (response: any) => {
      if (response.error) {
        reject(new Error('Authentification annulée.'));
        return;
      }
      const token = response.access_token;
      localStorage.setItem('bq_google_auth_token', token);
      localStorage.setItem('bq_google_token_expiry', String(Date.now() + (Number(response.expires_in) * 1000)));
      isDriveConnected.value = true;
      localStorage.setItem('bq_drive_connected', 'true');
      resolve(token);
    };
    googleGisClient.requestAccessToken();
  });
}

/**
 * Find the bq-metrics-sync.json file in user's Drive appFolder/root
 */
async function findSyncFileId(token: string): Promise<string | null> {
  const q = encodeURIComponent("name = 'bq-metrics-sync.json' and trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`;
  
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!resp.ok) {
    if (resp.status === 401) {
      disconnectGoogleDrive();
      throw new Error('Session Google expirée. Reconnecte-toi.');
    }
    throw new Error('Impossible d\'interroger Google Drive.');
  }
  
  const data = await resp.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

async function downloadCloudData(token: string, fileId: string): Promise<any> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!resp.ok) {
    throw new Error('Erreur de téléchargement de la sauvegarde.');
  }
  
  return await resp.json();
}

async function uploadCloudData(token: string, backupData: any, fileId?: string): Promise<string> {
  const metadata = {
    name: 'bq-metrics-sync.json',
    mimeType: 'application/json'
  };
  
  const boundary = 'bq_metrics_sync_boundary';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  
  const body = 
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(backupData, null, 2) +
    closeDelimiter;

  const url = fileId 
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    
  const method = fileId ? 'PATCH' : 'POST';

  const resp = await fetch(url, {
    method: method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: body
  });

  if (!resp.ok) {
    throw new Error('Erreur de téléversement vers Google Drive.');
  }

  const fileInfo = await resp.json();
  return fileInfo.id;
}

// --- Smart Merge Engine ---

function mergeLists(localList: any[], cloudList: any[]): any[] {
  const map = new Map<string, any>();
  
  // Insert all local items
  localList.forEach(item => {
    map.set(item.id, item);
  });
  
  // Merge cloud items
  cloudList.forEach(cloudItem => {
    const localItem = map.get(cloudItem.id);
    if (!localItem) {
      // Cloud item doesn't exist locally: accept it
      map.set(cloudItem.id, cloudItem);
    } else {
      // Conflict: compare last update timestamps
      const localTime = localItem.updatedAt || localItem.createdAt || 0;
      const cloudTime = cloudItem.updatedAt || cloudItem.createdAt || 0;
      
      if (cloudTime > localTime) {
        // Cloud item is newer: replace local
        map.set(cloudItem.id, cloudItem);
      }
      // Otherwise keep local item (it is newer or equal)
    }
  });
  
  return Array.from(map.values());
}

export async function syncMergeDatabase(cloudData: any): Promise<boolean> {
  const cloudCollections: CollectionSchema[] = cloudData.collections || [];
  const cloudRecords: RecordEntry[] = cloudData.records || [];
  const cloudViews: SavedView[] = cloudData.views || [];
  const cloudTemplates: RecordTemplate[] = cloudData.templates || [];

  const localCollections = await db.collections.toArray();
  const localRecords = await db.records.toArray();
  const localViews = await db.views.toArray();
  const localTemplates = await db.templates.toArray();

  // Merge each table
  const mergedCollections = mergeLists(localCollections, cloudCollections);
  const mergedRecords = mergeLists(localRecords, cloudRecords);
  const mergedViews = mergeLists(localViews, cloudViews);
  const mergedTemplates = mergeLists(localTemplates, cloudTemplates);

  await db.transaction('rw', [db.collections, db.records, db.views, db.templates], async () => {
    for (const c of mergedCollections) await db.collections.put(c);
    for (const r of mergedRecords) await db.records.put(r);
    for (const v of mergedViews) await db.views.put(v);
    for (const t of mergedTemplates) await db.templates.put(t);
  });

  return true;
}

/**
 * Trigger dynamic synchronisation with bq-metrics-sync.json file
 */
export async function triggerGoogleDriveSync(tokenOverride?: string): Promise<boolean> {
  isSyncing.value = true;
  syncStatusMsg.value = 'Connexion à Google Drive...';
  
  try {
    const token = tokenOverride || await getValidAuthToken();
    const fileId = await findSyncFileId(token);
    
    const localCollections = await db.collections.toArray();
    const localRecords = await db.records.toArray();
    const localViews = await db.views.toArray();
    const localTemplates = await db.templates.toArray();
    
    const localBackup = {
      version: 2,
      collections: localCollections,
      records: localRecords,
      views: localViews,
      templates: localTemplates,
      exportedAt: Date.now()
    };
    
    if (!fileId) {
      // Scenario A: First sync ever! Simply upload local data to a new file
      syncStatusMsg.value = 'Premier enregistrement sur Google Drive...';
      await uploadCloudData(token, localBackup);
    } else {
      // Scenario B: Sync file exists! Download, merge, and upload result
      syncStatusMsg.value = 'Téléchargement de la version Cloud...';
      const cloudBackup = await downloadCloudData(token, fileId);
      
      syncStatusMsg.value = 'Fusion des données locales et distantes...';
      await syncMergeDatabase(cloudBackup);
      
      // Get the freshly merged database state to save it back to the Cloud
      const mergedCollections = await db.collections.toArray();
      const mergedRecords = await db.records.toArray();
      const mergedViews = await db.views.toArray();
      const mergedTemplates = await db.templates.toArray();
      
      const mergedBackup = {
        version: 2,
        collections: mergedCollections,
        records: mergedRecords,
        views: mergedViews,
        templates: mergedTemplates,
        exportedAt: Date.now()
      };
      
      syncStatusMsg.value = 'Mise à jour du fichier sur Google Drive...';
      await uploadCloudData(token, mergedBackup, fileId);
    }
    
    const now = new Date();
    const dateStr = 'le ' + now.toLocaleDateString('fr-FR') + ' à ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    lastSyncTime.value = dateStr;
    localStorage.setItem('bq_last_sync_time', dateStr);
    
    syncStatusMsg.value = 'Données synchronisées avec succès.';
    isSyncing.value = false;
    return true;
  } catch (err: any) {
    isSyncing.value = false;
    syncStatusMsg.value = err.message || 'Erreur lors de la synchronisation.';
    console.error('Erreur Synchro Drive:', err);
    return false;
  }
}
