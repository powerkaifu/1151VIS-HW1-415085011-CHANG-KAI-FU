import { ref, computed } from 'vue'
import * as d3 from 'd3'

// 📁 CSV 檔案路徑（放在 public/data 目錄，Vite 直接靜態服務）
const CSV_PATH = '/data/學12-3.新生(含境外生)註冊率-以「校」統計.csv'

// 🎨 設立別顏色對應（藍橘安全配色，色盲友善）
export const COLOR_MAP = {
  '公立': '#4575b4', // 藍色
  '私立': '#f46d43', // 橘色
}

// 🔖 危機分級閾值
const THRESHOLD_DANGER  = 60  // 退場警戒
const THRESHOLD_WARNING = 80  // 需關注

/**
 * 🔧 將原始 CSV 字串中的千分位數值轉為 Number
 * 例如 "4,110" → 4110，"-" 或 "" → null
 */
function parseNum(str) {
  if (!str || str.trim() === '-' || str.trim() === '...') return null
  const n = parseFloat(str.replace(/,/g, ''))
  return isNaN(n) ? null : n
}

/**
 * 🔧 計算危機分級（Derive 衍生屬性）
 * @param {number|null} rate 新生註冊率
 * @returns {'退場警戒'|'需關注'|'健康'|'未知'}
 */
function calcCrisisLevel(rate) {
  if (rate === null) return '未知'
  if (rate < THRESHOLD_DANGER)  return '退場警戒'
  if (rate < THRESHOLD_WARNING) return '需關注'
  return '健康'
}

/**
 * 🚀 useEnrollmentData — 大專院校新生註冊率資料 Composable
 *
 * 回傳：
 *  - isLoading: Ref<Boolean>
 *  - error: Ref<String|null>
 *  - allData: Ref<Array>         — 全部清洗後的資料
 *  - availableYears: ComputedRef<Array<String>> — 可選學年度清單（降冪）
 *  - getDataByYear(year): 依學年度篩選的資料陣列
 *  - trendData: ComputedRef      — 各年度公私立平均註冊率（供折線圖使用）
 */
export function useEnrollmentData() {
  const isLoading = ref(true)
  const error     = ref(null)
  const allData   = ref([])

  // 📥 載入並清洗資料
  async function loadData() {
    try {
      isLoading.value = true
      error.value = null

      const raw = await d3.csv(CSV_PATH, (row) => {
        const quota    = parseNum(row['當學年度全校總量內核定新生招生名額(A)'])
        const reserved = parseNum(row['當學年度全校新生保留入學資格人數(B)'])
        const enrolled = parseNum(row['當學年度全校總量內新生招生核定名額之實際註冊人數(C)'])
        const overseas = parseNum(row['當學年度全校境外(新生)學生實際註冊人數(D)'])
        const rateStr  = row['當學年度全校新生註冊率(％)E=〔(C+D)/(A-B+D)〕*100％']
        const rate     = parseNum(rateStr)

        // 🚨 過濾掉無效資料（無名額或無學校名稱）
        if (!quota || !row['學校名稱']) return null

        // ✅ 衍生指標
        const deficit      = (quota !== null && enrolled !== null) ? quota - enrolled : null
        const crisisLevel  = calcCrisisLevel(rate)
        const year         = row['學年度']?.trim()
        const ownership    = row['設立別']?.trim()
        const schoolType   = row['學校類別']?.trim()
        const schoolName   = row['學校名稱']?.trim()
        const schoolCode   = row['學校統計處代碼']?.trim()

        return {
          year,        // 學年度（字串 '106' ~ '114'）
          ownership,   // 公立 | 私立
          schoolType,  // 一般大學 | 技專校院 | 宗教研修學院
          schoolName,  // 學校名稱
          schoolCode,  // 學校代碼
          quota,       // 核定名額
          reserved,    // 保留入學資格人數
          enrolled,    // 實際註冊人數
          overseas,    // 境外生人數
          rate,        // 新生註冊率（%）
          deficit,     // 招生缺額（衍生）
          crisisLevel, // 危機分級（衍生）
        }
      })

      // 過濾 null（d3.csv 的 row function 回傳 null 會自動排除，但保險起見）
      allData.value = raw.filter(Boolean)
    } catch (err) {
      error.value = `資料載入失敗：${err.message}`
      console.error('❌ useEnrollmentData 載入錯誤:', err)
    } finally {
      isLoading.value = false
    }
  }

  // 📅 可選學年度清單（降冪排列，最新學年度在前）
  const availableYears = computed(() => {
    const years = [...new Set(allData.value.map(d => d.year))]
    return years.sort((a, b) => Number(b) - Number(a))
  })

  /**
   * 📊 依學年度篩選資料（供散佈圖使用）
   * @param {string} year 學年度字串，例如 '114'
   */
  function getDataByYear(year) {
    return allData.value.filter(d => d.year === year)
  }

  // 📈 折線圖資料：各學年度 × 設立別 的平均註冊率
  const trendData = computed(() => {
    const grouped = d3.group(
      allData.value.filter(d => d.rate !== null),
      d => d.year,
      d => d.ownership
    )

    const result = []
    for (const [year, ownershipMap] of grouped) {
      for (const [ownership, records] of ownershipMap) {
        const avgRate = d3.mean(records, d => d.rate)
        result.push({ year, ownership, avgRate: Math.round(avgRate * 100) / 100 })
      }
    }

    // 依學年度升冪排列
    return result.sort((a, b) => Number(a.year) - Number(b.year))
  })

  // 🚀 初始化時自動載入
  loadData()

  return {
    isLoading,
    error,
    allData,
    availableYears,
    getDataByYear,
    trendData,
    THRESHOLD_DANGER,
    THRESHOLD_WARNING,
  }
}
