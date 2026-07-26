import { db, type RecordEntry } from './index';

// Dedicated Collection IDs
export const STOCK_COL_ID = 'col-ixd02dr3f';
export const RECIPES_COL_ID = 'col-19qpwiufk';
export const PLANNING_COL_ID = 'col-ba3rfr5qk';
export const ACHATS_COL_ID = 'col-e8jz89jel';

/**
 * Format a YYYY-MM-DD date into DD/MM/YYYY French format
 */
export function formatToFrenchDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Fetch all stock records (active and not deleted)
 */
export async function getStockRecords(): Promise<RecordEntry[]> {
  const recs = await db.records.where('collectionId').equals(STOCK_COL_ID).toArray();
  return recs.filter(r => !r.deletedAt).sort((a, b) => {
    const valA = String(a.data.nom || '').trim();
    const valB = String(b.data.nom || '').trim();
    return valA.localeCompare(valB, 'fr', { sensitivity: 'base' });
  });
}

/**
 * Fetch all recipe records (active and not deleted)
 */
export async function getRecipeRecords(): Promise<RecordEntry[]> {
  const recs = await db.records.where('collectionId').equals(RECIPES_COL_ID).toArray();
  return recs.filter(r => !r.deletedAt).sort((a, b) => {
    const valA = String(a.data.nom || '').trim();
    const valB = String(b.data.nom || '').trim();
    return valA.localeCompare(valB, 'fr', { sensitivity: 'base' });
  });
}

/**
 * Fetch all planning records (active and not deleted, sorted by date desc)
 */
export async function getPlanningRecords(): Promise<RecordEntry[]> {
  const recs = await db.records.where('collectionId').equals(PLANNING_COL_ID).toArray();
  return recs.filter(r => !r.deletedAt).sort((a, b) => {
    const dateA = String(a.data.date || '');
    const dateB = String(b.data.date || '');
    // Sort descending (most recent first)
    if (dateA !== dateB) {
      return dateB.localeCompare(dateA);
    }
    // Secondary sort by moment (Midi before Soir)
    const momentA = String(a.data.moment || '');
    const momentB = String(b.data.moment || '');
    if (momentA === 'Midi') return -1;
    if (momentB === 'Midi') return 1;
    return 0;
  });
}

/**
 * Fetch all purchase history records (active and not deleted, sorted by date desc)
 */
export async function getPurchaseRecords(): Promise<RecordEntry[]> {
  const recs = await db.records.where('collectionId').equals(ACHATS_COL_ID).toArray();
  return recs.filter(r => !r.deletedAt).sort((a, b) => {
    return String(b.data.date || '').localeCompare(String(a.data.date || ''));
  });
}

/**
 * Run stock automations:
 * 1. Increment stock on grocery purchase (Courses - Achats)
 * 2. Decrement stock on meal prepared/consumed (Journal & Planning)
 */
export async function runStockAutomations(record: RecordEntry, isNew: boolean) {
  try {
    // 1. Grocery Purchase (Courses - Achats) -> Increment stock
    if (record.collectionId === ACHATS_COL_ID) {
      if (!isNew) return; // Only trigger on new purchase

      const productName = record.data.produit_generique;
      const quantite = Number(record.data.quantite) || 0;
      const contenance = Number(record.data.contenance_unitaire) || 0;

      if (productName && quantite > 0 && contenance > 0) {
        const stockItems = await getStockRecords();
        const stockItem = stockItems.find(item => String(item.data.nom || '').toLowerCase() === productName.toLowerCase());

        if (stockItem) {
          const currentQty = Number(stockItem.data.quantite) || 0;
          stockItem.data.quantite = Math.round((currentQty + (quantite * contenance)) * 100) / 100;
          stockItem.updatedAt = Date.now();
          await db.records.put(stockItem);
        }
      }
    }

    // 2. Meal Consumption/Preparation (Journal & Planning) -> Decrement stock
    if (record.collectionId === PLANNING_COL_ID) {
      const isConsumedOrPrepared = record.data.statut === 'Consommé' || record.data.statut === 'Préparé';
      const alreadyDecremented = record.data.stock_decremente === true;

      if (isConsumedOrPrepared && !alreadyDecremented) {
        const ingredients = record.data.ingredients_consommes || [];
        const convives = Number(record.data.convives) || 1;

        for (const ingId of ingredients) {
          const stockItem = await db.records.get(ingId);
          if (stockItem && !stockItem.deletedAt) {
            const currentQty = Number(stockItem.data.quantite) || 0;
            const portionStd = Number(stockItem.data.quantite_standard_portion) || 1;
            const decrement = convives * portionStd;

            stockItem.data.quantite = Math.max(0, Math.round((currentQty - decrement) * 100) / 100);
            stockItem.updatedAt = Date.now();
            await db.records.put(stockItem);
          }
        }

        // Mark as decremented to avoid repeating the operation
        record.data.stock_decremente = true;
        record.updatedAt = Date.now();
        await db.records.put(record);
      }
    }
  } catch (err) {
    console.error('Erreur lors de l\'exécution des automatisations de stock:', err);
  }
}
