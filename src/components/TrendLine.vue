<script setup>
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { COLOR_MAP } from '../composables/useEnrollmentData.js'

// ========== Props ==========
const props = defineProps({
  /** 趨勢資料陣列（每筆 = { year, ownership, avgRate }） */
  trendData: {
    type: Array,
    required: true,
  },
  /** 目前選取的學年度（用來高亮對應年份） */
  selectedYear: {
    type: String,
    required: true,
  },
  /** 退場警戒線 */
  dangerThreshold: {
    type: Number,
    default: 60,
  },
})

// ========== DOM 參照 ==========
const svgRef = ref(null)

// ========== 圖表常數（Margin Convention） ==========
const MARGIN = { top: 30, right: 120, bottom: 60, left: 65 }
const WIDTH  = 640
const HEIGHT = 280

const INNER_W = WIDTH  - MARGIN.left - MARGIN.right
const INNER_H = HEIGHT - MARGIN.top  - MARGIN.bottom

// ========== 繪圖邏輯 ==========
function render() {
  if (!svgRef.value || !props.trendData.length) return

  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()

  const g = svg
    .append('g')
    .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

  // 取得所有學年度（升冪）
  const years = [...new Set(props.trendData.map(d => d.year))].sort(
    (a, b) => Number(a) - Number(b)
  )
  const ownerships = [...new Set(props.trendData.map(d => d.ownership))]

  // 1️⃣ 比例尺
  const xScale = d3.scalePoint()
    .domain(years)
    .range([0, INNER_W])
    .padding(0.2)

  const yScale = d3.scaleLinear()
    .domain([50, 100])  // 折線圖聚焦在 50~100% 的有效區間
    .range([INNER_H, 0])
    .nice()

  // 2️⃣ 坐標軸
  g.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${INNER_H})`)
    .call(d3.axisBottom(xScale).tickFormat(y => `${y}`))

  g.append('g')
    .attr('class', 'y-axis')
    .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => `${d}%`))

  // 3️⃣ 坐標軸標籤
  g.append('text')
    .attr('x', INNER_W / 2)
    .attr('y', INNER_H + 46)
    .attr('text-anchor', 'middle')
    .attr('fill', '#555')
    .attr('font-size', '12px')
    .text('學年度')

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -INNER_H / 2)
    .attr('y', -50)
    .attr('text-anchor', 'middle')
    .attr('fill', '#555')
    .attr('font-size', '12px')
    .text('平均新生註冊率（%）')

  // 4️⃣ 退場警戒參考線
  if (props.dangerThreshold >= 50) {
    g.append('line')
      .attr('x1', 0).attr('x2', INNER_W)
      .attr('y1', yScale(props.dangerThreshold))
      .attr('y2', yScale(props.dangerThreshold))
      .attr('stroke', '#e63946')
      .attr('stroke-width', 1.2)
      .attr('stroke-dasharray', '5,4')
  }

  // 5️⃣ 線條生成器
  const lineGen = d3.line()
    .x(d => xScale(d.year))
    .y(d => yScale(d.avgRate))
    .curve(d3.curveMonotoneX)  // 平滑但不過度插值

  // 6️⃣ 各設立別繪製折線與資料點
  for (const ownership of ownerships) {
    const lineData = props.trendData
      .filter(d => d.ownership === ownership)
      .sort((a, b) => Number(a.year) - Number(b.year))

    const color = COLOR_MAP[ownership] ?? '#999'

    // 折線
    g.append('path')
      .datum(lineData)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 2.2)
      .attr('d', lineGen)

    // 資料點（圓點）
    g.selectAll(`.dot-${ownership}`)
      .data(lineData)
      .join('circle')
      .attr('class', `dot-${ownership}`)
      .attr('cx', d => xScale(d.year))
      .attr('cy', d => yScale(d.avgRate))
      .attr('r', d => d.year === props.selectedYear ? 7 : 4)
      .attr('fill', d => d.year === props.selectedYear ? color : '#fff')
      .attr('stroke', color)
      .attr('stroke-width', 2)

    // 末端標籤（最後一年顯示平均值）
    const last = lineData[lineData.length - 1]
    if (last) {
      g.append('text')
        .attr('x', xScale(last.year) + 10)
        .attr('y', yScale(last.avgRate) + 4)
        .attr('font-size', '11.5px')
        .attr('fill', color)
        .attr('font-weight', '600')
        .text(`${ownership} ${last.avgRate?.toFixed(1)}%`)
    }
  }

  // 7️⃣ 高亮選取學年度的垂直線
  if (xScale(props.selectedYear)) {
    g.append('line')
      .attr('x1', xScale(props.selectedYear))
      .attr('x2', xScale(props.selectedYear))
      .attr('y1', 0)
      .attr('y2', INNER_H)
      .attr('stroke', '#aaa')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,3')
  }
}

watch(() => [props.trendData, props.selectedYear], render, { deep: false })
onMounted(render)
</script>

<template>
  <div class="trendline-container">
    <h3 class="chart-title">
      公私立大專院校平均新生註冊率趨勢
      <span class="subtitle">（106 ～ 114 學年度）</span>
    </h3>
    <svg
      ref="svgRef"
      :width="640"
      :height="280"
      viewBox="0 0 640 280"
      style="display: block; max-width: 100%"
    />
  </div>
</template>

<style scoped>
.trendline-container {
  background: #fff;
  border-radius: 10px;
  padding: 20px 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.chart-title {
  font-size: 15px;
  font-weight: 700;
  color: #2c3e50;
  margin: 0 0 12px 0;
}

.subtitle {
  font-size: 12px;
  font-weight: 400;
  color: #888;
  margin-left: 6px;
}

:deep(.x-axis text),
:deep(.y-axis text) {
  font-size: 10.5px;
  fill: #666;
}
:deep(.x-axis path),
:deep(.y-axis path),
:deep(.x-axis line),
:deep(.y-axis line) {
  stroke: #e0e0e0;
}
</style>
