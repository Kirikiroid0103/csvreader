let appState=null;
function showError(msg) {
  const box=document.getElementById('errorBox');
  box.textContent=msg;
  box.classList.remove('hidden');
}
function hideError() { document.getElementById('errorBox').classList.add('hidden'); }
function showSection(id) { document.getElementById(id).classList.remove('hidden'); }
function hideSection(id) { document.getElementById(id).classList.add('hidden'); }
function fillSelect(id, columns, placeholder) {
  const sel=document.getElementById(id);
  sel.innerHTML='';
  if (placeholder) {
    const opt=document.createElement('option');
    opt.value=''; opt.textContent=placeholder; sel.appendChild(opt);
  }
  columns.forEach(c => {
    const opt=document.createElement('option');
    opt.value=c; opt.textContent=c; sel.appendChild(opt);
  });
}
function renderSummary(state) {
  const missing=AnalyticsModule.totalMissing(state.rows, state.columns);
  const items=[
    ['Строк', state.rows.length],
    ['Столбцов', state.columns.length],
    ['Пропусков', missing],
    ['Числовых', state.numericColumns.length],
    ['Категориальных', state.categoricalColumns.length]
  ];
  document.getElementById('summaryGrid').innerHTML=items.map(([l,v])=>`<div class="summary-item"><div class="label">${l}</div><div class="value">${v}</div></div>`).join('');
  const table=document.getElementById('columnsTable');
  table.innerHTML=`<thead><tr><th>Столбец</th><th>Тип</th></tr></thead><tbody>${state.columns.map(c=>`<tr><td>${c}</td><td>${state.columnTypes[c]}</td></tr>`).join('')}</tbody>`;
}
function renderPreview(state) {
  const table=document.getElementById('previewTable');
  const rows=state.rows.slice(0,20);
  table.innerHTML=`<thead><tr>${state.columns.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${state.columns.map(c=>`<td>${r[c] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>`;
}
function renderAnalytics(state) {
  const numeric=document.getElementById('numericAnalytics');
  numeric.innerHTML=state.numericColumns.map(col => {
    const s=AnalyticsModule.numericStats(state.rows, col);
    return `<div class="analytics-card"><h4>${col}</h4>
      <div class="stat-row"><span>Среднее</span><span>${s.mean===null?'—':s.mean.toLocaleString('ru-RU',{maximumFractionDigits:2})}</span></div>
      <div class="stat-row"><span>Медиана</span><span>${s.median===null?'—':s.median.toLocaleString('ru-RU',{maximumFractionDigits:2})}</span></div>
      <div class="stat-row"><span>Минимум</span><span>${s.min===null?'—':s.min.toLocaleString('ru-RU',{maximumFractionDigits:2})}</span></div>
      <div class="stat-row"><span>Максимум</span><span>${s.max===null?'—':s.max.toLocaleString('ru-RU',{maximumFractionDigits:2})}</span></div>
      <div class="stat-row"><span>Стандартное отклонение</span><span>${s.stdDev===null?'—':s.stdDev.toLocaleString('ru-RU',{maximumFractionDigits:2})}</span></div>
      <div class="stat-row"><span>Пропуски</span><span>${s.missing}</span></div>
    </div>`;
  }).join('') || '<p>Нет числовых столбцов.</p>';
  const categorical=document.getElementById('categoricalAnalytics');
  categorical.innerHTML=state.categoricalColumns.map(col => {
    const s=AnalyticsModule.categoricalStats(state.rows, col);
    return `<div class="analytics-card"><h4>${col}</h4>
      <div class="stat-row"><span>Уникальных значений</span><span>${s.unique}</span></div>
      <div class="stat-row"><span>Пропуски</span><span>${s.missing}</span></div>
      <div class="stat-row"><span>Топ-5</span><span>${s.top5.map(([k,v])=>`${k}: ${v}`).join(', ') || '—'}</span></div>
    </div>`;
  }).join('') || '<p>Нет категориальных столбцов.</p>';
}
function setupControls(state) {
  fillSelect('histColumn', state.numericColumns, 'Выберите числовой столбец');
  fillSelect('pieColumn', state.categoricalColumns, 'Выберите категориальный столбец');
  fillSelect('scatterX', state.numericColumns, 'Выберите X');
  fillSelect('scatterY', state.numericColumns, 'Выберите Y');
  if (state.numericColumns.length) {
    document.getElementById('histColumn').value=state.numericColumns[0];
    document.getElementById('scatterX').value=state.numericColumns[0];
    document.getElementById('scatterY').value=state.numericColumns[1] || state.numericColumns[0];
  }
  if (state.categoricalColumns.length) document.getElementById('pieColumn').value=state.categoricalColumns[0];
}
async function handleFile(file) {
  hideError();
  try {
    appState=await DataModule.parseCsv(file);
    renderSummary(appState);
    renderPreview(appState);
    renderAnalytics(appState);
    setupControls(appState);
    showSection('summaryCard'); showSection('previewCard'); showSection('analyticsCard'); showSection('chartsCard');
    ChartsModule.renderAll(appState);
  } catch (e) {
    showError(e.message || 'Не удалось обработать файл.');
    hideSection('summaryCard'); hideSection('previewCard'); hideSection('analyticsCard'); hideSection('chartsCard');
  }
}
document.addEventListener('DOMContentLoaded', () => {
  const input=document.getElementById('fileInput');
  const drop=document.getElementById('dropzone');
  input.addEventListener('change', e => handleFile(e.target.files[0]));
  drop.addEventListener('click', () => input.click());
  ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('dragover'); }));
  drop.addEventListener('drop', e => {
    const file=e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  ['histColumn','pieColumn','scatterX','scatterY'].forEach(id => document.getElementById(id).addEventListener('change', () => ChartsModule.renderAll(appState)));
});
