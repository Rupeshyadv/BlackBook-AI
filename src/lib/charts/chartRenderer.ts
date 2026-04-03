import { createCanvas } from 'canvas'
import { Chart, ChartConfiguration } from 'chart.js/auto'
import { SurveyQuestion } from '../agents/planner'

export interface ChartData {
  type: 'bar' | 'pie' | 'line'
  title: string
  labels: string[]
  values: number[]
  unit?: string // e.g. "%" or "₹ Crore"
}

export async function renderAllSurveyCharts(
  questions: SurveyQuestion[]
): Promise<Map<number, Buffer>> {
  const chartPngs = new Map<number, Buffer>()

  for (const q of questions) {
    const buffer = await renderChartToPng({
      type: q.chartType,
      title: q.graphTitle,
      labels: q.options,
      values: q.respondents,
      unit: '',
    })
    chartPngs.set(q.number, buffer)
  }

  return chartPngs
}

async function renderChartToPng(data: ChartData): Promise<Buffer> {
  const width = 600
  const height = 380
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  // white background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  const colors = [
    '#2563eb', '#7c3aed', '#db2777',
    '#059669', '#d97706', '#dc2626',
    '#0891b2', '#65a30d',
  ]

  const config: ChartConfiguration = {
    type: data.type,
    data: {
      labels: data.labels,
      datasets: [{
        label: data.title,
        data: data.values,
        backgroundColor: data.type === 'line'
          ? 'rgba(37, 99, 235, 0.1)'
          : colors.slice(0, data.labels.length),
        borderColor: data.type === 'line'
          ? '#2563eb'
          : colors.slice(0, data.labels.length),
        borderWidth: data.type === 'line' ? 2 : 1,
        fill: data.type === 'line',
        tension: 0.4,
        pointBackgroundColor: '#2563eb',
        pointRadius: 4,
      }]
    },
    options: {
      animation: false,
      responsive: false,
      plugins: {
        legend: {
          display: data.type === 'pie',
          position: 'bottom',
          labels: {
            font: { family: 'serif', size: 12 },
            padding: 16,
          }
        },
        title: {
          display: true,
          text: data.title,
          font: { family: 'serif', size: 14, weight: 'bold' },
          padding: { bottom: 16 }
        },
      },
      scales: data.type === 'pie' ? {} : {
        y: {
          beginAtZero: true,
          ticks: {
            font: { family: 'serif', size: 11 },
            callback: (val) => `${val}${data.unit ?? ''}`
          },
          grid: { color: '#e5e7eb' }
        },
        x: {
          ticks: { font: { family: 'serif', size: 11 } },
          grid: { display: false }
        }
      }
    }
  }

  new Chart(ctx as any, config)

  return canvas.toBuffer('image/png')
}