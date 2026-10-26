/**
 * validation.js
 *
 * Валидация загружаемых CSV-файлов до запуска аналитики.
 *
 * Правила:
 * - пустой файл (0 байт / только пробельные символы) → ошибка;
 * - битый CSV (незакрытые кавычки, несовпадение числа полей) → ошибка;
 * - файл без числовых столбцов → ошибка;
 * - текст вместо чисел в числовых столбцах → ошибка;
 * - отсутствующие значения (пропуски) → НЕ ошибка, только предупреждение;
 * - пустые строки → НЕ ошибка, только предупреждение.
 *
 * Функция validateCSV() возвращает объект:
 * {
 *   ok: boolean,          // можно ли показывать аналитику
 *   errors: string[],     // блокирующие ошибки (при ok=false)
 *   warnings: string[],   // предупреждения (при ok=true)
 *   stats: {              // данные для предупреждений
 *     emptyRows: number,
 *     rowsWithMissing: number,
 *     totalMissing: number
 *   }
 * }
 */


/**
 * Считает полностью пустые строки в исходном тексте CSV.
 * Пустая строка — строка, которая после удаления пробельных символов пуста
 * или содержит только разделители (например ",,,").
 *
 * @param {string} text
 * @param {string} delimiter
 * @returns {number}
 */
function countEmptyLines(text, delimiter) {
  const lines = text.split(/\r?\n/);
  let count = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    // Игнорируем "пустую" строку после последнего переноса в конце файла
    if (i === lines.length - 1 && trimmed === '') continue;
    if (trimmed === '') {
      count += 1;
      continue;
    }
    // Строка из одних разделителей: ",,," или ";"
    const onlyDelims = trimmed.split(delimiter).every((p) => p.trim() === '');
    if (onlyDelims) count += 1;
  }
  return count;
}


/**
 * Валидирует распарсенный CSV.
 *
 * @param {string} text - исходный текст файла
 * @param {{headers: string[], rows: string[][]}} parsed - результат parseCSV
 * @returns {{ok: boolean, errors: string[], warnings: string[], stats: {emptyRows: number, rowsWithMissing: number, totalMissing: number}}}
 */
function validateCSV(text, parsed) {
  const errors = [];
  const warnings = [];
  const stats = { emptyRows: 0, rowsWithMissing: 0, totalMissing: 0 };


  // 1. Пустой файл: нет текста или только пробельные символы
  if (!text || !text.trim()) {
    errors.push('Файл пуст. Загрузите CSV с данными.');
    return { ok: false, errors, warnings, stats };
  }


  // 2. Нет заголовков
  if (!parsed.headers.length) {
    errors.push('Файл не содержит заголовков. Проверьте формат CSV.');
    return { ok: false, errors, warnings, stats };
  }


  // 3. Битый CSV: незакрытые кавычки в исходном тексте
  if (hasUnclosedQuotes(text)) {
    errors.push('Битый CSV: обнаружены незакрытые кавычки. Проверьте файл.');
    return { ok: false, errors, warnings, stats };
  }


  // 4. Битый CSV: несовпадение числа полей в строках
  const mismatched = countMismatchedRows(text, parsed.headers);
  if (mismatched > 0) {
    errors.push(
      `Битый CSV: в ${mismatched} строк(ах) число полей не совпадает с числом заголовков. Проверьте файл.`
    );
    return { ok: false, errors, warnings, stats };
  }


  // 5. Файл без данных (только заголовки)
  if (!parsed.rows.length) {
    errors.push('Файл не содержит строк данных — только заголовки.');
    return { ok: false, errors, warnings, stats };
  }


  // 6. Подсчёт пустых строк (по исходному тексту) и пропусков (по распарсенным строкам)
  stats.emptyRows = countEmptyLines(text, detectDelimiter(text));
  for (const row of parsed.rows) {
    let rowMissing = 0;
    for (const v of row) {
      if (isMissing(v)) rowMissing += 1;
    }
    if (rowMissing > 0) {
      stats.rowsWithMissing += 1;
      stats.totalMissing += rowMissing;
    }
  }


  // 7. Файл без числовых столбцов
  const numericCols = parsed.headers.filter(
    (h, idx) => inferColumnType(parsed.rows.map((r) => r[idx])) === 'numeric'
  );
  if (!numericCols.length) {
    errors.push('В файле нет числовых столбцов. Аналитика невозможна.');
    return { ok: false, errors, warnings, stats };
  }


  // 8. Текст вместо чисел: в столбцах, определённых как числовые,
  //    есть непустые значения, которые не являются числами
  const textInNumeric = findTextInNumericColumns(parsed.headers, parsed.rows);
  if (textInNumeric.length > 0) {
    const details = textInNumeric
      .map((item) => `«${item.column}» (${item.count} знач.)`)
      .join(', ');
    errors.push(
      `В числовых столбцах обнаружен текст вместо чисел: ${details}. Проверьте данные.`
    );
    return { ok: false, errors, warnings, stats };
  }


  // 9. Предупреждения (не блокирующие)
  if (stats.emptyRows > 0) {
    warnings.push(
      `Обнаружено пустых строк: ${stats.emptyRows}. Они исключены из подсчёта пропусков.`
    );
  }
  if (stats.rowsWithMissing > 0) {
    warnings.push(
      `Строк с пропущенными значениями: ${stats.rowsWithMissing} (всего пропусков: ${stats.totalMissing}).`
    );
  }


  return { ok: true, errors, warnings, stats };
}


/**
 * Проверяет, есть ли в тексте незакрытые кавычки.
 * Считает кавычки вне полей: если общее количество кавычек в строке нечётное
 * или парсер остался внутри кавычек в конце файла — файл битый.
 *
 * @param {string} text
 * @returns {boolean}
 */
function hasUnclosedQuotes(text) {
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i += 1; // экранированная кавычка
      } else {
        inQuotes = !inQuotes;
      }
    }
  }
  return inQuotes;
}


/**
 * Считает строки, у которых число полей не совпадает с числом заголовков.
 * Использует parseCSVRows (до нормализации), чтобы увидеть исходную длину строк.
 *
 * @param {string} text - исходный текст CSV
 * @param {string[]} headers
 * @returns {number}
 */
function countMismatchedRows(text, headers) {
  const delimiter = detectDelimiter(text);
  const rawRows = parseCSVRows(text, delimiter);
  if (rawRows.length < 2) return 0;

  let count = 0;
  for (let i = 1; i < rawRows.length; i += 1) {
    if (rawRows[i].length !== headers.length) {
      count += 1;
    }
  }
  return count;
}


/**
 * Находит столбцы, определённые как числовые, но содержащие текст.
 *
 * @param {string[]} headers
 * @param {string[][]} rows
 * @returns {Array<{column: string, count: number}>}
 */
function findTextInNumericColumns(headers, rows) {
  const result = [];
  headers.forEach((header, idx) => {
    const values = rows.map((r) => r[idx]);
    const type = inferColumnType(values);
    if (type !== 'numeric') return;

    const textCount = values.filter((v) => !isMissing(v) && !isNumeric(v)).length;
    if (textCount > 0) {
      result.push({ column: header, count: textCount });
    }
  });
  return result;
}
