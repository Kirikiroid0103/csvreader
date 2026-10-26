const AnalyticsModule = (() => {
  function mean(values) { return values.length ? values.reduce((a,b)=>a+b,0)/values.length : null; }
  function median(values) {
    if (!values.length) return null;
    const sorted=[...values].sort((a,b)=>a-b);
    const mid=Math.floor(sorted.length/2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
  }
  function stdDev(values) {
    if (values.length < 2) return null;
    const m=mean(values);
    const variance=values.reduce((acc,v)=>acc+(v-m)**2,0)/(values.length-1);
    return Math.sqrt(variance);
  }
  function numericStats(rows, column) {
    const values=[]; let missing=0;
    rows.forEach(row => {
      const n=DataModule.toNumber(row[column]);
      if (n === null) missing += 1; else values.push(n);
    });
    return {
      column,
      mean: mean(values),
      median: median(values),
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      stdDev: stdDev(values),
      missing,
      values
    };
  }
  function categoricalStats(rows, column) {
    const counts={}; let missing=0;
    rows.forEach(row => {
      const v=row[column];
      if (v === null || v === undefined || String(v).trim()==='') missing += 1;
      else counts[v]=(counts[v]||0)+1;
    });
    const unique=Object.keys(counts).length;
    const top5=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
    return { column, unique, missing, counts, top5 };
  }
  function totalMissing(rows, columns) {
    let total=0;
    rows.forEach(row => columns.forEach(c => {
      const v=row[c];
      if (v === null || v === undefined || String(v).trim()==='') total += 1;
    }));
    return total;
  }
  return { numericStats, categoricalStats, totalMissing };
})();
