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
      if (!parsed.headers.length) {
        throw new Error('Не удалось прочитать заголовки');
      }

      state.fileName = file.name;
      state.headers = parsed.headers;
      state.rows = parsed.rows;
      state.columnTypes = detectColumnTypes(parsed.headers, parsed.rows);
      state.filteredRows = [...state.rows];

      fileNameEl.textContent = file.name;
      setStatus(`Загружено строк: ${state.rows.length}`, 'success');

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
      if (!parsed.headers.length) throw new Error('Пустой пример');

      state.fileName = 'sales_data.csv (пример)';
      state.headers = parsed.headers;
      state.rows = parsed.rows;
      state.columnTypes = detectColumnTypes(parsed.headers, parsed.rows);
      state.filteredRows = [...state.rows];

      fileNameEl.textContent = 'sales_data.csv (пример)';
      setStatus(`Загружено строк: ${state.rows.length}`, 'success');
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

  const cards = state.headers.map((header, idx) => {
    const type = state.columnTypes[header] || 'mixed';
    const values = state.rows.map((r) => r[idx]);

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
      const top = stats.top5
        .map(
          ([value, count]) => `
            <div class="top-item">
              <div>
                <div>${escapeHtml(value)}</div>
                <div class="bar"><div class="bar-fill" style="width:${Math.round((count / stats.total) * 100)}%"></div></div>
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

  filterCatColumn.innerHTML = `<option value="">— не выбран —</option>${catOptions}`;
  filterNumColumn.innerHTML = `<option value="">— не выбран —</option>${numOptions}`;
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

  state.filteredRows = result;
  filterStatusEl.textContent = `Показано строк: ${result.length} из ${state.rows.length}`;

  renderTable();
  drawAllCharts();
}

function clearFilters() {
  filterCatColumn.value = '';
  filterCatValue.innerHTML = '<option value="">— все —</option>';
  filterNumColumn.value = '';
  filterNumMin.value = '';
  filterNumMax.value = '';

  state.filteredRows = [...state.rows];
  filterStatusEl.textContent = 'Фильтры не применены.';

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
[filterCatColumn, filterCatValue, filterNumColumn, filterNumMin, filterNumMax].forEach((el) => {
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
