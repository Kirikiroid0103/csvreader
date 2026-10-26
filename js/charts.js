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
 *
 * Tooltips: после отрисовки каждый canvas получает обработчик mousemove,
 * который по сохранённой геометрии (canvas._hit) показывает всплывающую
 * подсказку с данными элемента под курсором.
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


// ---------- Утилиты ----------

/**
 * Форматирует число для подписей на графиках:
 * до 2 знаков после запятой, без хвостовых нулей, с разделителем тысяч.
 */
function formatAxisNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}


/**
 * Вычисляет "красивый" шаг для оси (1, 2, 5 × 10^n).
 */
function niceStep(range, targetTicks) {
  const rough = range / Math.max(1, targetTicks);
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const candidates = [1, 2, 5, 10];
  for (const c of candidates) {
    if (c * pow >= rough) return c * pow;
  }
  return 10 * pow;
}


/**
 * Вычисляет границы оси с "красивым" шагом.
 * Возвращает { min, max, step }.
 */
function niceScale(min, max, targetTicks = 6) {
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const step = niceStep(max - min, targetTicks);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  return { min: niceMin, max: niceMax, step };
}


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


// ---------- Tooltips ----------

/**
 * Показывает tooltip у курсора.
 */
function showTooltip(evt, html) {
  let tip = document.getElementById('chartTooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'chartTooltip';
    document.body.appendChild(tip);
  }
  tip.innerHTML = html;
  tip.style.display = 'block';

  const pad = 14;
  let x = evt.pageX + pad;
  let y = evt.pageY + pad;

  // Не даём tooltip вылезти за правый/нижний край окна
  const tipRect = tip.getBoundingClientRect();
  const winW = document.documentElement.clientWidth;
  const winH = document.documentElement.clientHeight;
  if (x + tipRect.width > window.scrollX + winW - 8) {
    x = evt.pageX - tipRect.width - pad;
  }
  if (y + tipRect.height > window.scrollY + winH - 8) {
    y = evt.pageY - tipRect.height - pad;
  }
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}


function hideTooltip() {
  const tip = document.getElementById('chartTooltip');
  if (tip) tip.style.display = 'none';
}


/**
 * Подключает обработчик mousemove к canvas.
 * hitTest(x, y) должен вернуть HTML для tooltip или null.
 */
function attachTooltip(canvas, hitTest) {
  canvas.addEventListener('mousemove', (evt) => {
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    const html = hitTest(x, y);
    if (html) {
      showTooltip(evt, html);
      canvas.style.cursor = 'pointer';
    } else {
      hideTooltip();
      canvas.style.cursor = 'default';
    }
  });
  canvas.addEventListener('mouseleave', () => {
    hideTooltip();
    canvas.style.cursor = 'default';
  });
}


// ---------- Гистограмма ----------

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
    canvas._hit = null;
    return;
  }


  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;


  // 8-12 бинов в зависимости от объёма данных
  const desiredBins = Math.max(6, Math.min(12, Math.ceil(Math.sqrt(nums.length))));

  // "Красивая" ширина бина: 1, 2, 5 × 10^n
  const binWidth = niceStep(range, desiredBins);
  let actualBinCount = Math.max(1, Math.ceil(range / binWidth));

  // Ограничиваем количество бинов, чтобы бары не были уже 2px
  const padLeftTmp = 48;
  const padRightTmp = 16;
  const chartW = width - padLeftTmp - padRightTmp;
  const barGapTmp = 6;
  const maxBins = Math.max(4, Math.floor(chartW / (barGapTmp + 2)));
  if (actualBinCount > maxBins) {
    // Увеличиваем ширину бина до следующего "красивого" шага
    let w = binWidth;
    while (Math.ceil(range / w) > maxBins) {
      w = niceStep(range, Math.ceil(range / w) - 1);
      if (w <= binWidth) break; // защита от зацикливания
      binWidth = w;
    }
    actualBinCount = Math.max(1, Math.ceil(range / binWidth));
  }

  const binStart0 = min;

  const bins = new Array(actualBinCount).fill(0);
  for (const n of nums) {
    let idx = Math.floor((n - binStart0) / binWidth);
    if (idx >= actualBinCount) idx = actualBinCount - 1;
    if (idx < 0) idx = 0;
    bins[idx] += 1;
  }


  const maxCount = Math.max(...bins, 1);


  // Поля
  const padLeft = 48;
  const padRight = 16;
  const padTop = 36;
  const padBottom = 72;


  const chartH = height - padTop - padBottom;


  // Сетка и ось Y (красивые деления)
  const yScale = niceScale(0, maxCount, 5);
  const yTicks = [];
  for (let v = yScale.min; v <= yScale.max + 1e-9; v += yScale.step) {
    yTicks.push(v);
  }


  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const v of yTicks) {
    const y = padTop + chartH - (v / yScale.max) * chartH;
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + chartW, y);
  }
  ctx.stroke();


  // Y-axis labels
  ctx.fillStyle = '#64748b';
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const v of yTicks) {
    const y = padTop + chartH - (v / yScale.max) * chartH;
    ctx.fillText(formatAxisNumber(v), padLeft - 8, y);
  }


  // Bars
  const barGap = 6;
  const barW = (chartW - barGap * (actualBinCount - 1)) / actualBinCount;


  const barRects = [];
  bins.forEach((count, i) => {
    const h = (count / yScale.max) * chartH;
    const x = padLeft + i * (barW + barGap);
    const y = padTop + chartH - h;


    ctx.fillStyle = '#2563eb';
    ctx.fillRect(x, y, barW, h);


    barRects.push({
      x,
      y,
      w: barW,
      h,
      start: binStart0 + i * binWidth,
      end: binStart0 + (i + 1) * binWidth,
      count
    });


    // Подпись под баром: только начало интервала, чтобы не налезали
    const label = formatAxisNumber(binStart0 + i * binWidth);
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


  // Правая граница последнего бина
  ctx.save();
  ctx.translate(padLeft + chartW, padTop + chartH + 10);
  ctx.rotate(-Math.PI / 6);
  ctx.fillStyle = '#64748b';
  ctx.font = '10px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(formatAxisNumber(binStart0 + actualBinCount * binWidth), 0, 0);
  ctx.restore();


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


  // Tooltip: найди бар под курсором
  attachTooltip(canvas, (mx, my) => {
    for (const b of barRects) {
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y - 4 && my <= b.y + b.h) {
        return `<strong>${columnName}</strong><br>Интервал: ${formatAxisNumber(b.start)} – ${formatAxisNumber(b.end)}<br>Значений: ${b.count}`;
      }
    }
    return null;
  });
}


// ---------- Круговая диаграмма ----------

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
    canvas._hit = null;
    return;
  }


  const total = entries.reduce((acc, [, count]) => acc + count, 0);


  // Центр и радиус: диаграмма занимает левую часть, легенда — правую
  const legendWidth = Math.min(260, width * 0.38);
  const chartAreaWidth = width - legendWidth;
  const cx = chartAreaWidth / 2;
  const cy = height / 2;
  const radius = Math.min(chartAreaWidth, height) / 2 - 40;


  let startAngle = -Math.PI / 2;
  const slices = [];


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


    // Проценты на слайсах, если слайс достаточно большой (>= 4%)
    const pct = (count / total) * 100;
    if (pct >= 4) {
      const midAngle = startAngle + sliceAngle / 2;
      const labelR = radius * 0.62;
      const lx = cx + Math.cos(midAngle) * labelR;
      const ly = cy + Math.sin(midAngle) * labelR;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${pct.toFixed(1)}%`, lx, ly);
    }


    slices.push({
      startAngle,
      endAngle,
      label,
      count,
      pct
    });


    startAngle = endAngle;
  });


  // Legend: до 8 значений, с процентами
  const legendEntries = entries.slice(0, 8);
  const legendX = chartAreaWidth + 16;
  let legendY = 20;


  ctx.font = '12px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';


  legendEntries.forEach(([label, count], i) => {
    const pct = ((count / total) * 100).toFixed(1);
    ctx.fillStyle = PIE_COLORS[i % PIE_COLORS.length];
    ctx.fillRect(legendX, legendY - 6, 14, 14);
    ctx.fillStyle = '#334155';
    // Обрезаем длинное название
    let text = label;
    if (text.length > 14) text = text.slice(0, 13) + '…';
    ctx.fillText(`${text} (${pct}%)`, legendX + 20, legendY + 1);
    legendY += 22;
  });


  if (entries.length > 8) {
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`… ещё ${entries.length - 8}`, legendX + 20, legendY + 1);
  }


  // Tooltip: найди слайс под курсором
  attachTooltip(canvas, (mx, my) => {
    const dx = mx - cx;
    const dy = my - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > radius) return null;
    let angle = Math.atan2(dy, dx);
    // Приводим к диапазону от startAngle первого слайса (-PI/2)
    while (angle < -Math.PI / 2) angle += Math.PI * 2;
    for (const s of slices) {
      if (angle >= s.startAngle && angle < s.endAngle) {
        return `<strong>${escapeHtml(s.label)}</strong><br>Значений: ${s.count}<br>Доля: ${s.pct.toFixed(1)}%`;
      }
    }
    return null;
  });
}


// ---------- Диаграмма рассеяния ----------

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
    canvas._hit = null;
    return;
  }


  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);


  // Красивые границы осей
  const xScale = niceScale(Math.min(...xs), Math.max(...xs), 6);
  const yScale = niceScale(Math.min(...ys), Math.max(...ys), 6);


  const padLeft = 64;
  const padRight = 20;
  const padTop = 36;
  const padBottom = 56;


  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;


  const xRange = xScale.max - xScale.min || 1;
  const yRange = yScale.max - yScale.min || 1;


  const toPx = (x, y) => ({
    px: padLeft + ((x - xScale.min) / xRange) * chartW,
    py: padTop + chartH - ((y - yScale.min) / yRange) * chartH
  });


  // Сетка
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let v = yScale.min; v <= yScale.max + 1e-9; v += yScale.step) {
    const y = padTop + chartH - ((v - yScale.min) / yRange) * chartH;
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + chartW, y);
  }
  for (let v = xScale.min; v <= xScale.max + 1e-9; v += xScale.step) {
    const x = padLeft + ((v - xScale.min) / xRange) * chartW;
    ctx.moveTo(x, padTop);
    ctx.lineTo(x, padTop + chartH);
  }
  ctx.stroke();


  // Ticks
  ctx.fillStyle = '#64748b';
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let v = yScale.min; v <= yScale.max + 1e-9; v += yScale.step) {
    const y = padTop + chartH - ((v - yScale.min) / yRange) * chartH;
    ctx.fillText(formatAxisNumber(v), padLeft - 8, y);
  }


  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let v = xScale.min; v <= xScale.max + 1e-9; v += xScale.step) {
    const x = padLeft + ((v - xScale.min) / xRange) * chartW;
    ctx.fillText(formatAxisNumber(v), x, padTop + chartH + 8);
  }


  // Points
  const pointRects = [];
  ctx.fillStyle = '#16a34a';
  points.forEach((p) => {
    const { px, py } = toPx(p.x, p.y);
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();
    pointRects.push({ px, py, x: p.x, y: p.y });
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


  // Tooltip: ближайшая точка в радиусе 10px
  attachTooltip(canvas, (mx, my) => {
    let best = null;
    let bestDist = 10;
    for (const p of pointRects) {
      const d = Math.sqrt((p.px - mx) ** 2 + (p.py - my) ** 2);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    if (best) {
      return `<strong>${xName}:</strong> ${formatAxisNumber(best.x)}<br><strong>${yName}:</strong> ${formatAxisNumber(best.y)}`;
    }
    return null;
  });
}
