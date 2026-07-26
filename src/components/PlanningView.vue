<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { db, generateId, type RecordEntry } from '../db';
import { PLANNING_COL_ID, getPlanningRecords, getRecipeRecords, getStockRecords, runStockAutomations, formatToFrenchDate } from '../db/queries';
import { Plus, Trash2, Calendar, User, X, Play } from '@lucide/vue';

const planningList = ref<RecordEntry[]>([]);
const recipes = ref<RecordEntry[]>([]);
const stockItems = ref<RecordEntry[]>([]);
const showAddModal = ref(false);

// Form States
const formDate = ref(new Date().toISOString().split('T')[0]);
const formMoment = ref<'Midi' | 'Soir' | 'Autre'>('Midi');
const formRepasId = ref('');
const formConvives = ref(1);
const formIngredients = ref<string[]>([]);
const formCommentaire = ref('');

const loadData = async () => {
  planningList.value = await getPlanningRecords();
  recipes.value = await getRecipeRecords();
  stockItems.value = await getStockRecords();
};

onMounted(() => {
  loadData();
});

const onRepasChange = () => {
  if (!formRepasId.value) {
    formIngredients.value = [];
    return;
  }
  const selectedRecipe = recipes.value.find(r => r.id === formRepasId.value);
  if (selectedRecipe && selectedRecipe.data.ingredients) {
    // Automatically prefill actual ingredients from the default recipe ingredients!
    formIngredients.value = [...selectedRecipe.data.ingredients];
  } else {
    formIngredients.value = [];
  }
};

const openAddModal = () => {
  formDate.value = new Date().toISOString().split('T')[0];
  formMoment.value = 'Midi';
  formRepasId.value = '';
  formConvives.value = 1;
  formIngredients.value = [];
  formCommentaire.value = '';
  showAddModal.value = true;
};

const handleSavePlanning = async () => {
  if (!formRepasId.value) {
    alert('Le choix du repas est obligatoire.');
    return;
  }

  try {
    const record: RecordEntry = {
      id: `rec-${generateId()}`,
      collectionId: PLANNING_COL_ID,
      data: {
        date: formDate.value,
        moment: formMoment.value,
        repas: formRepasId.value,
        convives: formConvives.value || 1,
        ingredients_consommes: formIngredients.value,
        statut: 'Prévu',
        stock_decremente: false,
        commentaire: formCommentaire.value.trim()
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await db.records.add(record);
    showAddModal.value = false;
    await loadData();
  } catch (err) {
    console.error('Erreur lors de la planification du repas:', err);
  }
};

const handleDeletePlanning = async (id: string) => {
  if (confirm('Es-tu sûr de vouloir retirer ce repas du planning ?')) {
    try {
      await db.records.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
      await loadData();
    } catch (err) {
      console.error('Erreur lors de la suppression:', err);
    }
  }
};

const handleMarkAsConsumed = async (rec: RecordEntry) => {
  try {
    // Update record to 'Consommé' and let the automation handle stock deduction!
    await db.records.update(rec.id!, {
      'data.statut': 'Consommé',
      updatedAt: Date.now()
    });
    
    // Fetch refreshed record
    const updatedRec = await db.records.get(rec.id!);
    if (updatedRec) {
      await runStockAutomations(updatedRec, false);
    }
    
    await loadData();
    alert('Repas consommé ! Les stocks correspondants ont été déduits.');
  } catch (err) {
    console.error('Erreur lors du décompte de stock:', err);
  }
};

const getMealFeasibility = (rec: RecordEntry): 'disponible' | 'partiel' | 'rupture' | 'N/A' => {
  if (rec.data.statut === 'Consommé' || rec.data.stock_decremente) {
    return 'N/A';
  }

  const ingredients = rec.data.ingredients_consommes || [];
  const convives = Number(rec.data.convives) || 1;

  if (ingredients.length === 0) return 'N/A';

  let sufficientCount = 0;

  for (const ingId of ingredients) {
    const stockItem = stockItems.value.find(item => item.id === ingId);
    if (stockItem) {
      const currentStock = Number(stockItem.data.quantite) || 0;
      const portionStd = Number(stockItem.data.quantite_standard_portion) || 1;
      const requiredQty = convives * portionStd;

      if (currentStock >= requiredQty) {
        sufficientCount++;
      }
    }
  }

  if (sufficientCount === ingredients.length) return 'disponible';
  if (sufficientCount > 0) return 'partiel';
  return 'rupture';
};
</script>

<template>
  <div class="planning-view">
    <div class="view-header-row">
      <div class="title-sub">
        <h2>Mon Planning de Repas</h2>
        <p class="desc">Planifie tes repas et suis la faisabilité de tes stocks</p>
      </div>
      <button @click="openAddModal" class="btn btn-primary btn-sm">
        <Plus class="btn-icon" /> Planifier un repas
      </button>
    </div>

    <!-- Planning Timeline List -->
    <div class="planning-list">
      <div v-if="planningList.length === 0" class="empty-state text-center card glass">
        <Calendar class="empty-icon" />
        <p>Rien de prévu dans ton planning. Programme tes repas de la semaine !</p>
      </div>

      <div 
        v-else 
        v-for="rec in planningList" 
        :key="rec.id" 
        class="card glass planning-card"
      >
        <div class="planning-card-header">
          <div class="date-badge">
            <span class="day-num">{{ formatToFrenchDate(rec.data.date) }}</span>
            <span class="moment-label" :class="rec.data.moment?.toLowerCase()">{{ rec.data.moment }}</span>
          </div>

          <div class="meal-info">
            <h3>{{ recipes.find(r => r.id === rec.data.repas)?.data.nom || 'Repas inconnu' }}</h3>
            <p v-if="rec.data.commentaire" class="commentaire-text">"{{ rec.data.commentaire }}"</p>
            <div class="meal-meta">
              <span><User class="meta-icon" /> {{ rec.data.convives || 1 }} pers</span>
              <span>•</span>
              <span class="status-indicator" :class="rec.data.statut?.toLowerCase()">{{ rec.data.statut }}</span>
            </div>
          </div>

          <!-- Feasibility Badge -->
          <div class="feasibility-section">
            <span v-if="getMealFeasibility(rec) === 'disponible'" class="feasibility-badge true">
              🟢 Stock Suffisant
            </span>
            <span v-else-if="getMealFeasibility(rec) === 'partiel'" class="feasibility-badge warning">
              🟡 Stock Partiel
            </span>
            <span v-else-if="getMealFeasibility(rec) === 'rupture'" class="feasibility-badge false">
              🔴 Ingrédients Manquants
            </span>
          </div>

          <!-- Actions -->
          <div class="planning-actions">
            <button 
              v-if="rec.data.statut === 'Prévu'" 
              @click="handleMarkAsConsumed(rec)" 
              class="btn btn-accent btn-xs"
              title="Marquer comme consommé et déduire du stock"
            >
              <Play class="btn-icon-xs" /> Consommer
            </button>
            <button @click="handleDeletePlanning(rec.id!)" class="btn btn-danger-link btn-xs" title="Supprimer">
              <Trash2 class="trash-icon" /> Supprimer
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Planning Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
          <div class="modal-card card glass fade-in">
            <div class="modal-header">
              <h2>Planifier un Repas</h2>
              <button @click="showAddModal = false" class="btn-close-modal"><X /></button>
            </div>
            <div class="modal-body text-left">
              <div class="form-row">
                <div class="form-group flex-1">
                  <label for="planDate">Date du repas</label>
                  <input id="planDate" v-model="formDate" type="date" class="form-control" />
                </div>
                <div class="form-group flex-1 ml-3">
                  <label for="planMoment">Moment</label>
                  <select id="planMoment" v-model="formMoment" class="form-control">
                    <option value="Midi">Midi</option>
                    <option value="Soir">Soir</option>
                    <option value="Autre">Autre (En-cas, Brunch)</option>
                  </select>
                </div>
              </div>

              <div class="form-row mt-3">
                <div class="form-group flex-1">
                  <label for="planRepas">Choisir une recette</label>
                  <select id="planRepas" v-model="formRepasId" @change="onRepasChange" class="form-control">
                    <option value="" disabled>-- Sélectionner une recette --</option>
                    <option v-for="r in recipes" :key="r.id" :value="r.id">
                      {{ r.data.nom }}
                    </option>
                  </select>
                </div>
                <div class="form-group flex-1 ml-3" style="max-width: 130px;">
                  <label for="planConvives">Convives</label>
                  <input id="planConvives" v-model.number="formConvives" type="number" class="form-control" min="1" />
                </div>
              </div>

              <!-- Custom Ingredients selector for this meal instance -->
              <div class="form-group mt-3" v-if="formRepasId">
                <label>Ingrédients consommés pour cette fois</label>
                <p class="field-tip">Ajuste la liste des ingrédients réellement utilisés pour ce repas spécifique.</p>
                <div class="ingredients-selection-list">
                  <label v-for="item in stockItems" :key="item.id" class="checkbox-container export-item">
                    <input type="checkbox" :value="item.id" v-model="formIngredients" />
                    <span class="checkmark"></span>
                    <span class="label-text">
                      {{ item.data.nom }} 
                      <span class="text-secondary" style="font-size: 0.8rem;">
                        (Reste : {{ item.data.quantite || 0 }} {{ item.data.unite || 'unité' }})
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div class="form-group mt-3">
                <label for="planComment">Commentaire / Note</label>
                <input id="planComment" v-model="formCommentaire" type="text" class="form-control" placeholder="Ex: Anniversaire, repas léger, etc." />
              </div>
            </div>
            <div class="modal-footer">
              <button @click="showAddModal = false" class="btn btn-secondary">Annuler</button>
              <button @click="handleSavePlanning" class="btn btn-primary">Ajouter au planning</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.planning-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.planning-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.planning-card {
  padding: 1.25rem;
}

.planning-card-header {
  display: grid;
  grid-template-columns: 140px 1fr 180px 180px;
  align-items: center;
  gap: 1.5rem;
  text-align: left;
}

.date-badge {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  
  .day-num {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-primary);
  }
  
  .moment-label {
    align-self: flex-start;
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    border: 1px solid transparent;
    
    &.midi {
      background-color: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
      border-color: #f59e0b;
    }
    
    &.soir {
      background-color: rgba(59, 130, 246, 0.15);
      color: #3b82f6;
      border-color: #3b82f6;
    }
    
    &.autre {
      background-color: rgba(139, 92, 246, 0.15);
      color: #8b5cf6;
      border-color: #8b5cf6;
    }
  }
}

.meal-info {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  
  h3 {
    font-size: 1.2rem;
    font-weight: 800;
    margin: 0;
    color: var(--text-primary);
  }
  
  .commentaire-text {
    font-size: 0.85rem;
    font-style: italic;
    color: var(--text-muted);
    margin: 0;
  }
}

.meal-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  
  .meta-icon {
    width: 14px;
    height: 14px;
    vertical-align: text-top;
  }
  
  .status-indicator {
    font-weight: 700;
    
    &.prévu {
      color: #94a3b8;
    }
    
    &.consommé {
      color: #10b981;
    }
    
    &.préparé {
      color: #3b82f6;
    }
  }
}

.feasibility-section {
  display: flex;
  justify-content: center;
}

.feasibility-badge {
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.4rem 0.85rem;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  
  &.true {
    background-color: rgba(16, 185, 129, 0.15);
    color: #10b981;
    border-color: #10b981;
  }
  
  &.warning {
    background-color: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
    border-color: #f59e0b;
  }
  
  &.false {
    background-color: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    border-color: #ef4444;
  }
}

.planning-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.ingredients-selection-list {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background-color: rgba(0, 0, 0, 0.15);
  max-height: 200px;
  overflow-y: auto;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.btn-danger-link {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.8rem;
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-sm);
  transition: var(--transition);
  
  &:hover {
    color: var(--color-danger);
    background-color: rgba(239, 68, 68, 0.1);
  }
  
  .trash-icon {
    width: 13px;
    height: 13px;
  }
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

@media (max-width: 992px) {
  .planning-card-header {
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .feasibility-section {
    justify-content: flex-start;
  }
  .planning-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 576px) {
  .planning-card-header {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}
</style>
