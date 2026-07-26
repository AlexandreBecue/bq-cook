<script setup lang="ts">
import { ref } from 'vue';
import PlanningView from './components/PlanningView.vue';
import RecipesView from './components/RecipesView.vue';
import StocksView from './components/StocksView.vue';
import CoursesView from './components/CoursesView.vue';
import SettingsView from './components/SettingsView.vue';
import { Calendar, BookOpen, Layers, ShoppingCart, Settings } from '@lucide/vue';
import './style.scss';

const activeTab = ref<'planning' | 'recipes' | 'stocks' | 'courses' | 'settings'>(
  (localStorage.getItem('bq-cook-active-tab') as any) || 'planning'
);

const handleNavigate = (tab: 'planning' | 'recipes' | 'stocks' | 'courses' | 'settings') => {
  activeTab.value = tab;
  localStorage.setItem('bq-cook-active-tab', tab);
};

// Key state to force reload active view on data update
const viewKey = ref(0);
const triggerDataUpdate = () => {
  viewKey.value++;
};
</script>

<template>
  <div class="app-shell">
    <!-- Main Header -->
    <header class="app-header glass">
      <div class="logo">
        <span class="logo-emoji">🍳</span>
        <h1>bq-cook</h1>
        <span class="logo-sub">Assistant Culinaire</span>
      </div>
    </header>

    <!-- Main Scrollable App Container -->
    <main class="app-content">
      <PlanningView v-if="activeTab === 'planning'" :key="'plan-' + viewKey" @data-updated="triggerDataUpdate" />
      <RecipesView v-else-if="activeTab === 'recipes'" :key="'rec-' + viewKey" @data-updated="triggerDataUpdate" />
      <StocksView v-else-if="activeTab === 'stocks'" :key="'stock-' + viewKey" @data-updated="triggerDataUpdate" />
      <CoursesView v-else-if="activeTab === 'courses'" :key="'course-' + viewKey" @data-updated="triggerDataUpdate" />
      <SettingsView v-else-if="activeTab === 'settings'" :key="'set-' + viewKey" @data-updated="triggerDataUpdate" />
    </main>

    <!-- Mobile Bottom Navigation Bar -->
    <nav class="bottom-nav glass">
      <button 
        @click="handleNavigate('planning')" 
        :class="['nav-item', activeTab === 'planning' ? 'active' : '']"
      >
        <Calendar class="nav-icon" />
        <span class="nav-label">Planning</span>
      </button>
      
      <button 
        @click="handleNavigate('recipes')" 
        :class="['nav-item', activeTab === 'recipes' ? 'active' : '']"
      >
        <BookOpen class="nav-icon" />
        <span class="nav-label">Recettes</span>
      </button>
      
      <button 
        @click="handleNavigate('stocks')" 
        :class="['nav-item', activeTab === 'stocks' ? 'active' : '']"
      >
        <Layers class="nav-icon" />
        <span class="nav-label">Stocks</span>
      </button>
      
      <button 
        @click="handleNavigate('courses')" 
        :class="['nav-item', activeTab === 'courses' ? 'active' : '']"
      >
        <ShoppingCart class="nav-icon" />
        <span class="nav-label">Courses</span>
      </button>
      
      <button 
        @click="handleNavigate('settings')" 
        :class="['nav-item', activeTab === 'settings' ? 'active' : '']"
      >
        <Settings class="nav-icon" />
        <span class="nav-label">Options</span>
      </button>
    </nav>
  </div>
</template>

<style lang="scss">
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  position: relative;
  background-color: var(--bg-primary);
  color: var(--text-primary);
}

.app-header {
  position: sticky;
  top: 0;
  width: 100%;
  height: 60px;
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  z-index: 1000;
  display: flex;
  align-items: center;
  padding: 0 1.5rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  
  .logo-emoji {
    font-size: 1.5rem;
  }
  
  h1 {
    font-size: 1.35rem;
    font-weight: 900;
    letter-spacing: -0.025em;
    background: linear-gradient(135deg, #f8fafc 0%, #94a3b8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  
  .logo-sub {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background-color: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border-color);
    padding: 0.15rem 0.45rem;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
  }
}

.app-content {
  flex-grow: 1;
  padding: 1.5rem 1.5rem 80px 1.5rem; /* bottom padding to clear the Bottom Bar */
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
}

/* Bottom Bar mobile navigation */
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  background-color: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  z-index: 1000;
  display: flex;
  justify-content: space-around;
  align-items: center;
  box-shadow: 0 -4px 10px rgba(0, 0, 0, 0.3);
  padding: 0 0.5rem;
}

.nav-item {
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  color: var(--text-muted);
  width: 18%;
  padding: 0.5rem 0;
  border-radius: var(--radius-sm);
  transition: var(--transition);
  outline: none;
  
  &:hover {
    color: var(--text-secondary);
  }
  
  &.active {
    color: var(--color-primary);
    
    .nav-icon {
      filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.4));
    }
  }
}

.nav-icon {
  width: 22px;
  height: 22px;
  transition: var(--transition);
}

.nav-label {
  font-size: 0.725rem;
  font-weight: 700;
  letter-spacing: 0.015em;
}

@media (min-width: 768px) {
  .app-header {
    height: 64px;
  }
  .app-content {
    padding: 2rem 2rem 90px 2rem;
  }
}
</style>
