/**
 * charts.js
 *
 * Отрисовка визуализаций на canvas:
 * - гистограмма числового столбца;
 * - круговая диаграмма категориального столбца;
 * - диаграмма рассеяния по двум числовым столбцам.
 *
 * Все функции принимают canvas и данные, рисуют синхронно.
 * Canvas масштабируется под ширину контейнера, сохраняя aspect ratio.
 */

// Палитра для круговой диаграммы
const PIE_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#14b8a6',
  '#8b5cf6',
  '#ec4899',
  '#84cc16'
];

/**
 * Настраивает canvas под текущую ширину контейнера с учётом devicePixelRatio.
 * Сохраняет aspect ratio из атрибутов width/height.
 */
function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const baseWidth = canvas.width;
  const baseHeight = canvas.height;
  const aspect = baseHeight / baseWidth;

  // Берём ширину из контейнера (родительского элемента)
  const container = canvas.parentElement;
  const containerWidth = container ? container.clientWidth : baseWidth;
  const displayWidth = Math.max(320, containerWidth);
  const displayHeight = Math.round(displayWidth * aspect);

  canvas.width = displayWidth * dpr;
  canvas.height = displayHeight * dpr;
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, displayWidth, displayHeight);
  return { ctx, width: displayWidth, height: displayHeight };
}

/**
 * Рисует гистограмму распределения числового столбца.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} columnName
 * @param {string[]} values
 */
function drawHistogram(canvas, columnName, values) {
  const { ctx, width, height } = setupCanvas(canvas);

  const nums = values.map(toNumber).filter((n) => n !== null);
  if (!nums.length) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Нет данных для гистограммы', width / 2, height / 2);
    return;
  }

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;

  // 8-12 бинов в зависимости от размаха
  const binCount = Math.max(6, Math.min(12, Math.ceil(Math.sqrt(nums.length))));
  const binWidth = range / binCount;

  const bins = new Array(binCount).fill(0);
  for (const n of nums) {
    let idx = Math.floor((n - min) / binWidth);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx] += 1;
  }

  const maxCount = Math.max(...bins, 1);

  // Поля
  const padLeft = 48;
  const padRight = 16;
  const padTop = 36;
  const padBottom = 64;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Сетка и оси
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 5; i += 1) {
    const y = padTop + (chartH * i) / 5;
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + chartW, y);
  }
  ctx.stroke();

  // Y-axis labels
  ctx.fillStyle = '#64748b';
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 5; i += 1) {
    const value = Math.round((maxCount * (5 - i)) / 5);
    const y = padTop + (chartH * i) / 5;
    ctx.fillText(String(value), padLeft - 8, y);
  }

  // Bars
  const barGap = 6;
  const barW = (chartW - barGap * (binCount - 1)) / binCount;

  bins.forEach((count, i) => {
    const h = (count / maxCount) * chartH;
    const x = padLeft + i * (barW + barGap);
    const y = padTop + chartH - h;

    ctx.fillStyle = '#2563eb';
    ctx.fillRect(x, y, barW, h);

    // Label под баром
    const binStart = min + i * binWidth;
    const binEnd = binStart + binWidth;
    const label = `${binStart.toFixed(1)} - ${binEnd.toFixed(1)}`;

    ctx.save();
    ctx.translate(x + barW / 2, padTop + chartH + 10);
    ctx.rotate(-Math.PI / 6);
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });

  // Axis titles
  ctx.fillStyle = '#334155';
  ctx.font = '12px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Интервал', padLeft + chartW / 2, height - 8);

  ctx.save();
  ctx.translate(12, padTop + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Частота', 0, 0);
  ctx.restore();

  // Legend
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(padLeft, 10, 14, 14);
  ctx.fillStyle = '#334155';
  ctx.font = '12px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Распределение: ${columnName}`, padLeft + 20, 17);
}

/**
 * Рисует круговую диаграмму по категориальному столбцу.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} columnName
 * @param {string[]} values
 */
function drawPieChart(canvas, columnName, values) {
  const { ctx, width, height } = setupCanvas(canvas);

  const freq = new Map();
  for (const v of values) {
    if (isMissing(v)) continue;
    const key = String(v).trim();
    freq.set(key, (freq.get(key) || 0) + 1);
  }

  const entries = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Нет данных для круговой диаграммы', width / 2, height / 2);
    return;
  }

  const total = entries.reduce((acc, [, count]) => acc + count, 0);

  // Центр и радиус: диаграмма занимает левую часть, легенда — правую
  const legendWidth = Math.min(220, width * 0.35);
  const chartAreaWidth = width - legendWidth;
  const cx = chartAreaWidth / 2;
  const cy = height / 2;
  const radius = Math.min(chartAreaWidth, height) / 2 - 40;

  let startAngle = -Math.PI / 2;

  entries.forEach(([label, count], i) => {
    const sliceAngle = (count / total) * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = PIE_COLORS[i % PIE_COLORS.length];
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    startAngle = endAngle;
  });

  // Legend: до 8 значений
  const legendEntries = entries.slice(0, 8);
  const legendX = chartAreaWidth + 16;
  let legendY = 20;

  ctx.font = '12px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  legendEntries.forEach(([label], i) => {
    ctx.fillStyle = PIE_COLORS[i % PIE_COLORS.length];
    ctx.fillRect(legendX, legendY - 6, 14, 14);
    ctx.fillStyle = '#334155';
    // Обрезаем длинное название
    let text = label;
    if (text.length > 18) text = text.slice(0, 17) + '…';
    ctx.fillText(text, legendX + 20, legendY + 1);
    legendY += 22;
  });
}

/**
 * Рисует диаграмму рассеяния.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} xName
 * @param {string} yName
 * @param {Array<{x: number, y: number}>} points
 */
function drawScatterPlot(canvas, xName, yName, points) {
  const { ctx, width, height } = setupCanvas(canvas);

  if (!points.length) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Нет данных для диаграммы рассеяния', width / 2, height / 2);
    return;
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const xRange = maxX - minX || 1;
  const yRange = maxY - minY || 1;

  const padLeft = 64;
  const padRight = 20;
  const padTop = 36;
  const padBottom = 56;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Сетка
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 5; i += 1) {
    const y = padTop + (chartH * i) / 5;
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + chartW, y);
  }
  for (let i = 0; i <= 5; i += 1) {
    const x = padLeft + (chartW * i) / 5;
    ctx.moveTo(x, padTop);
    ctx.lineTo(x, padTop + chartH);
  }
  ctx.stroke();

  // Ticks
  ctx.fillStyle = '#64748b';
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 5; i += 1) {
    const value = maxY - (yRange * i) / 5;
    const y = padTop + (chartH * i) / 5;
    ctx.fillText(formatNumber(value), padLeft - 8, y);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = 0; i <= 5; i += 1) {
    const value = minX + (xRange * i) / 5;
    const x = padLeft + (chartW * i) / 5;
    ctx.fillText(formatNumber(value), x, padTop + chartH + 8);
  }

  // Points
  ctx.fillStyle = '#16a34a';
  points.forEach((p) => {
    const x = padLeft + ((p.x - minX) / xRange) * chartW;
    const y = padTop + chartH - ((p.y - minY) / yRange) * chartH;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Axis titles
  ctx.fillStyle = '#334155';
  ctx.font = '12px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(xName, padLeft + chartW / 2, height - 8);

  ctx.save();
  ctx.translate(14, padTop + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yName, 0, 0);
  ctx.restore();

  // Legend
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(padLeft, 10, 14, 14);
  ctx.fillStyle = '#334155';
  ctx.font = '12px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${xName} vs ${yName}`, padLeft + 20, 17);
}
