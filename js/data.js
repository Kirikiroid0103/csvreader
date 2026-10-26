const DataModule = (() => {
  function isNumericValue(value) {
    if (value === null || value === undefined) return false;
    const s = String(value).trim();
    if (s === '') return false;
    const normalized = s.replace(',', '.');
    return !Number.isNaN(Number(normalized));
  }
  function isDateValue(value) {
    if (value === null || value === undefined) return false;
    const s = String(value).trim();
    if (!s) return false;
    return /^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isNaN(Date.parse(s));
  }
  function toNumber(value) {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    if (s === '') return null;
    const n = Number(s.replace(',', '.'));
    return Number.isNaN(n) ? null : n;
  }
  function detectColumnType(values) {
    const nonEmpty = values.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
    if (nonEmpty.length === 0) return 'empty';
    const numericCount = nonEmpty.filter(isNumericValue).length;
    const dateCount = nonEmpty.filter(isDateValue).length;
    if (numericCount / nonEmpty.length >= 0.7) return 'numeric';
    if (dateCount / nonEmpty.length >= 0.7) return 'date';
    return 'categorical';
  }
  function parseCsv(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('Файл не выбран.'));
      if (file.size === 0) return reject(new Error('Файл пустой. Загрузите CSV с данными.'));
      Papa.parse(file, {
        header: true,
        skipEmptyLines: 'greedy',
        complete: (result) => {
          const data = result.data || [];
          if (!data.length) return reject(new Error('Не удалось распознать строки CSV. Проверьте формат файла.'));
          const columns = Object.keys(data[0]);
          if (!columns.length) return reject(new Error('В файле нет столбцов.'));
          const columnTypes = {};
          columns.forEach(col => {
            const values = data.map(row => row[col]);
            columnTypes[col] = detectColumnType(values);
          });
          const numericColumns = columns.filter(c => columnTypes[c] === 'numeric');
          const categoricalColumns = columns.filter(c => columnTypes[c] === 'categorical');
          if (!numericColumns.length && !categoricalColumns.length) {
            return reject(new Error('Не удалось определить подходящие столбцы. Загрузите CSV с числовыми или категориальными данными.'));
          }
          resolve({ rows: data, columns, columnTypes, numericColumns, categoricalColumns });
        },
        error: (err) => reject(new Error('Не удалось распознать CSV. Проверьте формат файла.'))
      });
    });
  }
  return { parseCsv, toNumber, isNumericValue, isDateValue, detectColumnType };
})();
