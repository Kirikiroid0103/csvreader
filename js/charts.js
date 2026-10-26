const ChartsModule = (() => {
  let histChart=null, pieChart=null, scatterChart=null;
  function fmt(v) { return v === null || v === undefined ? '—' : Number(v).toLocaleString('ru-RU', {maximumFractionDigits:2}); }
  function histogramData(rows, column) {
    const values=rows.map(r=>DataModule.toNumber(r[column])).filter(v=>v!==null);
    if (!values.length) return {labels:[], data:[]};
    const min=Math.min(...values), max=Math.max(...values);
    const bins=10;
    const step=(max-min)/bins || 1;
    const labels=[], data=[];
    for (let i=0;i<bins;i++) {
      const start=min+i*step;
      const end=start+step;
      labels.push(`${fmt(start)} - ${fmt(end)}`);
      data.push(values.filter(v => v>=start && (i===bins-1 ? v<=end : v<end)).length);
    }
    return {labels, data};
  }
  function categoricalData(rows, column) {
    const counts={};
    rows.forEach(r => {
      const v=r[column];
      if (v === null || v === undefined || String(v).trim()==='') return;
      counts[v]=(counts[v]||0)+1;
    });
    const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10);
    return {labels:entries.map(e=>e[0]), data:entries.map(e=>e[1])};
  }
  function scatterData(rows, xCol, yCol) {
    const points=[];
    rows.forEach(r => {
      const x=DataModule.toNumber(r[xCol]);
      const y=DataModule.toNumber(r[yCol]);
      if (x!==null && y!==null) points.push({x,y});
    });
    return points;
  }
  function renderAll(state) {
    if (!state) return;
    const histCol=document.getElementById('histColumn').value;
    const pieCol=document.getElementById('pieColumn').value;
    const scatterX=document.getElementById('scatterX').value;
    const scatterY=document.getElementById('scatterY').value;
    if (histChart) histChart.destroy();
    if (pieChart) pieChart.destroy();
    if (scatterChart) scatterChart.destroy();
    if (histCol) {
      const d=histogramData(state.rows, histCol);
      histChart=new Chart(document.getElementById('histChart'), {
        type:'bar',
        data:{labels:d.labels, datasets:[{label:`Распределение: ${histCol}`, data:d.data, backgroundColor:'#2f6fed'}]},
        options:{responsive:true, maintainAspectRatio:false, plugins:{title:{display:true, text:`Гистограмма: ${histCol}`}}, scales:{x:{title:{display:true,text:'Интервал'}}, y:{title:{display:true,text:'Частота'}}}}
      });
    }
    if (pieCol) {
      const d=categoricalData(state.rows, pieCol);
      pieChart=new Chart(document.getElementById('pieChart'), {
        type:'pie',
        data:{labels:d.labels, datasets:[{label:`Частота: ${pieCol}`, data:d.data}]},
        options:{responsive:true, maintainAspectRatio:false, plugins:{title:{display:true, text:`Круговая диаграмма: ${pieCol}`}}}
      });
    }
    if (scatterX && scatterY) {
      const d=scatterData(state.rows, scatterX, scatterY);
      scatterChart=new Chart(document.getElementById('scatterChart'), {
        type:'scatter',
        data:{datasets:[{label:`${scatterX} vs ${scatterY}`, data:d, backgroundColor:'#12b76a'}]},
        options:{responsive:true, maintainAspectRatio:false, plugins:{title:{display:true, text:`Диаграмма рассеяния: ${scatterX} vs ${scatterY}`}}, scales:{x:{title:{display:true,text:scatterX}}, y:{title:{display:true,text:scatterY}}}}
      });
    }
  }
  return { renderAll };
})();
