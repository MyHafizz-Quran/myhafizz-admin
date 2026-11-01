// Petit habillage Chart.js : courbes lisses, une couleur principale (Lagon), gris pour les comparaisons.
import { useEffect, useRef } from 'react';
import { Chart, LineController, BarController, LineElement, BarElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend } from 'chart.js';
Chart.register(LineController, BarController, LineElement, BarElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend);
Chart.defaults.font.family = 'Nunito, system-ui, sans-serif';
Chart.defaults.font.weight = '700';
Chart.defaults.color = '#5B6B70';

export const C = { p: '#00A3A8', ps: '#007C80', t: '#D5F3F3', g: '#C9D3D6', g2: '#E6EBEC', ink: '#1F2A2E', line: '#E3E8EA' };
export const fill = 'rgba(0,163,168,.10)';

export function ChartBox({ type = 'line', labels, datasets, options = {}, height = 250, legend = true }) {
  const ref = useRef(null);
  const chart = useRef(null);
  useEffect(() => {
    const base = {
      maintainAspectRatio: false, animation: { duration: 500 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: legend, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 3 } },
        tooltip: { backgroundColor: C.ink, padding: 10, cornerRadius: 10 },
      },
      scales: { x: { grid: { display: false } }, y: { grid: { color: C.line }, beginAtZero: true, ticks: { precision: 0 } } },
    };
    const merged = { ...base, ...options, plugins: { ...base.plugins, ...(options.plugins || {}) }, scales: options.scales || base.scales };
    const ds = datasets.map((d) => ({ tension: 0.4, pointRadius: 0, pointHoverRadius: 5, borderWidth: type === 'bar' ? 0 : 2.5, borderRadius: type === 'bar' ? 6 : 0, ...d }));
    if (chart.current) { chart.current.data = { labels, datasets: ds }; chart.current.options = merged; chart.current.update(); }
    else chart.current = new Chart(ref.current, { type, data: { labels, datasets: ds }, options: merged });
  }, [JSON.stringify(labels), JSON.stringify(datasets), type]);
  useEffect(() => () => chart.current?.destroy(), []);
  return <div style={{ position: 'relative', height }}><canvas ref={ref} /></div>;
}

export function Spark({ data }) {
  return <ChartBox labels={data.map((_, i) => i)} datasets={[{ data, borderColor: C.p }]} height={38} legend={false}
    options={{ plugins: { tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false, beginAtZero: true } } }} />;
}

export const dayLabel = (d) => { const [, m, j] = d.split('-'); return `${+j}/${+m}`; };
