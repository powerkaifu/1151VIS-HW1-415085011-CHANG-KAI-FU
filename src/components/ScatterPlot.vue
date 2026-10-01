<script setup>
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { COLOR_MAP } from '../composables/useEnrollmentData.js'

// ========== Emits ==========
const emit = defineEmits(['select-school'])

// ========== Props ==========
const props = defineProps({
  /** 當前學年度的資料陣列（每筆 = 一所學校） */
  data: {
    type: Array,
    required: true,
  },
  /** 選取的學年度字串，例如 '114' */
  year: {
    type: String,
    required: true,
  },
  /** 教育部退場警戒線（預設 60%） */
  dangerThreshold: {
    type: Number,
    default: 60,
  },
  /** 篩選模式：all | public | private | danger */
  filterType: {
    type: String,
    default: 'all',
  },
  /** 目前選取或搜尋的學校名稱 */
  selectedSchool: {
    type: String,
    default: '',
  },
})

// 計算篩選後是否有有效資料（用於 Empty State）
import { computed } from 'vue'
const filteredCount = computed(() => {
  let d = props.data.filter(d => d.rate !== null && d.quota !== null && d.quota > 0)
  if (props.filterType === 'public') d = d.filter(d => d.ownership === '公立')
  else if (props.filterType === 'private') d = d.filter(d => d.ownership === '私立')
  else if (props.filterType === 'danger') d = d.filter(d => d.rate < props.dangerThreshold)
  return d.length
})

// ========== DOM 參照 ==========
const svgRef     = ref(null)
const tooltipRef = ref(null)

// ========== 圖表常數（Margin Convention） ==========
const MARGIN = { top: 32, right: 36, bottom: 64, left: 68 }
const WIDTH  = 1000
const HEIGHT = 520

const INNER_W = WIDTH  - MARGIN.left - MARGIN.right
const INNER_H = HEIGHT - MARGIN.top  - MARGIN.bottom

// 🏷️ 簡化校名
function cleanName(name) {
  if (!name) return ''
  return name.replace(/學校財團法人/g, '').replace(/財團法人/g, '').replace(/(.+?)\1+/g, '$1').trim()
}

// ========== 繪圖邏輯 ==========
function render() {
  if (!svgRef.value || !props.data.length) return

  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const g = svg
    .append('g')
    .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

  // 1️⃣ 過濾有效資料
  let validData = props.data.filter(
    d => d.rate !== null && d.quota !== null && d.quota > 0
  )

  // 根據 filterType 過濾
  if (props.filterType === 'public') {
    validData = validData.filter(d => d.ownership === '公立')
  } else if (props.filterType === 'private') {
    validData = validData.filter(d => d.ownership === '私立')
  } else if (props.filterType === 'danger') {
    validData = validData.filter(d => d.rate < props.dangerThreshold)
  }

  // 2️⃣ 比例尺
  const maxQuota = d3.max(props.data, d => d.quota) || 10000
  const xScale = d3.scaleLinear()
    .domain([0, maxQuota * 1.05])
    .range([0, INNER_W])
    .nice()

  const yScale = d3.scaleLinear()
    .domain([0, 100])  // 嚴守 0~100% 完整軸
    .range([INNER_H, 0])

  // 3️⃣ 水平背景網格線
  g.append('g')
    .attr('class', 'grid-lines')
    .call(
      d3.axisLeft(yScale)
        .ticks(5)
        .tickSize(-INNER_W)
        .tickFormat('')
    )
    .selectAll('line')
    .attr('stroke', '#f1f5f9')
    .attr('stroke-width', 1)
  g.select('.grid-lines .domain').remove()

  // 4️⃣ 坐標軸刻度
  g.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${INNER_H})`)
    .call(
      d3.axisBottom(xScale)
        .ticks(6)
        .tickFormat(d => d >= 10000 ? `${d / 1000}k` : d.toLocaleString())
    )

  g.append('g')
    .attr('class', 'y-axis')
    .call(
      d3.axisLeft(yScale)
        .ticks(10)
        .tickFormat(d => `${d}%`)
    )

  // 坐標軸標籤
  g.append('text')
    .attr('x', INNER_W / 2)
    .attr('y', INNER_H + 54)
    .attr('text-anchor', 'middle')
    .attr('fill', '#64748b')
    .attr('font-size', '13px')
    .attr('font-weight', '600')
    .text('核定招生名額（人）')

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -INNER_H / 2)
    .attr('y', -54)
    .attr('text-anchor', 'middle')
    .attr('fill', '#64748b')
    .attr('font-size', '13px')
    .attr('font-weight', '600')
    .text('新生註冊率（%）')

  // 5️⃣ 60% 退場警戒區間底色與虛線
  g.append('rect')
    .attr('x', 0)
    .attr('y', yScale(props.dangerThreshold))
    .attr('width', INNER_W)
    .attr('height', INNER_H - yScale(props.dangerThreshold))
    .attr('fill', '#ef4444')
    .attr('fill-opacity', 0.04)

  g.append('line')
    .attr('x1', 0)
    .attr('x2', INNER_W)
    .attr('y1', yScale(props.dangerThreshold))
    .attr('y2', yScale(props.dangerThreshold))
    .attr('stroke', '#ef4444')
    .attr('stroke-width', 1.8)
    .attr('stroke-dasharray', '5,4')

  g.append('text')
    .attr('x', INNER_W - 6)
    .attr('y', yScale(props.dangerThreshold) - 10)
    .attr('text-anchor', 'end')
    .attr('fill', '#dc2626')
    .attr('font-size', '13px')
    .attr('font-weight', '700')
    .text(`⚠️ 關注門檻 ${props.dangerThreshold}%（參考歷史私校輔導指標）`)

  // 6️⃣ 工具函式：Tooltip 與焦點管理
  const tooltip = d3.select(tooltipRef.value)
  const hasSelected = !!props.selectedSchool

  function showTooltip(d) {
    const badgeStyle = getBadgeMeta(d.crisisLevel)
    tooltip
      .style('opacity', 1)
      .html(`
        <div class="tip-header">
          <span class="tip-title">${cleanName(d.schoolName)}</span>
          <span class="tip-badge" style="background:${badgeStyle.bg}; color:${badgeStyle.color};">${d.crisisLevel}</span>
        </div>
        <div class="tip-meta">${d.ownership} · ${d.schoolType}</div>
        <div class="tip-divider"></div>
        <div class="tip-grid">
          <span class="tip-lbl">新生註冊率</span>
          <span class="tip-val highlight" style="color:${d.rate < 60 ? '#f87171' : (d.rate < 80 ? '#fbbf24' : '#ffffff')}">${d.rate?.toFixed(2)}%</span>
          <span class="tip-lbl">核定名額</span>
          <span class="tip-val">${d.quota?.toLocaleString()} 人</span>
          <span class="tip-lbl">實際註冊</span>
          <span class="tip-val">${d.enrolled?.toLocaleString()} 人</span>
          <span class="tip-lbl">名額差額 (A-C)</span>
          <span class="tip-val">${d.deficit !== null ? (d.deficit > 0 ? `-${d.deficit.toLocaleString()}` : '0') : '無'} 人</span>
        </div>
        <div class="tip-action-hint">👆 點擊即可鎖定查看 9 年歷年軌跡</div>
      `)

    // 🌟 圓點右側防遮擋定位：預設顯示在圓點右側，保留 20px 安全間隔，絕不遮住圓點
    const cx = xScale(d.quota) + MARGIN.left
    const cy = yScale(d.rate) + MARGIN.top
    const tipWidth = 310
    const tipHeight = 220

    let left = cx + 20
    if (left + tipWidth > WIDTH - 16) {
      left = cx - tipWidth - 20
    }

    let top = cy - tipHeight / 2
    if (top < 12) top = 12
    if (top + tipHeight > HEIGHT - 12) top = HEIGHT - tipHeight - 12

    tooltip
      .style('left', `${left}px`)
      .style('top',  `${top}px`)
  }

  function hideTooltip() {
    tooltip.style('opacity', 0)
  }

  // 焦點切換函式（圓點與標籤文字共用）
  function highlightTarget(schoolName, d) {
    dots.attr('fill-opacity', 0.15).attr('stroke-opacity', 0.2)
    
    // 聚焦目標圓點（放大、加粗邊框、外發光、置頂）
    dots.filter(dot => dot.schoolName === schoolName)
      .raise()
      .attr('r', 11)
      .attr('fill-opacity', 1)
      .attr('stroke', '#0f172a')
      .attr('stroke-width', 2.8)
      .style('filter', 'drop-shadow(0 0 6px rgba(37, 99, 235, 0.7))')

    showTooltip(d)
  }

  function resetHighlight() {
    dots
      .attr('r', d => (props.selectedSchool && d.schoolName === props.selectedSchool) ? 10 : 6)
      .attr('fill-opacity', d => {
        if (!hasSelected) return 0.8
        return d.schoolName === props.selectedSchool ? 1 : 0.15
      })
      .attr('stroke', d => (props.selectedSchool && d.schoolName === props.selectedSchool) ? '#0f172a' : '#ffffff')
      .attr('stroke-width', d => (props.selectedSchool && d.schoolName === props.selectedSchool) ? 2.5 : 1)
      .attr('stroke-opacity', 1)
      .style('filter', 'none')

    hideTooltip()
  }

  // 7️⃣ 繪製資料點群組（純粹圓點展示，滑鼠懸停顯示 Tooltip 詳情）
  const dotsGroup = g.append('g').attr('class', 'dots-group')

  const dots = dotsGroup.selectAll('circle.dot')
    .data(validData, d => `${d.year}-${d.schoolCode}`)
    .join('circle')
    .attr('class', 'dot')
    .attr('cx', d => xScale(d.quota))
    .attr('cy', d => yScale(d.rate))
    .attr('r', d => (props.selectedSchool && d.schoolName === props.selectedSchool) ? 10 : 6)
    .attr('fill', d => COLOR_MAP[d.ownership] ?? '#94a3b8')
    .attr('fill-opacity', d => {
      if (!hasSelected) return 0.8
      return d.schoolName === props.selectedSchool ? 1 : 0.15
    })
    .attr('stroke', d => (props.selectedSchool && d.schoolName === props.selectedSchool) ? '#0f172a' : '#ffffff')
    .attr('stroke-width', d => (props.selectedSchool && d.schoolName === props.selectedSchool) ? 2.5 : 1)
    .attr('cursor', 'pointer')
    // 點擊選取學校
    .on('click', function (event, d) {
      emit('select-school', d.schoolName)
    })
    // 游標互動
    .on('mouseover', function (event, d) {
      highlightTarget(d.schoolName, d)
    })
    .on('mouseleave', function () {
      resetHighlight()
    })

}

function getBadgeMeta(level) {
  if (level === '未達 60%') return { bg: '#fee2e2', color: '#991b1b' }
  if (level === '60% ~ 80%') return { bg: '#fef3c7', color: '#92400e' }
  return { bg: '#dcfce7', color: '#166534' }
}

watch(() => [props.data, props.year, props.filterType, props.selectedSchool], render, { deep: false })
onMounted(render)
</script>

<template>
  <div class="scatter-card">
    <div class="card-header">
      <div class="header-left">
        <h2 class="chart-title">各校招生規模與新生註冊率分佈</h2>
        <p class="chart-subtitle">
          每個圓點代表一所學校 · 滑鼠懸停查看即時數據 · <span class="highlight-action">點擊任一點可鎖定歷史走勢</span>
        </p>
      </div>

      <!-- 🌟 乾淨獨立的圖例與狀態標籤（置於卡片頂部，絕不與資料點遮擋衝突） -->
      <div class="header-right">
        <div class="header-legend">
          <span class="legend-item">
            <span class="legend-dot public"></span>
            公立學校
          </span>
          <span class="legend-item">
            <span class="legend-dot private"></span>
            私立學校
          </span>
          <span class="legend-item">
            <span class="legend-line danger"></span>
            60% 關注線
          </span>
        </div>
        <div class="status-indicator">
          <span class="live-dot"></span>
          <span class="live-text">{{ year }} 學年度</span>
        </div>
      </div>
    </div>

    <!-- SVG 畫布區域 -->
    <div class="canvas-wrapper">
      <svg
        ref="svgRef"
        :width="1000"
        :height="520"
        viewBox="0 0 1000 520"
        class="chart-svg"
        :style="{ opacity: filteredCount === 0 ? 0 : 1 }"
      />

      <!-- 🆕 空狀態提示（篩選後無資料） -->
      <div v-if="filteredCount === 0" class="empty-state">
        <span class="empty-icon">📊</span>
        <p class="empty-text">此學年度無符合篩選條件的學校資料</p>
        <p class="empty-sub">請嘗試切換學年度或調整屬性篩選條件</p>
      </div>

      <!-- 現代深色毛玻璃 Tooltip -->
      <div
        ref="tooltipRef"
        class="modern-tooltip"
      />
    </div>

    <!-- 底部數據註腳 -->
    <div class="card-footer">
      <div class="footnote">
        * 教育部官方公式 E = (C+D) / (A−B+D) × 100%，本圖 Y 軸直接呈現官方公布之學校端新生註冊率；超過 100% 者以 100% 計。
      </div>
      <div class="threshold-legend">
        <span class="danger-dot"></span> 低於 60% 門檻學校共
        <strong>{{ data.filter(d => d.rate !== null && d.rate < dangerThreshold).length }}</strong> 所
      </div>
    </div>
  </div>
</template>

<style scoped>
.scatter-card {
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.04), 0 2px 4px -2px rgba(0, 0, 0, 0.02);
  padding: 24px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.chart-title {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 4px 0;
  letter-spacing: -0.01em;
}

.chart-subtitle {
  font-size: 14px;
  color: #475569;
  margin: 0;
}

.highlight-action {
  color: #2563eb;
  font-weight: 600;
}

/* 🌟 卡片右上方圖例與狀態列 */
.header-right {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.header-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px 14px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13.5px;
  font-weight: 600;
  color: #334155;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.legend-dot.public {
  background: #4575b4;
}
.legend-dot.private {
  background: #f46d43;
}

.legend-line.danger {
  width: 18px;
  height: 0;
  display: inline-block;
  border-top: 2px dashed #ef4444;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #f1f5f9;
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2563eb;
}

.canvas-wrapper {
  position: relative;
  width: 100%;
  overflow: hidden;
}

.chart-svg {
  display: block;
  width: 100%;
  height: auto;
}

/* 🆕 空狀態提示卡片 */
.empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  padding: 32px 48px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  pointer-events: none;
}

.empty-icon {
  font-size: 36px;
  display: block;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 15px;
  font-weight: 600;
  color: #334155;
  margin: 0 0 6px 0;
}

.empty-sub {
  font-size: 13px;
  color: #94a3b8;
  margin: 0;
}

/* 現代深冷毛玻璃 Tooltip (舒適字級) */
.modern-tooltip {
  position: absolute;
  pointer-events: none;
  opacity: 0;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: #f8fafc;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 14px 16px;
  font-size: 13.5px;
  line-height: 1.55;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
  transition: opacity 0.15s ease;
  z-index: 50;
  width: 310px;
}

:deep(.tip-header) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

:deep(.tip-title) {
  font-weight: 700;
  font-size: 15.5px;
  color: #ffffff;
  line-height: 1.35;
}

:deep(.tip-badge) {
  flex-shrink: 0;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
}

:deep(.tip-meta) {
  font-size: 12.5px;
  color: #94a3b8;
  margin-bottom: 8px;
}

:deep(.tip-divider) {
  height: 1px;
  background: rgba(255, 255, 255, 0.12);
  margin-bottom: 8px;
}

:deep(.tip-grid) {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 14px;
}

:deep(.tip-lbl) {
  color: #94a3b8;
  font-size: 13px;
}

:deep(.tip-val) {
  text-align: right;
  font-weight: 600;
  color: #f8fafc;
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
}

:deep(.tip-val.highlight) {
  font-size: 15px;
  font-weight: 700;
}

:deep(.tip-action-hint) {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed rgba(255, 255, 255, 0.18);
  font-size: 12px;
  color: #93c5fd;
  text-align: center;
}

.card-footer {
  margin-top: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  color: #64748b;
  border-top: 1px solid #f1f5f9;
  padding-top: 12px;
}

.danger-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  margin-right: 4px;
}

.threshold-legend strong {
  color: #ef4444;
  font-weight: 700;
}

:deep(.x-axis text),
:deep(.y-axis text) {
  font-size: 13px;
  font-weight: 500;
  fill: #475569;
}

:deep(.x-axis path),
:deep(.y-axis path),
:deep(.x-axis line),
:deep(.y-axis line) {
  stroke: #cbd5e1;
}
</style>
