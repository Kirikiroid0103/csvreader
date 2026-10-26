/**
 * data.js
 *
 * Модуль работы с данными:
 * - парсинг CSV;
 * - определение разделителя;
 * - определение типов столбцов;
 * - утилиты для пропусков и чисел.
 *
 * Все функции возвращают простые структуры, чтобы их можно было
 * использовать в analytics.js и app.js без побочных эффектов.
 */

/**
 * Определяет наиболее вероятный разделитель по первой строке.
 * Поддерживаемые разделители: запятая, точка с запятой, табуляция, пайп.
 *
 * @param {string} text - исходный текст CSV
 * @returns {string} разделитель
 */
function detectDelimiter(text) {
  const firstLine = (text.split(/\r?\n/, 1)[0] || '');
  const candidates = [',', ';', '\t', '|'];

  let best = ',';
  let bestCount = -1;

  for (const delimiter of candidates) {
    const count = firstLine.split(delimiter).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = delimiter;
    }
  }

  return best;
}

/**
 * Парсит CSV с учётом кавычек и переносов строк внутри полей.
 *
 * @param {string} text - текст CSV
 * @param {string} [delimiter] - разделитель; если не передан, определяется автоматически
 * @returns {{headers: string[], rows: string[][]}}
 */
function parseCSV(text, delimiter) {
  const delim = delimiter || detectDelimiter(text);
  const allRows = parseCSVRows(text, delim);
  if (!allRows.length) return { headers: [], rows: [] };

  const headers = allRows[0].map((h) => String(h).trim());
  const rows = allRows.slice(1).map((r) => {
    // Приводим длину строки к длине заголовков
    const row = [...r];
    while (row.length < headers.length) row.push('');
    return row.slice(0, headers.length);
  });

  return { headers, rows };
}

/**
 * Низкоуровневый парсер строк CSV.
 *
 * @param {string} text
 * @param {string} delimiter
 * @returns {string[][]}
 */
function parseCSVRows(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    // Внутри кавычек: экранированные кавычки "" сохраняем как "
    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  // Добавляем последнюю строку, если файл не заканчивается переносом
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Отбрасываем полностью пустые строки
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

/**
 * Проверяет, является ли значение пропуском.
 * Считаем пропусками: пустую строку, NA, N/A, NULL, NONE, NaN.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isMissing(value) {
  if (value === null || value === undefined) return true;
  const v = String(value).trim();
  const lower = v.toLowerCase();
  return (
    v === '' ||
    lower === 'na' ||
    lower === 'n/a' ||
    lower === 'null' ||
    lower === 'none' ||
    lower === 'nan'
  );
}

/**
 * Проверяет, похоже ли значение на число.
 * Поддерживает: 12, -3.14, 1e5, 1 000,5 (после очистки).
 *
 * @param {string} value
 * @returns {boolean}
 */
function isNumeric(value) {
  if (isMissing(value)) return false;
  const v = String(value).trim();
  if (v === '') return false;

  // Убираем пробелы и запятые как разделители тысяч
  const cleaned = v.replace(/,/g, '').replace(/\s/g, '');

  return (
    /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(cleaned) ||
    /^-?\.\d+([eE][+-]?\d+)?$/.test(cleaned) ||
    /^-?\d+[eE][+-]?\d+$/.test(cleaned)
  );
}

/**
 * Преобразует строку в число. Если не удалось — возвращает null.
 *
 * @param {string} value
 * @returns {number|null}
 */
function toNumber(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim().replace(/,/g, '').replace(/\s/g, '');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Проверяет, похоже ли значение на дату.
 * Поддерживает ISO, DD.MM.YYYY, текстовые месяцы и т.д.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isDate(value) {
  if (isMissing(value)) return false;
  const v = String(value).trim();
  if (v === '') return false;

  const patterns = [
    /^\d{4}-\d{2}-\d{2}$/,
    /^\d{4}\/\d{2}\/\d{2}$/,
    /^\d{2}[./-]\d{2}[./-]\d{4}$/,
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/,
    /^\d{4}\/\d{2}\/\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/,
    /^\d{2}[./-]\d{2}[./-]\d{4}[ T]\d{2}:\d{2}(:\d{2})?$/,
    /^\d{1,2} (январь|февраль|март|апрель|май|июнь|июль|август|сентябрь|октябрь|ноябрь|декабрь) \d{4}$/i,
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}, \d{4}$/i,
    /^\d{1,2} (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{4}$/i
  ];

  for (const pattern of patterns) {
    if (pattern.test(v)) return true;
  }

  // Фолбэк: пробуем Date, но не принимаем просто числа как даты
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) {
    if (/^\d+$/.test(v)) return false;
    return true;
  }

  return false;
}

/**
 * Определяет тип столбца по его значениям.
 *
 * Логика:
 * - если >= 80% непустых значений числовые → numeric;
 * - если >= 80% непустых значений даты → date;
 * - если сумма долей чисел и дат >= 80% → mixed;
 * - иначе → categorical.
 *
 * @param {string[]} values - значения столбца
 * @returns {'numeric'|'categorical'|'date'|'mixed'}
 */
function inferColumnType(values) {
  const nonMissing = values.filter((v) => !isMissing(v));
  if (nonMissing.length === 0) return 'categorical';

  const numericCount = nonMissing.filter(isNumeric).length;
  const dateCount = nonMissing.filter(isDate).length;
  const numericRatio = numericCount / nonMissing.length;
  const dateRatio = dateCount / nonMissing.length;

  if (numericRatio >= 0.8) return 'numeric';
  if (dateRatio >= 0.8) return 'date';
  if (numericRatio + dateRatio >= 0.8) return 'mixed';
  return 'categorical';
}

/**
 * Определяет типы для всех столбцов.
 *
 * @param {string[]} headers
 * @param {string[][]} rows
 * @returns {Object<string, string>}
 */
function detectColumnTypes(headers, rows) {
  const types = {};
  headers.forEach((header, idx) => {
    const values = rows.map((r) => r[idx]);
    types[header] = inferColumnType(values);
  });
  return types;
}

/**
 * Возвращает человекочитаемое название типа.
 *
 * @param {string} type
 * @returns {string}
 */
function typeLabel(type) {
  const map = {
    numeric: 'Числовой',
    categorical: 'Категориальный',
    date: 'Дата',
    mixed: 'Смешанный'
  };
  return map[type] || type;
}

/**
 * Форматирует число для отображения.
 *
 * @param {number|null} n
 * @returns {string}
 */
function formatNumber(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (Number.isInteger(n)) return n.toLocaleString('ru-RU');
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 4 });
}

/**
 * Форматирует размер файла в человекочитаемом виде.
 *
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!bytes) return '—';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Экранирует HTML, чтобы безопасно вставлять пользовательские данные в DOM.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
