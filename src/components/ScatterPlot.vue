<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as d3 from 'd3'
import { COLOR_MAP } from '../composables/useEnrollmentData.js'

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
})

// ========== DOM 參照 ==========
const svgRef     = ref(null)  // SVG 根元素
const tooltipRef = ref(null)  // Tooltip 浮層

// ========== 圖表常數（Margin Convention） ==========
const MARGIN = { top: 40, right: 40, bottom: 70, left: 70 }
const WIDTH  = 760  // 圖表區域總寬（含 margin）
const HEIGHT = 480  // 圖表區域總高（含 margin）

const INNER_W = WIDTH  - MARGIN.left - MARGIN.right
const INNER_H = HEIGHT - MARGIN.top  - MARGIN.bottom

// ========== 繪圖邏輯 ==========
function render() {
  if (!svgRef.value || !props.data.length) return

  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove() // 🔄 重繪前清空（Data Join 最安全的方式）

  // 1️⃣ 建立繪圖群組（Margin Convention）
  const g = svg
    .append('g')
    .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

  // 2️⃣ 過濾有效資料（需要 rate 與 quota）
  const validData = props.data.filter(
    d => d.rate !== null && d.quota !== null && d.quota > 0
  )

  // 3️⃣ 比例尺
  const xScale = d3.scaleLinear()
    .domain([0, d3.max(validData, d => d.quota) * 1.05])
    .range([0, INNER_W])
    .nice()

  const yScale = d3.scaleLinear()
    .domain([0, 100])  // 註冊率固定 0~100%，不截斷 Y 軸
    .range([INNER_H, 0])

  // 4️⃣ 坐標軸
  g.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${INNER_H})`)
    .call(
      d3.axisBottom(xScale)
        .ticks(6)
        .tickFormat(d => d >= 10000 ? `${d / 1000}k` : d)
    )

  g.append('g')
    .attr('class', 'y-axis')
    .call(d3.axisLeft(yScale).ticks(10).tickFormat(d => `${d}%`))

  // 5️⃣ 坐標軸標籤
  // X 軸標籤
  g.append('text')
    .attr('x', INNER_W / 2)
    .attr('y', INNER_H + 55)
    .attr('text-anchor', 'middle')
    .attr('fill', '#555')
    .attr('font-size', '13px')
    .text('核定招生名額（人）')

  // Y 軸標籤
  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -INNER_H / 2)
    .attr('y', -52)
    .attr('text-anchor', 'middle')
    .attr('fill', '#555')
    .attr('font-size', '13px')
    .text('新生註冊率（%）')

  // 6️⃣ 60% 退場警戒參考線（紅色虛線）
  g.append('line')
    .attr('x1', 0)
    .attr('x2', INNER_W)
    .attr('y1', yScale(props.dangerThreshold))
    .attr('y2', yScale(props.dangerThreshold))
    .attr('stroke', '#e63946')
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '6,4')

  g.append('text')
    .attr('x', INNER_W - 4)
    .attr('y', yScale(props.dangerThreshold) - 6)
    .attr('text-anchor', 'end')
    .attr('fill', '#e63946')
    .attr('font-size', '11px')
    .text(`退場警戒線 ${props.dangerThreshold}%`)

  // 7️⃣ 繪製資料點（Data Join）
  const tooltip = d3.select(tooltipRef.value)

  g.selectAll('circle.dot')
    .data(validData, d => `${d.year}-${d.schoolCode}`)  // key function 確保穩定更新
    .join('circle')
    .attr('class', 'dot')
    .attr('cx', d => xScale(d.quota))
    .attr('cy', d => yScale(d.rate))
    .attr('r', 5)
    .attr('fill', d => COLOR_MAP[d.ownership] ?? '#999')
    .attr('fill-opacity', 0.72)
    .attr('stroke', d => COLOR_MAP[d.ownership] ?? '#999')
    .attr('stroke-width', 1)
    // 8️⃣ Hover 互動
    .on('mouseover', function (event, d) {
      // 高亮外框
      d3.select(this)
        .attr('r', 8)
        .attr('fill-opacity', 1)
        .attr('stroke-width', 2.5)

      // 顯示 Tooltip
      tooltip
        .style('opacity', 1)
        .html(`
          <strong>${d.schoolName}</strong><br/>
          ${d.ownership}・${d.schoolType}<br/>
          核定名額：<b>${d.quota?.toLocaleString()}</b> 人<br/>
          新生註冊率：<b>${d.rate?.toFixed(1)}%</b><br/>
          招生缺額：<b>${d.deficit !== null ? d.deficit.toLocaleString() : 'N/A'}</b> 人<br/>
          狀態：<span style="color:${getCrisisColor(d.crisisLevel)}">${d.crisisLevel}</span>
        `)
    })
    .on('mousemove', function (event) {
      // Tooltip 跟隨滑鼠
      const [mx, my] = d3.pointer(event, svgRef.value)
      tooltip
        .style('left', `${mx + 16}px`)
        .style('top',  `${my - 10}px`)
    })
    .on('mouseleave', function () {
      // 還原外框
      d3.select(this)
        .attr('r', 5)
        .attr('fill-opacity', 0.72)
        .attr('stroke-width', 1)
      tooltip.style('opacity', 0)
    })

  // 9️⃣ 圖例
  const legendData = [
    { label: '公立學校', color: COLOR_MAP['公立'] },
    { label: '私立學校', color: COLOR_MAP['私立'] },
  ]
  const legend = g.append('g')
    .attr('transform', `translate(${INNER_W - 120}, 0)`)

  legendData.forEach((item, i) => {
    const row = legend.append('g').attr('transform', `translate(0, ${i * 22})`)
    row.append('circle').attr('r', 6).attr('cx', 6).attr('cy', 6)
      .attr('fill', item.color).attr('fill-opacity', 0.8)
    row.append('text').attr('x', 18).attr('y', 11)
      .attr('font-size', '12px').attr('fill', '#444')
      .text(item.label)
  })
}

// 💡 危機狀態顏色輔助函數
function getCrisisColor(level) {
  if (level === '退場警戒') return '#e63946'
  if (level === '需關注')   return '#f4a261'
  return '#2a9d8f'
}

// 🔄 監聽資料變更，自動重繪
watch(() => [props.data, props.year], render, { deep: false })
onMounted(render)
</script>

<template>
  <div class="scatter-container">
    <!-- 圖表標題 -->
    <h2 class="chart-title">
      {{ year }} 學年度 大專院校新生招生概況
      <span class="subtitle">（新生註冊率 vs 招生規模）</span>
    </h2>

    <!-- SVG 圖表主體（相對定位，供 Tooltip 使用） -->
    <div class="chart-wrapper" style="position: relative">
      <svg
        ref="svgRef"
        :width="760"
        :height="480"
        viewBox="0 0 760 480"
        style="display: block; max-width: 100%"
      />

      <!-- Tooltip 浮層 -->
      <div
        ref="tooltipRef"
        class="tooltip"
        style="
          position: absolute;
          opacity: 0;
          pointer-events: none;
          background: rgba(255,255,255,0.95);
          border: 1px solid #ddd;
          border-radius: 6px;
          padding: 10px 14px;
          font-size: 13px;
          line-height: 1.7;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          max-width: 220px;
          transition: opacity 0.15s ease;
        "
      />
    </div>

    <!-- 資料摘要列 -->
    <div class="data-summary">
      <span class="summary-item">
        學校總數：<strong>{{ data.length }}</strong> 所
      </span>
      <span class="summary-item" style="color: #e63946">
        退場警戒（&lt;{{ dangerThreshold }}%）：
        <strong>{{ data.filter(d => d.rate !== null && d.rate < dangerThreshold).length }}</strong> 所
      </span>
      <span class="summary-item" style="color: #f4a261">
        需關注（{{ dangerThreshold }}~80%）：
        <strong>{{ data.filter(d => d.rate !== null && d.rate >= dangerThreshold && d.rate < 80).length }}</strong> 所
      </span>
    </div>
  </div>
</template>

<style scoped>
.scatter-container {
  background: #fff;
  border-radius: 10px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.chart-title {
  font-size: 17px;
  font-weight: 700;
  color: #2c3e50;
  margin: 0 0 16px 0;
}

.subtitle {
  font-size: 13px;
  font-weight: 400;
  color: #888;
  margin-left: 6px;
}

.data-summary {
  margin-top: 14px;
  display: flex;
  gap: 24px;
  font-size: 13px;
  color: #555;
}

.summary-item strong {
  font-weight: 700;
}

/* D3 坐標軸文字樣式 */
:deep(.x-axis text),
:deep(.y-axis text) {
  font-size: 11px;
  fill: #666;
}
:deep(.x-axis path),
:deep(.y-axis path),
:deep(.x-axis line),
:deep(.y-axis line) {
  stroke: #ddd;
}
</style>
