<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { db, importDatabase, exportDatabase } from '../db';
import { 
  isDriveConnected, 
  lastSyncTime, 
  syncStatusMsg, 
  isSyncing, 
  loadGoogleScript, 
  initializeGisClient, 
  connectGoogleDrive, 
  disconnectGoogleDrive, 
  checkSavedConnectionState, 
  triggerGoogleDriveSync 
} from '../db/google-drive';
import { Download, Upload, Trash2, Check, AlertTriangle, FileJson, Cloud, RefreshCw, LogOut } from '@lucide/vue';

const emit = defineEmits(['data-updated']);

const isImporting = ref(false);
const statusMessage = ref('');
const isError = ref(false);
const showConfirmClear = ref(false);
const isDbEmpty = ref(true);

const checkDbStatus = async () => {
  const count = await db.records.count();
  isDbEmpty.value = count === 0;
};

onMounted(async () => {
  checkSavedConnectionState();
  await checkDbStatus();
  try {
    await loadGoogleScript();
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (clientId) {
      initializeGisClient(clientId, async (token) => {
        const success = await triggerGoogleDriveSync(token);
        if (success) {
          emit('data-updated');
          await checkDbStatus();
        }
      });
    } else {
      console.warn("Google Client ID manquant.");
    }
  } catch (err) {
    console.error("Échec du chargement du script Google GIS:", err);
  }
});

const handleSyncNow = async () => {
  const success = await triggerGoogleDriveSync();
  if (success) {
    emit('data-updated');
    await checkDbStatus();
  }
};

const handleExport = async () => {
  try {
    const backupJson = await exportDatabase();
    const blob = new Blob([backupJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `bq-cook-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    statusMessage.value = 'Sauvegarde exportée avec succès !';
    isError.value = false;
  } catch (err) {
    statusMessage.value = 'Erreur lors de l\'exportation.';
    isError.value = true;
  }
};

const handleImport = (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  
  const file = input.files[0];
  const reader = new FileReader();
  
  isImporting.value = true;
  statusMessage.value = 'Importation en cours...';
  
  reader.onload = async (e) => {
    try {
      const jsonText = e.target?.result as string;
      const result = await importDatabase(jsonText);
      if (result.success) {
        statusMessage.value = 'Données fusionnées et importées avec succès !';
        isError.value = false;
        emit('data-updated');
        await checkDbStatus();
      } else {
        statusMessage.value = result.error || 'Erreur lors de l\'importation.';
        isError.value = true;
      }
    } catch (err) {
      statusMessage.value = 'Fichier JSON invalide ou corrompu.';
      isError.value = true;
    } finally {
      isImporting.value = false;
      setTimeout(() => {
        statusMessage.value = '';
      }, 5000);
    }
  };
  
  reader.readAsText(file);
};

const handleClearDatabase = async () => {
  try {
    await db.transaction('rw', [db.collections, db.records, db.views, db.templates], async () => {
      await db.collections.clear();
      await db.records.clear();
      await db.views.clear();
      await db.templates.clear();
    });
    showConfirmClear.value = false;
    statusMessage.value = 'Application réinitialisée ! Base de données vidée.';
    isError.value = false;
    emit('data-updated');
    await checkDbStatus();
  } catch (err) {
    console.error(err);
  }
};
</script>

<template>
  <div class="settings-view">
    <div class="view-header">
      <h1>Paramètres ⚙️</h1>
      <p class="desc">Gère tes sauvegardes et ta synchronisation cloud Google Drive</p>
    </div>

    <div class="settings-grid">
      <!-- Google Drive Sync Card -->
      <div class="card glass">
        <div class="card-header">
          <div class="icon-wrapper primary">
            <Cloud class="icon" />
          </div>
          <h2>Synchronisation Google Drive</h2>
        </div>
        <p class="card-desc">
          Connecte ton compte Google pour activer la synchronisation croisée et sauvegarder tes stocks, tes recettes et ton planning directement sur ton espace Drive personnel.
        </p>

        <div class="sync-actions-box">
          <button v-if="!isDriveConnected" @click="connectGoogleDrive" class="btn btn-primary bg-drive">
            <Cloud class="btn-icon" />
            Connecter Google Drive
          </button>
          
          <div v-else class="drive-active-box">
            <div class="drive-status-info">
              <span class="status-indicator-green">🟢 Connecté à Google Drive</span>
              <button @click="disconnectGoogleDrive" class="btn btn-danger-outline btn-xs">
                <LogOut class="btn-icon-xs" /> Déconnecter
              </button>
            </div>

            <!-- Sync Dashboard -->
            <div class="drive-status-box">
              <div class="status-row-item">
                <span class="status-label">Dernière synchro :</span>
                <span class="status-value">{{ lastSyncTime || 'Jamais' }}</span>
              </div>
              <div class="status-row-item" v-if="isSyncing || syncStatusMsg">
                <span class="status-label">Statut :</span>
                <span class="status-value text-muted status-msg-box">
                  <RefreshCw v-if="isSyncing" class="btn-icon animate-spin" />
                  {{ syncStatusMsg }}
                </span>
              </div>
            </div>

            <button @click="handleSyncNow" :disabled="isSyncing" class="btn btn-primary mt-3">
              <RefreshCw :class="['btn-icon', isSyncing ? 'animate-spin' : '']" />
              Synchroniser maintenant
            </button>
          </div>
        </div>
      </div>

      <!-- Backup Card -->
      <div class="card glass">
        <div class="card-header">
          <div class="icon-wrapper accent">
            <FileJson class="icon" />
          </div>
          <h2>Sauvegarde locale</h2>
        </div>
        <p class="card-desc">
          Exporte une sauvegarde locale de tes fiches culinaires sous forme de fichier JSON, ou restaure une sauvegarde existante.
        </p>
        
        <div class="actions-group">
          <button @click="handleExport" class="btn btn-primary" :disabled="isDbEmpty">
            <Download class="btn-icon" />
            Exporter mes données (JSON)
          </button>
          
          <label class="btn btn-secondary cursor-pointer">
            <Upload class="btn-icon" />
            Importer une sauvegarde
            <input type="file" accept=".json" @change="handleImport" class="hidden-input" />
          </label>
        </div>
      </div>

      <!-- Danger Zone -->
      <div v-if="!isDbEmpty" class="card glass danger-card">
        <div class="card-header">
          <div class="icon-wrapper danger">
            <Trash2 class="icon" />
          </div>
          <h2>Réinitialisation des données</h2>
        </div>
        <p class="card-desc">
          Cette action supprimera définitivement toutes tes collections de cuisine, recettes et historique d'achats sur cet appareil.
        </p>

        <button v-if="!showConfirmClear" @click="showConfirmClear = true" class="btn btn-danger">
          <Trash2 class="btn-icon" />
          Réinitialiser l'application
        </button>

        <div v-else class="confirm-box">
          <p class="confirm-title">Es-tu absolument sûr ?</p>
          <p class="confirm-desc">Toutes tes données locales seront perdues à jamais.</p>
          <div class="confirm-actions">
            <button @click="handleClearDatabase" class="btn btn-danger btn-sm">Oui, tout supprimer</button>
            <button @click="showConfirmClear = false" class="btn btn-secondary btn-sm">Annuler</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Toast Notification -->
    <Transition name="toast">
      <div v-if="statusMessage" :class="['toast-notification', isError ? 'error' : 'success']">
        <Check v-if="!isError" class="toast-icon" />
        <AlertTriangle v-else class="toast-icon" />
        <span>{{ statusMessage }}</span>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  
  .icon-wrapper {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    
    &.primary {
      background-color: rgba(59, 130, 246, 0.15);
      color: var(--color-primary);
    }
    
    &.accent {
      background-color: rgba(139, 92, 246, 0.15);
      color: var(--color-accent);
    }
    
    &.danger {
      background-color: rgba(239, 68, 68, 0.15);
      color: var(--color-danger);
    }
  }
  
  h2 {
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0;
  }
}

.card-desc {
  font-size: 0.9rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 1.5rem;
}

.actions-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sync-actions-box {
  display: flex;
  flex-direction: column;
}

.drive-active-box {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.drive-status-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  font-weight: 600;
  color: #10b981;
}

.drive-status-box {
  background-color: rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  text-align: left;
}

.status-row-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  
  .status-label {
    color: var(--text-secondary);
    font-weight: 500;
  }
  .status-value {
    color: var(--text-primary);
    font-weight: 700;
  }
}

.status-msg-box {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.bg-drive {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
  border-color: #059669 !important;
  
  &:hover {
    background: linear-gradient(135deg, #059669 0%, #047857 100%) !important;
    border-color: #047857 !important;
  }
}

.danger-card {
  border-color: rgba(239, 68, 68, 0.2);
  
  &:hover {
    border-color: var(--color-danger) !important;
    box-shadow: 0 0 20px rgba(239, 68, 68, 0.1) !important;
  }
}

.confirm-box {
  background-color: rgba(239, 68, 68, 0.05);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: var(--radius-md);
  padding: 1rem;
  
  .confirm-title {
    font-weight: 700;
    color: var(--color-danger);
    margin-bottom: 0.25rem;
  }
  
  .confirm-desc {
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin-bottom: 1rem;
  }
  
  .confirm-actions {
    display: flex;
    gap: 0.75rem;
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.animate-spin {
  animation: spin 1s linear infinite;
}

.cursor-pointer {
  cursor: pointer;
}
.hidden-input {
  display: none;
}
.mt-3 {
  margin-top: 0.75rem;
}
</style>
