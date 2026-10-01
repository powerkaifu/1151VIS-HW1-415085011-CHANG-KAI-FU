<script setup>
import { ref, computed, watch } from 'vue'
import { useEnrollmentData } from './composables/useEnrollmentData.js'
import ScatterPlot from './components/ScatterPlot.vue'
import TrendLine   from './components/TrendLine.vue'

// 📊 載入資料
const {
  isLoading,
  error,
  availableYears,
  getDataByYear,
  trendData,
  THRESHOLD_DANGER,
} = useEnrollmentData()

// 📅 目前選取的學年度（預設最新學年度）
const selectedYear = ref('')

// ✅ 一旦資料載入完成，自動設定預設學年度為最新一年
watch(availableYears, (years) => {
  if (years.length && !selectedYear.value) {
    selectedYear.value = years[0] // 陣列已降冪，第一個為最新
  }
}, { immediate: true })

// 📋 當前學年度的散佈圖資料
const currentYearData = computed(() =>
  selectedYear.value ? getDataByYear(selectedYear.value) : []
)
</script>

<template>
  <div class="app-container">
    <!-- 頁面標題區 -->
    <header class="page-header">
      <h1 class="page-title">少子化背景下的大專院校新生招生變化</h1>
      <p class="page-desc">
        資料來源：教育部大專校院校務資訊公開平臺｜學12-3. 新生（含境外生）註冊率－以「校」統計
      </p>
    </header>

    <!-- 載入中 -->
    <div v-if="isLoading" class="loading-state">
      ⏳ 資料載入中，請稍候…
    </div>

    <!-- 錯誤狀態 -->
    <div v-else-if="error" class="error-state">
      ❌ {{ error }}
    </div>

    <!-- 主內容 -->
    <main v-else class="main-content">
      <!-- 學年度選擇器 -->
      <div class="year-selector">
        <label for="year-select" class="selector-label">選擇學年度</label>
        <select
          id="year-select"
          v-model="selectedYear"
          class="selector-dropdown"
        >
          <option
            v-for="y in availableYears"
            :key="y"
            :value="y"
          >
            {{ y }} 學年度
          </option>
        </select>
        <span class="selector-hint">
          共 {{ currentYearData.length }} 所學校資料
        </span>
      </div>

      <!-- 雙圖區塊 -->
      <div class="charts-layout">
        <!-- 主圖：散佈圖 -->
        <div class="chart-primary">
          <ScatterPlot
            :data="currentYearData"
            :year="selectedYear"
            :danger-threshold="THRESHOLD_DANGER"
          />
        </div>

        <!-- 副圖：折線圖 -->
        <div class="chart-secondary">
          <TrendLine
            :trend-data="trendData"
            :selected-year="selectedYear"
            :danger-threshold="THRESHOLD_DANGER"
          />
        </div>
      </div>
    </main>

    <!-- 頁尾 -->
    <footer class="page-footer">
      <p>1151VIS-HW1 ｜ 415085011 CHANG-KAI-FU</p>
    </footer>
  </div>
</template>

<style>
/* 全域重置 */
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  font-family: 'Noto Sans TC', system-ui, -apple-system, sans-serif;
  background: #f4f6f9;
  color: #2c3e50;
}
</style>

<style scoped>
.app-container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 28px;
}

/* 頁面標題 */
.page-header {
  margin-bottom: 24px;
}
.page-title {
  font-size: 22px;
  font-weight: 800;
  color: #1a1a2e;
  margin: 0 0 6px 0;
}
.page-desc {
  font-size: 12.5px;
  color: #888;
  margin: 0;
}

/* 學年度選擇器 */
.year-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.selector-label {
  font-size: 14px;
  font-weight: 600;
  color: #444;
}
.selector-dropdown {
  padding: 7px 14px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 14px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.2s;
}
.selector-dropdown:focus {
  outline: none;
  border-color: #4575b4;
}
.selector-hint {
  font-size: 12px;
  color: #999;
}

/* 雙圖佈局 */
.charts-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
}
@media (min-width: 1100px) {
  .charts-layout {
    grid-template-columns: 3fr 2fr;
  }
}

/* 載入 / 錯誤狀態 */
.loading-state,
.error-state {
  text-align: center;
  padding: 60px 20px;
  font-size: 16px;
  color: #666;
}
.error-state { color: #e63946; }

/* 頁尾 */
.page-footer {
  margin-top: 32px;
  text-align: center;
  font-size: 12px;
  color: #bbb;
}
</style>
