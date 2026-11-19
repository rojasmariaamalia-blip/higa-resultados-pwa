const $=s=>document.querySelector(s);
const state={dnis:[],results:[]};
const log=(m)=>{$("#log").textContent=m};

function normalizeDnis(text){
  const found=(text.match(/\b\d{7,9}\b/g)||[]).filter((v,i,a)=>a.indexOf(v)===i);
  state.dnis=found; $("#dniCount").textContent=`${found.length} DNI`;
  $("#dniInput").value=found.join("\n");
  return found;
}

$("#normalizeBtn").onclick=()=>normalizeDnis($("#dniInput").value);

$("#csvInput").onchange=e=>{
  const f=e.target.files[0]; if(!f)return;
  Papa.parse(f,{complete:r=>{
    const text=r.data.flat().join("\n");
    normalizeDnis(text);
    log(`CSV cargado. Se detectaron ${state.dnis.length} DNI.`);
  }});
};

$("#imageInput").onchange=async e=>{
  const f=e.target.files[0]; if(!f)return;
  $("#ocrStatus").textContent="Leyendo foto… puede tardar unos segundos.";
  try{
    const {data:{text}}=await Tesseract.recognize(f,"spa",{logger:m=>{
      if(m.status) $("#ocrStatus").textContent=`${m.status} ${Math.round((m.progress||0)*100)}%`;
    }});
    normalizeDnis(text);
    $("#ocrStatus").textContent=`Foto procesada. Se detectaron ${state.dnis.length} DNI.`;
  }catch(err){$("#ocrStatus").textContent="No se pudo leer la foto: "+err.message}
};

function clean(s){return s.replace(/\s+/g," ").trim()}

function extract(pdfText){
  const t=clean(pdfText);
  const out={
    dni:(t.match(/\bDNI[-\s:]*(\d{7,9})\b/i)||[])[1]||"",
    fecha:(t.match(/Fecha Ingreso\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i)||[])[1]||"",
    elisa:(t.match(/HIV\s*-\s*ELISA[\s\S]{0,180}?Resultado\s+(Reactivo|No Reactivo|No\s+reactivo|Indeterminado)/i)||[])[1]||"",
    carga:(t.match(/HIV\s*CARGA\s*VIRAL[\s\S]{0,220}?Resultado\s+([0-9]+(?:[.,][0-9]+)?)/i)||[])[1]||"",
    cd4pct:"", cd4abs:"", cd8pct:"", cd8abs:"", ratio:""
  };
  const block=(t.match(/CD3\/CD4\/CD8([\s\S]{0,900})/i)||[])[1]||"";
  const m1=block.match(/CD4\s+([0-9]+(?:[.,][0-9]+)?)\s*%[\s\S]{0,80}?RECUENTO\s+CD4\s+([0-9]+)/i);
  if(m1){out.cd4pct=m1[1];out.cd4abs=m1[2]}
  const m2=block.match(/CD8\s+([0-9]+(?:[.,][0-9]+)?)\s*%[\s\S]{0,80}?RECUENTO\s+CD8\s+([0-9]+)/i);
  if(m2){out.cd8pct=m2[1];out.cd8abs=m2[2]}
  out.ratio=(block.match(/RELACION\s+CD4\/CD8\s+([0-9]+(?:[.,][0-9]+)?)/i)||[])[1]||"";
  return out;
}

function render(){
  $("#resultsBody").innerHTML=state.results.map(r=>`<tr>
    <td>${r.dni}</td><td>${r.fecha}</td><td>${r.elisa}</td><td>${r.carga}</td>
    <td>${r.cd4pct}</td><td>${r.cd4abs}</td><td>${r.cd8pct}</td><td>${r.cd8abs}</td><td>${r.ratio}</td>
  </tr>`).join("");
}

$("#pdfInput").onchange=async e=>{
  const files=[...e.target.files]; if(!files.length)return;
  $("#pdfStatus").textContent=`Procesando ${files.length} PDF…`;
  try{
    const pdfjs=await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
    for(const file of files){
      const buf=await file.arrayBuffer();
      const pdf=await pdfjs.getDocument({data:buf}).promise;
      let text="";
      for(let p=1;p<=pdf.numPages;p++){
        const page=await pdf.getPage(p);
        const c=await page.getTextContent();
        text+=" "+c.items.map(x=>x.str).join(" ");
      }
      const r=extract(text);
      if(!r.dni){
        r.dni=state.dnis.find(d=>text.includes(d))||"";
      }
      state.results.push(r);
    }
    render();
    $("#pdfStatus").textContent=`Listo. ${state.results.length} informe(s) procesado(s).`;
    log("Los PDF fueron procesados dentro del navegador. No se enviaron a un servidor de esta aplicación.");
  }catch(err){$("#pdfStatus").textContent="Error al procesar PDF: "+err.message}
};

$("#csvExport").onclick=()=>{
  if(!state.results.length){alert("No hay resultados para exportar.");return}
  const rows=state.results.map(r=>({
    DNI:r.dni,Fecha:r.fecha,"HIV-ELISA":r.elisa,"Carga viral":r.carga,
    "CD4 %":r.cd4pct,"CD4 absoluto":r.cd4abs,"CD8 %":r.cd8pct,"CD8 absoluto":r.cd8abs,"CD4/CD8":r.ratio
  }));
  const csv=Papa.unparse(rows);
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="resultados_higa.csv";a.click();
};

$("#clearBtn").onclick=()=>{state.dnis=[];state.results=[];$("#dniInput").value="";$("#resultsBody").innerHTML="";$("#dniCount").textContent="0 DNI";log("Datos borrados del navegador.")};

if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
