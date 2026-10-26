/**
 * analytics.js
 *
 * Расчёт аналитических метрик по столбцам.
 * Все функции принимают массив значений (строки) и возвращают числа/объекты.
 */

/**
 * Среднее арифметическое.
 *
 * @param {number[]} arr
 * @returns {number|null}
 */
function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Медиана.
 *
 * @param {number[]} arr
 * @returns {number|null}
 */
function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Выборочное стандартное отклонение (с делением на n-1).
 *
 * @param {number[]} arr
 * @returns {number|null}
 */
function stdDev(arr) {
  if (arr.length < 2) return null;
  const m = mean(arr);
  const variance = arr.reduce((acc, x) => acc + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/**
 * Топ-N значений по частоте.
 *
 * @param {string[]} values - исходные значения (строки)
 * @param {number} [topN=5]
 * @returns {Array<{value: string, count: number, pct: number}>}
 */
function topFrequencies(values, topN = 5) {
  const freq = new Map();

  for (const v of values) {
    if (isMissing(v)) continue;
    const key = String(v).trim();
    freq.set(key, (freq.get(key) || 0) + 1);
  }

  const total = [...freq.values()].reduce((a, b) => a + b, 0);

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([value, count]) => ({
      value,
      count,
      pct: total ? (count / total) * 100 : 0
    }));
}

/**
 * Считает количество пропусков в столбце.
 *
 * @param {string[]} values
 * @returns {number}
 */
function countMissing(values) {
  return values.filter(isMissing).length;
}

/**
 * Считает количество уникальных непустых значений.
 *
 * @param {string[]} values
 * @returns {number}
 */
function countUnique(values) {
  const unique = new Set(
    values.filter((v) => !isMissing(v)).map((v) => String(v).trim())
  );
  return unique.size;
}

/**
 * Считает пропуски по каждому столбцу.
 *
 * @param {string[][]} rows - нормализованные строки данных
 * @param {number} columnCount
 * @returns {number[]}
 */
function missingByColumn(rows, columnCount) {
  const result = new Array(columnCount).fill(0);
  for (const row of rows) {
    for (let i = 0; i < columnCount; i += 1) {
      if (isMissing(row[i])) result[i] += 1;
    }
  }
  return result;
}

/**
 * Строит сводку по датасету.
 *
 * @param {string[][]} rows
 * @param {number} columnCount
 * @returns {{rows: number, columns: number, totalMissing: number, missingPct: number}}
 */
function datasetSummary(rows, columnCount) {
  const totalCells = rows.length * columnCount;
  const missing = missingByColumn(rows, columnCount);
  const totalMissing = missing.reduce((a, b) => a + b, 0);
  const missingPct = totalCells ? (totalMissing / totalCells) * 100 : 0;

  return {
    rows: rows.length,
    columns: columnCount,
    totalMissing,
    missingPct
  };
}

/**
 * Считает метрики для числового столбца.
 *
 * @param {string[]} values - строковые значения столбца
 * @returns {{mean: number|null, median: number|null, min: number|null, max: number|null, std: number|null, missing: number}}
 */
function computeNumericStats(values) {
  const nums = values.map(toNumber).filter((n) => n !== null);
  const missing = countMissing(values);

  if (!nums.length) {
    return { mean: null, median: null, min: null, max: null, std: null, missing };
  }

  return {
    mean: mean(nums),
    median: median(nums),
    min: Math.min(...nums),
    max: Math.max(...nums),
    std: stdDev(nums),
    missing
  };
}

/**
 * Считает метрики для категориального столбца.
 *
 * @param {string[]} values - строковые значения столбца
 * @returns {{unique: number, missing: number, total: number, top5: Array<[string, number]>}}
 */
function computeCategoricalStats(values) {
  const missing = countMissing(values);
  const unique = countUnique(values);
  const total = values.length - missing;
  const top5 = topFrequencies(values, 5).map((item) => [item.value, item.count]);
  // Все уникальные значения, отсортированные по частоте (для прокручиваемого списка)
  const frequencies = topFrequencies(values, Infinity).map((item) => [item.value, item.count]);

  return { unique, missing, total, top5, frequencies };
}
