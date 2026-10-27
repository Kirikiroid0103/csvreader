/**
 * app.js
 *
 * Основная логика приложения:
 * - загрузка CSV;
 * - состояние данных и фильтров;
 * - рендер сводки, типов, аналитики, таблицы;
 * - управление визуализациями (canvas).
 */

// ---------- Состояние ----------
let state = {
  fileName: '',
  headers: [],
  rows: [],
  columnTypes: {},
  filteredRows: []
};

// ---------- DOM ----------
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const loadSampleBtn = document.getElementById('loadSampleBtn');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');
const statusEl = document.getElementById('status');
const fileNameEl = document.getElementById('fileName');
const resultsEl = document.getElementById('results');
const columnListEl = document.getElementById('columnList');
const statsEl = document.getElementById('stats');
const analyticsGridEl = document.getElementById('analyticsGrid');
const tableWrapEl = document.getElementById('tableWrap');
const filterStatusEl = document.getElementById('filterStatus');

// Фильтры
const filterCatColumn = document.getElementById('filterCatColumn');
const filterCatValue = document.getElementById('filterCatValue');
const filterNumColumn = document.getElementById('filterNumColumn');
const filterNumMin = document.getElementById('filterNumMin');
const filterNumMax = document.getElementById('filterNumMax');
const filterDateColumn = document.getElementById('filterDateColumn');
const filterDateMin = document.getElementById('filterDateMin');
const filterDateMax = document.getElementById('filterDateMax');

// Визуализация
const vizHistColumn = document.getElementById('vizHistColumn');
const vizPieColumn = document.getElementById('vizPieColumn');
const vizScatterX = document.getElementById('vizScatterX');
const vizScatterY = document.getElementById('vizScatterY');
const histCanvas = document.getElementById('histCanvas');
const pieCanvas = document.getElementById('pieCanvas');
const scatterCanvas = document.getElementById('scatterCanvas');

// ---------- Утилиты ----------
function setStatus(message, type = 'info') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (Number.isInteger(value)) return value.toLocaleString('ru-RU');
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\s/g, '').replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/**
 * Парсит строку в Date. Поддерживает ISO, DD.MM.YYYY, текстовые месяцы и т.д.
 * Возвращает null, если значение не похоже на дату.
 */
function parseDateValue(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  if (!v) return null;

  // ISO: YYYY-MM-DD (с возможной частью времени)
  let m = v.match(/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/);
  if (m) {
    const d = new Date(v.replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // DD.MM.YYYY / DD/MM/YYYY / DD-MM.YYYY
  m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})([ T]\d{2}:\d{2}(:\d{2})?)?$/);
  if (m) {
    const [, dd, mm, yyyy, time] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (time) {
      const t = time.trim().match(/\d{2}:\d{2}(:\d{2})?/);
      if (t) {
        d.setHours(Number(t[0].slice(0, 2)), Number(t[0].slice(3, 5)), t[2] ? Number(t[2].slice(3, 5)) : 0);
      }
    }
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // Текстовые месяцы: "15 января 2023" / "Jan 15, 2023"
  const monthsRu = {
    'январь': 0, 'января': 0, 'февраль': 1, 'февраля': 1, 'март': 2, 'марта': 2,
    'апрель': 3, 'апреля': 3, 'май': 4, 'мая': 4, 'июнь': 5, 'июня': 5,
    'июль': 6, 'июля': 6, 'август': 7, 'августа': 7, 'сентябрь': 8, 'сентября': 8,
    'октябрь': 9, 'октября': 9, 'ноябрь': 10, 'ноября': 10, 'декабрь': 11, 'декабря': 11
  };
  const monthsEn = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };
  m = v.match(/^(\d{1,2})\s+([а-яёa-z]+)\s+(\d{4})$/i);
  if (m) {
    const month = monthsRu[m[2].toLowerCase()] ?? monthsEn[m[2].toLowerCase().slice(0, 3)];
    if (month !== undefined) {
      const d = new Date(Number(m[3]), month, Number(m[1]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  m = v.match(/^([a-z]{3,9})\s+(\d{1,2}),\s+(\d{4})$/i);
  if (m) {
    const month = monthsEn[m[1].toLowerCase().slice(0, 3)];
    if (month !== undefined) {
      const d = new Date(Number(m[3]), month, Number(m[2]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  return null;
}


function isMissing(value) {
  if (value === null || value === undefined) return true;
  const s = String(value).trim().toLowerCase();
  return !s || s === 'na' || s === 'n/a' || s === 'null' || s === 'none' || s === 'nan';
}

function getTypeLabel(type) {
  const map = {
    numeric: 'Числовой',
    categorical: 'Категориальный',
    date: 'Дата',
    mixed: 'Смешанный'
  };
  return map[type] || type;
}

// ---------- Загрузка данных ----------
function loadFile(file) {
  if (!file) return;
  const name = file.name.toLowerCase();
  if (!name.endsWith('.csv') && !name.endsWith('.txt') && !name.endsWith('.tsv')) {
    setStatus('Пожалуйста, выберите файл в формате .csv, .txt или .tsv', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result || '');
      const parsed = parseCSV(text);

      // Валидация: пустой файл, битый CSV, отсутствие числовых столбцов, текст вместо чисел
      const validation = validateCSV(text, parsed);
      if (!validation.ok) {
        setStatus(validation.errors.join(' '), 'error');
        return;
      }

      state.fileName = file.name;
      state.headers = parsed.headers;
      state.rows = parsed.rows;
      state.columnTypes = detectColumnTypes(parsed.headers, parsed.rows);
      state.filteredRows = [...state.rows];

      fileNameEl.textContent = file.name;
      const warnSuffix = validation.warnings.length
        ? ` ⚠ ${validation.warnings.join(' ')}`
        : '';
      setStatus(`Загружено строк: ${state.rows.length}.${warnSuffix}`, 'success');

      renderAll();
    } catch (err) {
      console.error(err);
      setStatus('Ошибка при чтении CSV. Проверьте формат файла.', 'error');
    }
  };
  reader.onerror = () => setStatus('Не удалось прочитать файл', 'error');
  reader.readAsText(file, 'utf-8');
}

function loadSample() {
  fetch('data/sales_data.csv')
    .then((res) => {
      if (!res.ok) throw new Error('Не удалось загрузить пример');
      return res.text();
    })
    .then((text) => {
      const parsed = parseCSV(text);

      // Валидация: пустой файл, битый CSV, отсутствие числовых столбцов, текст вместо чисел
      const validation = validateCSV(text, parsed);
      if (!validation.ok) {
        setStatus(validation.errors.join(' '), 'error');
        return;
      }

      state.fileName = 'sales_data.csv (пример)';
      state.headers = parsed.headers;
      state.rows = parsed.rows;
      state.columnTypes = detectColumnTypes(parsed.headers, parsed.rows);
      state.filteredRows = [...state.rows];

      fileNameEl.textContent = 'sales_data.csv (пример)';
      const warnSuffix = validation.warnings.length
        ? ` ⚠ ${validation.warnings.join(' ')}`
        : '';
      setStatus(`Загружено строк: ${state.rows.length}.${warnSuffix}`, 'success');
      renderAll();
    })
    .catch((err) => {
      console.error(err);
      setStatus('Не удалось загрузить пример. Проверьте, что файл data/sales_data.csv доступен.', 'error');
    });
}

function resetApp() {
  state = {
    fileName: '',
    headers: [],
    rows: [],
    columnTypes: {},
    filteredRows: []
  };

  fileNameEl.textContent = 'не выбран';
  resultsEl.hidden = true;
  filterStatusEl.textContent = 'Фильтры не применены.';

  // Сброс фильтров
  filterCatColumn.innerHTML = '<option value="">— не выбран —</option>';
  filterCatValue.innerHTML = '<option value="">— все —</option>';
  filterNumColumn.innerHTML = '<option value="">— не выбран —</option>';
  filterNumMin.value = '';
  filterNumMax.value = '';
  filterDateColumn.innerHTML = '<option value="">— не выбран —</option>';
  filterDateMin.value = '';
  filterDateMax.value = '';

  // Сброс визуализации
  vizHistColumn.innerHTML = '';
  vizPieColumn.innerHTML = '';
  vizScatterX.innerHTML = '';
  vizScatterY.innerHTML = '';

  [histCanvas, pieCanvas, scatterCanvas].forEach((canvas) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });

  setStatus('Готово к работе. Загрузите CSV или откройте пример.');
}

// ---------- Рендер ----------
function renderAll() {
  resultsEl.hidden = false;
  renderSummary();
  renderColumns();
  renderAnalytics();
  renderTable();
  populateFilterControls();
  populateVizControls();
  applyDefaultVizSelections();
  drawAllCharts();
}

function renderSummary() {
  const rows = state.rows.length;
  const cols = state.headers.length;
  let missing = 0;

  for (const row of state.rows) {
    for (const v of row) {
      if (isMissing(v)) missing += 1;
    }
  }

  statsEl.innerHTML = `
    <div class="stat">
      <div class="label">Строк</div>
      <div class="value">${rows.toLocaleString('ru-RU')}</div>
    </div>
    <div class="stat">
      <div class="label">Столбцов</div>
      <div class="value">${cols.toLocaleString('ru-RU')}</div>
    </div>
    <div class="stat">
      <div class="label">Пропусков</div>
      <div class="value">${missing.toLocaleString('ru-RU')}</div>
      <div class="hint">${rows * cols ? Math.round((missing / (rows * cols)) * 100) : 0}% от всех ячеек</div>
    </div>
  `;
}

function renderColumns() {
  if (!state.headers.length) {
    columnListEl.innerHTML = '<div class="empty">Столбцы появятся после загрузки данных.</div>';
    return;
  }

  columnListEl.innerHTML = state.headers
    .map((header, idx) => {
      const type = state.columnTypes[header] || 'mixed';
      const missing = state.rows.filter((r) => isMissing(r[idx])).length;
      return `
        <div class="column-item">
          <div>
            <div class="column-name">${escapeHtml(header)}</div>
            <div class="column-meta">Пропусков: ${missing}</div>
          </div>
          <span class="type ${type}">${getTypeLabel(type)}</span>
        </div>
      `;
    })
    .join('');
}

function renderAnalytics() {
  if (!state.headers.length) {
    analyticsGridEl.innerHTML = '<div class="empty">Аналитика появится после загрузки данных.</div>';
    return;
  }

  // Нет данных — показываем сообщение об ошибке вместо аналитики
  if (!state.filteredRows.length) {
    const msg = state.rows.length
      ? 'Нет данных для аналитики: все строки отфильтрованы. Измените или сбросьте фильтры.'
      : 'Нет данных для аналитики: файл не содержит строк.';
    analyticsGridEl.innerHTML = `<div class="empty error-msg">${msg}</div>`;
    return;
  }

  const cards = state.headers.map((header, idx) => {
    const type = state.columnTypes[header] || 'mixed';
    const values = state.filteredRows.map((r) => r[idx]);

    if (type === 'numeric') {
      const stats = computeNumericStats(values);
      return `
        <div class="analytics-card">
          <h3>${escapeHtml(header)} <span class="type numeric">Числовой</span></h3>
          <div class="metric-grid">
            <div class="metric"><div class="m-label">Среднее</div><div class="m-value">${formatNumber(stats.mean)}</div></div>
            <div class="metric"><div class="m-label">Медиана</div><div class="m-value">${formatNumber(stats.median)}</div></div>
            <div class="metric"><div class="m-label">Минимум</div><div class="m-value">${formatNumber(stats.min)}</div></div>
            <div class="metric"><div class="m-label">Максимум</div><div class="m-value">${formatNumber(stats.max)}</div></div>
            <div class="metric"><div class="m-label">Ст. отклонение</div><div class="m-value">${formatNumber(stats.std)}</div></div>
            <div class="metric"><div class="m-label">Пропусков</div><div class="m-value">${stats.missing}</div></div>
          </div>
        </div>
      `;
    }

    if (type === 'categorical') {
      const stats = computeCategoricalStats(values);
      // Все уникальные значения (не только топ-5), отсортированные по частоте
      const allValues = stats.frequencies || stats.top5;
      const maxCount = allValues.length ? Math.max(...allValues.map(([, c]) => c)) : 1;
      const top = allValues
        .map(
          ([value, count]) => `
            <div class="top-item">
              <div>
                <div>${escapeHtml(value)}</div>
                <div class="bar"><div class="bar-fill" style="width:${Math.max(4, Math.round((count / maxCount) * 100))}%"></div></div>
              </div>
              <div class="count">${count}</div>
            </div>
          `
        )
        .join('');

      return `
        <div class="analytics-card">
          <h3>${escapeHtml(header)} <span class="type categorical">Категориальный</span></h3>
          <div class="metric-grid">
            <div class="metric"><div class="m-label">Уникальных</div><div class="m-value">${stats.unique}</div></div>
            <div class="metric"><div class="m-label">Пропусков</div><div class="m-value">${stats.missing}</div></div>
          </div>
          <div class="top-list">${top || '<div class="empty">Нет данных</div>'}</div>
        </div>
      `;
    }

    return `
      <div class="analytics-card">
        <h3>${escapeHtml(header)} <span class="type ${type}">${getTypeLabel(type)}</span></h3>
        <div class="metric-grid">
          <div class="metric"><div class="m-label">Тип</div><div class="m-value">${getTypeLabel(type)}</div></div>
          <div class="metric"><div class="m-label">Пропусков</div><div class="m-value">${values.filter(isMissing).length}</div></div>
        </div>
      </div>
    `;
  });

  analyticsGridEl.innerHTML = cards.join('');
}

function renderTable() {
  if (!state.headers.length) {
    tableWrapEl.innerHTML = '<div class="empty">Таблица появится после загрузки данных.</div>';
    return;
  }

  const preview = state.filteredRows.slice(0, 20);
  const head = state.headers
    .map((h) => {
      const type = state.columnTypes[h] || 'mixed';
      const cls = type === 'numeric' ? 'num' : '';
      return `<th class="${cls}">${escapeHtml(h)}</th>`;
    })
    .join('');

  const body = preview
    .map(
      (row, i) => `
        <tr>
          <td class="row-index">${i + 1}</td>
          ${row
            .map((v, idx) => {
              const type = state.columnTypes[state.headers[idx]] || 'mixed';
              const cls = type === 'numeric' ? 'num' : '';
              const missing = isMissing(v);
              return `<td class="${cls} ${missing ? 'missing' : ''}">${missing ? '—' : escapeHtml(v)}</td>`;
            })
            .join('')}
        </tr>
      `
    )
    .join('');

  tableWrapEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th class="row-index">#</th>
          ${head}
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

// ---------- Фильтры ----------
function populateFilterControls() {
  const catOptions = state.headers
    .filter((h) => state.columnTypes[h] === 'categorical')
    .map((h) => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`)
    .join('');

  const numOptions = state.headers
    .filter((h) => state.columnTypes[h] === 'numeric')
    .map((h) => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`)
    .join('');

  const dateOptions = state.headers
    .filter((h) => state.columnTypes[h] === 'date')
    .map((h) => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`)
    .join('');


  filterCatColumn.innerHTML = `<option value="">— не выбран —</option>${catOptions}`;
  filterNumColumn.innerHTML = `<option value="">— не выбран —</option>${numOptions}`;
  filterDateColumn.innerHTML = `<option value="">— не выбран —</option>${dateOptions}`;
  filterCatValue.innerHTML = '<option value="">— все —</option>';
}

function populateVizControls() {
  const numericCols = state.headers.filter((h) => state.columnTypes[h] === 'numeric');
  const categoricalCols = state.headers.filter((h) => state.columnTypes[h] === 'categorical');

  const numOptions = numericCols.map((h) => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
  const catOptions = categoricalCols.map((h) => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');

  vizHistColumn.innerHTML = `<option value="">— выберите столбец —</option>${numOptions}`;
  vizPieColumn.innerHTML = `<option value="">— выберите столбец —</option>${catOptions}`;
  vizScatterX.innerHTML = `<option value="">— выберите столбец —</option>${numOptions}`;
  vizScatterY.innerHTML = `<option value="">— выберите столбец —</option>${numOptions}`;
}

function applyDefaultVizSelections() {
  const numericCols = state.headers.filter((h) => state.columnTypes[h] === 'numeric');
  const categoricalCols = state.headers.filter((h) => state.columnTypes[h] === 'categorical');

  if (numericCols.length) {
    vizHistColumn.value = numericCols[0];
    vizScatterX.value = numericCols[0];
    vizScatterY.value = numericCols[1] || numericCols[0];
  }
  if (categoricalCols.length) {
    vizPieColumn.value = categoricalCols[0];
  }
}

function applyFilters() {
  const catCol = filterCatColumn.value;
  const catVal = filterCatValue.value;
  const numCol = filterNumColumn.value;
  const minVal = filterNumMin.value.trim();
  const maxVal = filterNumMax.value.trim();

  let result = [...state.rows];

  if (catCol) {
    const idx = state.headers.indexOf(catCol);
    if (idx >= 0 && catVal) {
      result = result.filter((r) => String(r[idx]).trim() === catVal);
    }
  }

  if (numCol) {
    const idx = state.headers.indexOf(numCol);
    if (idx >= 0) {
      const min = minVal ? toNumber(minVal) : null;
      const max = maxVal ? toNumber(maxVal) : null;
      result = result.filter((r) => {
        const v = toNumber(r[idx]);
        if (v === null) return false;
        if (min !== null && v < min) return false;
        if (max !== null && v > max) return false;
        return true;
      });
    }
  }

  const dateCol = filterDateColumn.value;
  const dateMinVal = filterDateMin.value;
  const dateMaxVal = filterDateMax.value;
  if (dateCol) {
    const idx = state.headers.indexOf(dateCol);
    if (idx >= 0) {
      // Границы диапазона: от — начало дня, до — конец дня
      const min = dateMinVal ? new Date(dateMinVal + 'T00:00:00') : null;
      const max = dateMaxVal ? new Date(dateMaxVal + 'T23:59:59.999') : null;
      result = result.filter((r) => {
        const d = parseDateValue(r[idx]);
        if (d === null) return false;
        if (min !== null && d < min) return false;
        if (max !== null && d > max) return false;
        return true;
      });
    }
  }


  state.filteredRows = result;
  filterStatusEl.textContent = `Показано строк: ${result.length} из ${state.rows.length}`;

  renderAnalytics();
  renderTable();
  drawAllCharts();
}

function clearFilters() {
  filterCatColumn.value = '';
  filterCatValue.innerHTML = '<option value="">— все —</option>';
  filterNumColumn.value = '';
  filterNumMin.value = '';
  filterNumMax.value = '';
  filterDateColumn.value = '';
  filterDateMin.value = '';
  filterDateMax.value = '';

  state.filteredRows = [...state.rows];
  filterStatusEl.textContent = 'Фильтры не применены.';

  renderAnalytics();
  renderTable();
  drawAllCharts();
}

// ---------- Визуализация ----------
function drawAllCharts() {
  if (!state.headers.length) return;

  const histCol = vizHistColumn.value;
  const pieCol = vizPieColumn.value;
  const scatterX = vizScatterX.value;
  const scatterY = vizScatterY.value;

  if (histCol) {
    const idx = state.headers.indexOf(histCol);
    const values = state.filteredRows.map((r) => r[idx]);
    drawHistogram(histCanvas, histCol, values);
  } else {
    const ctx = histCanvas.getContext('2d');
    ctx.clearRect(0, 0, histCanvas.width, histCanvas.height);
  }

  if (pieCol) {
    const idx = state.headers.indexOf(pieCol);
    const values = state.filteredRows.map((r) => r[idx]);
    drawPieChart(pieCanvas, pieCol, values);
  } else {
    const ctx = pieCanvas.getContext('2d');
    ctx.clearRect(0, 0, pieCanvas.width, pieCanvas.height);
  }

  if (scatterX && scatterY) {
    const xIdx = state.headers.indexOf(scatterX);
    const yIdx = state.headers.indexOf(scatterY);
    const points = [];
    for (const row of state.filteredRows) {
      const x = toNumber(row[xIdx]);
      const y = toNumber(row[yIdx]);
      if (x !== null && y !== null) points.push({ x, y });
    }
    drawScatterPlot(scatterCanvas, scatterX, scatterY, points);
  } else {
    const ctx = scatterCanvas.getContext('2d');
    ctx.clearRect(0, 0, scatterCanvas.width, scatterCanvas.height);
  }
}

// ---------- События ----------
dropzone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  loadFile(file);
  e.target.value = '';
});

['dragenter', 'dragover'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  })
);

['dragleave', 'drop'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  })
);

dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  loadFile(file);
});

loadSampleBtn.addEventListener('click', loadSample);
resetFiltersBtn.addEventListener('click', clearFilters);

filterCatColumn.addEventListener('change', () => {
  const col = filterCatColumn.value;
  if (!col) {
    filterCatValue.innerHTML = '<option value="">— все —</option>';
    return;
  }
  const idx = state.headers.indexOf(col);
  const values = [...new Set(state.rows.map((r) => String(r[idx]).trim()).filter(Boolean))].sort();
  filterCatValue.innerHTML =
    '<option value="">— все —</option>' +
    values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
});

// Фильтры применяются автоматически при изменении любого параметра
[filterCatColumn, filterCatValue, filterNumColumn, filterNumMin, filterNumMax, filterDateColumn, filterDateMin, filterDateMax].forEach((el) => {
  el.addEventListener('change', applyFilters);
  el.addEventListener('input', applyFilters);
});

[vizHistColumn, vizPieColumn, vizScatterX, vizScatterY].forEach((el) => {
  el.addEventListener('change', drawAllCharts);
});

// Перерисовка при изменении размера окна
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawAllCharts, 200);
});

// Инициализация
resetApp();
