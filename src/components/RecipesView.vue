<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { db, generateId, type RecordEntry } from '../db';
import { RECIPES_COL_ID, getRecipeRecords, getStockRecords } from '../db/queries';
import { Plus, Trash2, Clock, BookOpen, Utensils, X, Check } from '@lucide/vue';

const recipes = ref<RecordEntry[]>([]);
const stockItems = ref<RecordEntry[]>([]);
const showAddModal = ref(false);
const activeRecipe = ref<RecordEntry | null>(null);

// Form States
const formName = ref('');
const formPrepTime = ref<number | undefined>(15);
const formCookTime = ref<number | undefined>(20);
const formIngredients = ref<string[]>([]);

const loadData = async () => {
  recipes.value = await getRecipeRecords();
  stockItems.value = await getStockRecords();
};

onMounted(() => {
  loadData();
});

const openAddModal = () => {
  formName.value = '';
  formPrepTime.value = 15;
  formCookTime.value = 20;
  formIngredients.value = [];
  showAddModal.value = true;
};

const handleSaveRecipe = async () => {
  if (!formName.value.trim()) {
    alert('Le nom de la recette est obligatoire.');
    return;
  }

  try {
    const record: RecordEntry = {
      id: `rec-${generateId()}`,
      collectionId: RECIPES_COL_ID,
      data: {
        nom: formName.value.trim(),
        ingredients: formIngredients.value,
        temps_de_preparation: formPrepTime.value || 10,
        temps_de_cuisson: formCookTime.value || 15
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await db.records.add(record);
    showAddModal.value = false;
    await loadData();
  } catch (err) {
    console.error('Erreur lors de l\'enregistrement de la recette:', err);
  }
};

const handleDeleteRecipe = async (id: string) => {
  if (confirm('Es-tu sûr de vouloir supprimer cette recette ?')) {
    try {
      await db.records.update(id, { deletedAt: Date.now(), updatedAt: Date.now() });
      await loadData();
    } catch (err) {
      console.error('Erreur lors de la suppression:', err);
    }
  }
};

const getIngredientNames = (ingIds: string[]) => {
  if (!ingIds || ingIds.length === 0) return 'Aucun ingrédient spécifié';
  return ingIds
    .map(id => stockItems.value.find(item => item.id === id)?.data.nom || '')
    .filter(Boolean)
    .join(', ');
};
</script>

<template>
  <div class="recipes-view">
    <div class="view-header-row">
      <div class="title-sub">
        <h2>Mes Recettes</h2>
        <p class="desc">Gère tes idées de repas habituels</p>
      </div>
      <button @click="openAddModal" class="btn btn-primary btn-sm">
        <Plus class="btn-icon" /> Ajouter une recette
      </button>
    </div>

    <!-- Recipes Grid -->
    <div class="recipes-grid">
      <div v-if="recipes.length === 0" class="empty-state text-center card glass">
        <BookOpen class="empty-icon" />
        <p>Aucune recette disponible. Ajoute ta première recette pour commencer !</p>
      </div>

      <div 
        v-else 
        v-for="rec in recipes" 
        :key="rec.id" 
        class="card glass hoverable recipe-card"
        @click="activeRecipe = rec"
      >
        <div class="recipe-card-header">
          <div class="recipe-icon-wrapper">
            <Utensils class="recipe-icon" />
          </div>
          <h3>{{ rec.data.nom }}</h3>
        </div>

        <div class="recipe-meta">
          <span class="meta-item"><Clock class="meta-icon" /> Prép : {{ rec.data.temps_de_preparation || 10 }}m</span>
          <span class="meta-item"><Clock class="meta-icon" /> Cuisson : {{ rec.data.temps_de_cuisson || 15 }}m</span>
        </div>

        <p class="ingredients-preview">
          <strong>Ingrédients :</strong> {{ getIngredientNames(rec.data.ingredients) }}
        </p>

        <div class="recipe-card-actions" @click.stop>
          <button @click="handleDeleteRecipe(rec.id!)" class="btn btn-danger-link btn-xs" title="Supprimer la recette">
            <Trash2 class="trash-icon" /> Supprimer
          </button>
        </div>
      </div>
    </div>

    <!-- Active Recipe Modal Dialog -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="activeRecipe" class="modal-overlay" @click.self="activeRecipe = null">
          <div class="modal-card card glass fade-in">
            <div class="modal-header">
              <h2>{{ activeRecipe.data.nom }}</h2>
              <button @click="activeRecipe = null" class="btn-close-modal"><X /></button>
            </div>
            <div class="modal-body text-left">
              <div class="modal-meta-row">
                <div class="meta-badge"><Clock class="badge-icon" /> Préparation : {{ activeRecipe.data.temps_de_preparation || 10 }} min</div>
                <div class="meta-badge"><Clock class="badge-icon" /> Cuisson : {{ activeRecipe.data.temps_de_cuisson || 15 }} min</div>
              </div>

              <div class="modal-section mt-4">
                <h4>Ingrédients requis :</h4>
                <ul class="ingredients-list">
                  <li v-for="ingId in activeRecipe.data.ingredients" :key="ingId" class="ingredient-item-row">
                    <Check class="check-icon" />
                    <span>{{ stockItems.find(item => item.id === ingId)?.data.nom || 'Ingrédient inconnu' }}</span>
                  </li>
                  <li v-if="!activeRecipe.data.ingredients || activeRecipe.data.ingredients.length === 0" class="no-ingredients">
                    Aucun ingrédient configuré pour cette recette.
                  </li>
                </ul>
              </div>
            </div>
            <div class="modal-footer">
              <button @click="activeRecipe = null" class="btn btn-secondary">Fermer</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Add Recipe Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
          <div class="modal-card card glass fade-in">
            <div class="modal-header">
              <h2>Ajouter une Recette</h2>
              <button @click="showAddModal = false" class="btn-close-modal"><X /></button>
            </div>
            <div class="modal-body text-left">
              <div class="form-group">
                <label for="recName">Nom de la recette</label>
                <input id="recName" v-model="formName" type="text" class="form-control" placeholder="Ex: Carbonara" />
              </div>

              <div class="form-row">
                <div class="form-group flex-1">
                  <label for="prepTime">Temps de préparation (min)</label>
                  <input id="prepTime" v-model.number="formPrepTime" type="number" class="form-control" min="0" />
                </div>
                <div class="form-group flex-1 ml-3">
                  <label for="cookTime">Temps de cuisson (min)</label>
                  <input id="cookTime" v-model.number="formCookTime" type="number" class="form-control" min="0" />
                </div>
              </div>

              <div class="form-group mt-3">
                <label>Ingrédients requis</label>
                <div class="ingredients-selection-list">
                  <label v-for="item in stockItems" :key="item.id" class="checkbox-container export-item">
                    <input type="checkbox" :value="item.id" v-model="formIngredients" />
                    <span class="checkmark"></span>
                    <span class="label-text">{{ item.data.nom }}</span>
                  </label>
                  <p v-if="stockItems.length === 0" class="field-tip error-text">Aucun produit en stock disponible. Crée des fiches dans l'onglet Stocks d'abord.</p>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button @click="showAddModal = false" class="btn btn-secondary">Annuler</button>
              <button @click="handleSaveRecipe" class="btn btn-primary">Enregistrer la recette</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.recipes-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.recipes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.25rem;
}

.recipe-card {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  text-align: left;
  cursor: pointer;
  position: relative;
}

.recipe-card-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  
  .recipe-icon-wrapper {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    background-color: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-primary);
  }
  
  h3 {
    font-size: 1.15rem;
    font-weight: 700;
    margin: 0;
    color: var(--text-primary);
  }
}

.recipe-meta {
  display: flex;
  gap: 1rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  
  .meta-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  
  .meta-icon {
    width: 14px;
    height: 14px;
  }
}

.ingredients-preview {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.4;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-grow: 1;
}

.recipe-card-actions {
  display: flex;
  justify-content: flex-end;
  border-top: 1px dashed var(--border-color);
  padding-top: 0.5rem;
  margin-top: 0.25rem;
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
  padding: 0.25rem;
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

/* Modal layout refinements */
.modal-meta-row {
  display: flex;
  gap: 1rem;
  
  .meta-badge {
    background-color: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-color);
    border-radius: 999px;
    padding: 0.4rem 0.85rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 0.35rem;
    
    .badge-icon {
      width: 14px;
      height: 14px;
      color: var(--color-primary);
    }
  }
}

.ingredients-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.ingredient-item-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  color: var(--text-primary);
  
  .check-icon {
    width: 16px;
    height: 16px;
    color: #10b981;
  }
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

.no-ingredients, .no-recipe {
  font-style: italic;
  color: var(--text-muted);
  font-size: 0.9rem;
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
.error-text {
  color: var(--color-danger);
}
</style>
