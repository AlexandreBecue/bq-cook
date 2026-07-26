<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { db, generateId, type RecordEntry } from '../db';
import { STOCK_COL_ID, getStockRecords } from '../db/queries';
import { Plus, Trash2, Edit2, AlertCircle, Check, X } from '@lucide/vue';

const stocks = ref<RecordEntry[]>([]);
const showAddModal = ref(false);
const editingStock = ref<RecordEntry | null>(null);

// Form States
const formNom = ref('');
const formCategorie = ref('Épicerie Salée');
const formQuantite = ref(0);
const formSeuil = ref(0);
const formUnite = ref('unité');

const categories = [
  'Viandes & Poissons',
  'Fruits & Légumes',
  'Produits Laitiers',
  'Épicerie Sucrée',
  'Épicerie Salée',
  'Boissons',
  'Hygiène'
];

const loadData = async () => {
  stocks.value = await getStockRecords();
};

onMounted(() => {
  loadData();
});

const openAddModal = () => {
  editingStock.value = null;
  formNom.value = '';
  formCategorie.value = 'Épicerie Salée';
  formQuantite.value = 0;
  formSeuil.value = 0;
  formUnite.value = 'unité';
  showAddModal.value = true;
};

const openEditModal = (rec: RecordEntry) => {
  editingStock.value = rec;
  formNom.value = rec.data.nom || '';
  formCategorie.value = rec.data.categorie || 'Épicerie Salée';
  formQuantite.value = Number(rec.data.quantite) || 0;
  formSeuil.value = Number(rec.data.seuil_d_alerte) || 0;
  formUnite.value = rec.data.unite || 'unité';
  showAddModal.value = true;
};

const handleSaveStock = async () => {
  if (!formNom.value.trim()) {
    alert('Le nom du produit est obligatoire.');
    return;
  }

  try {
    const data = {
      nom: formNom.value.trim(),
      categorie: formCategorie.value,
      quantite: Number(formQuantite.value) || 0,
      seuil_d_alerte: Number(formSeuil.value) || 0,
      unite: formUnite.value || 'unité',
      date_de_peremption: ''
    };

    if (editingStock.value) {
      await db.records.update(editingStock.value.id!, {
        data,
        updatedAt: Date.now()
      });
    } else {
      const record: RecordEntry = {
        id: `rec-${generateId()}`,
        collectionId: STOCK_COL_ID,
        data,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await db.records.add(record);
    }

    showAddModal.value = false;
    await loadData();
  } catch (err) {
    console.error('Erreur lors de la sauvegarde du produit:', err);
  }
};

const handleDeleteStock = async (id: string) => {
  if (confirm('Es-tu sûr de vouloir supprimer ce produit de l\'inventaire ?')) {
    try {
      await db.records.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
      await loadData();
    } catch (err) {
      console.error('Erreur lors de la suppression:', err);
    }
  }
};
</script>

<template>
  <div class="stocks-view">
    <div class="view-header-row">
      <div class="title-sub">
        <h2>Mon Inventaire de Stocks</h2>
        <p class="desc">Gère les quantités réelles de tes ingrédients et herbes</p>
      </div>
      <button @click="openAddModal" class="btn btn-primary btn-sm">
        <Plus class="btn-icon" /> Ajouter un ingrédient
      </button>
    </div>

    <!-- Stock Levels Board -->
    <div class="stocks-container card glass">
      <div class="table-responsive">
        <table class="stocks-table">
          <thead>
            <tr>
              <th>Ingrédient</th>
              <th>Catégorie</th>
              <th class="text-center">Quantité</th>
              <th class="text-center">Seuil d'alerte</th>
              <th class="text-center">Statut</th>
              <th class="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="stocks.length === 0">
              <td colspan="6" class="empty-cell text-center">Aucun ingrédient en stock. Crée des fiches pour démarrer.</td>
            </tr>
            <tr 
              v-else 
              v-for="rec in stocks" 
              :key="rec.id"
              :class="{ 'alert-row': Number(rec.data.quantite) <= Number(rec.data.seuil_d_alerte) }"
            >
              <td>
                <span class="stock-name">{{ rec.data.nom }}</span>
              </td>
              <td>
                <span class="category-tag">{{ rec.data.categorie }}</span>
              </td>
              <td class="text-center bold-qty">
                {{ rec.data.quantite }} {{ rec.data.unite }}
              </td>
              <td class="text-center text-muted">
                {{ rec.data.seuil_d_alerte }} {{ rec.data.unite }}
              </td>
              <td class="text-center">
                <span 
                  v-if="Number(rec.data.quantite) <= Number(rec.data.seuil_d_alerte)" 
                  class="status-badge alert"
                >
                  <AlertCircle class="status-icon" /> À acheter
                </span>
                <span v-else class="status-badge ok">
                  <Check class="status-icon" /> Suffisant
                </span>
              </td>
              <td class="text-right">
                <div class="cell-actions inline-actions">
                  <button @click="openEditModal(rec)" class="btn-action-round edit" title="Modifier">
                    <Edit2 class="action-icon" />
                  </button>
                  <button @click="handleDeleteStock(rec.id!)" class="btn-action-round delete" title="Supprimer">
                    <Trash2 class="action-icon" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add/Edit Stock Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
          <div class="modal-card card glass fade-in">
            <div class="modal-header">
              <h2>{{ editingStock ? 'Modifier un ingrédient' : 'Ajouter un ingrédient' }}</h2>
              <button @click="showAddModal = false" class="btn-close-modal"><X /></button>
            </div>
            <div class="modal-body text-left">
              <div class="form-group">
                <label for="stockName">Nom du produit</label>
                <input id="stockName" v-model="formNom" type="text" class="form-control" placeholder="Ex: Pâtes" />
              </div>

              <div class="form-row">
                <div class="form-group flex-1">
                  <label for="stockCat">Catégorie</label>
                  <select id="stockCat" v-model="formCategorie" class="form-control">
                    <option v-for="cat in categories" :key="cat" :value="cat">
                      {{ cat }}
                    </option>
                  </select>
                </div>
                <div class="form-group flex-1 ml-3" style="max-width: 140px;">
                  <label for="stockUnite">Unité d'usage</label>
                  <input id="stockUnite" v-model="formUnite" type="text" class="form-control" placeholder="unité, g, L" />
                </div>
              </div>

              <div class="form-row mt-3">
                <div class="form-group flex-1">
                  <label for="stockQty">Quantité actuelle</label>
                  <input id="stockQty" v-model.number="formQuantite" type="number" step="0.1" class="form-control" min="0" />
                </div>
                <div class="form-group flex-1 ml-3">
                  <label for="stockSeuil">Seuil d'alerte</label>
                  <input id="stockSeuil" v-model.number="formSeuil" type="number" step="0.1" class="form-control" min="0" />
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button @click="showAddModal = false" class="btn btn-secondary">Annuler</button>
              <button @click="handleSaveStock" class="btn btn-primary">Enregistrer</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.stocks-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.stocks-container {
  overflow: hidden;
  padding: 0;
}

.stocks-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  
  th, td {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border-color);
  }
  
  th {
    background-color: rgba(0, 0, 0, 0.15);
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--text-secondary);
  }
  
  tr {
    transition: var(--transition);
    
    &:hover {
      background-color: rgba(255, 255, 255, 0.015);
    }
    
    &.alert-row {
      background-color: rgba(239, 68, 68, 0.02);
      
      &:hover {
        background-color: rgba(239, 68, 68, 0.04);
      }
    }
  }
}

.stock-name {
  font-weight: 700;
  color: var(--text-primary);
}

.category-tag {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  background-color: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-color);
  padding: 0.2rem 0.5rem;
  border-radius: var(--radius-sm);
}

.bold-qty {
  font-weight: 800;
  color: var(--text-primary);
}

.status-badge {
  font-size: 0.8rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.65rem;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  
  &.alert {
    background-color: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    border-color: #ef4444;
  }
  
  &.ok {
    background-color: rgba(16, 185, 129, 0.15);
    color: #10b981;
    border-color: #10b981;
  }
  
  .status-icon {
    width: 12px;
    height: 12px;
  }
}

.cell-actions.inline-actions {
  display: inline-flex;
  gap: 0.5rem;
}

.form-row {
  display: flex;
}
.flex-1 {
  flex: 1;
}
.ml-3 {
  margin-left: 0.75rem;
}
.text-muted {
  color: var(--text-muted);
}
</style>
