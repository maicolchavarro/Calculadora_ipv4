(function () {
  const ipInput = document.getElementById("ip");
  const prefixInput = document.getElementById("prefix");
  const subnetsInput = document.getElementById("subnets");
  const hostsContainer = document.getElementById("hostsContainer");
  const form = document.getElementById("vlsmForm");
  const resultDiv = document.getElementById("result");

  prefixInput.readOnly = false;
  prefixInput.min = 1;
  prefixInput.max = 30; 
  
  // Detectar clase A/B/C 
  ipInput.addEventListener("input", function () {
    const ip = this.value.trim();
    const parts = ip.split(".");
    if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
      const first = parseInt(parts[0], 10);
      if (first >= 1 && first <= 126) prefixInput.value = 8;
      else if (first >= 128 && first <= 191) prefixInput.value = 16;
      else if (first >= 192 && first <= 223) prefixInput.value = 24;
      else prefixInput.value = "";
    }
  });

  // tablas de subred
  subnetsInput.addEventListener("input", function () {
    const count = Math.max(0, parseInt(this.value, 10) || 0);
    hostsContainer.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const row = document.createElement("tr");
      const td1 = document.createElement("td");
      td1.textContent = `Subred ${i + 1}`;
      const td2 = document.createElement("td");
      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.required = true;
      input.placeholder = `Hosts subred ${i + 1}`;
      td2.appendChild(input);
      row.appendChild(td1);
      row.appendChild(td2);
      hostsContainer.appendChild(row);
    }
  });

  // máscara 
  function prefixToMask(prefix) {
    let p = prefix;
    const parts = [];
    for (let i = 0; i < 4; i++) {
      const bits = Math.min(8, Math.max(0, p));
      parts.push(bits === 0 ? 0 : 256 - Math.pow(2, 8 - bits));
      p -= bits;
    }
    return parts.join(".");
  }

  //  máscara entera 
  function maskIntFromPrefix(prefix) {
    let p = prefix;
    const octs = [];
    for (let i = 0; i < 4; i++) {
      const bits = Math.min(8, Math.max(0, p));
      octs.push(bits === 0 ? 0 : 256 - Math.pow(2, 8 - bits));
      p -= bits;
    }
    return (octs[0] * 2 ** 24 + octs[1] * 2 ** 16 + octs[2] * 2 ** 8 + octs[3]) >>> 0;
  }

  // IP 
  function ipToInt(ip) {
    const parts = ip.split(".").map(p => parseInt(p, 10));
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return NaN;
    return (parts[0] * 2 ** 24 + parts[1] * 2 ** 16 + parts[2] * 2 ** 8 + parts[3]) >>> 0;
  }

  //  IP
  function intToIp(int) {
    int = int >>> 0;
    return [
      (int >>> 24) & 255,
      (int >>> 16) & 255,
      (int >>> 8) & 255,
      int & 255
    ].join(".");
  }

  
  function calcularPrefijo(hostsNecesarios) {
    let bits = 0;
    while ((2 ** bits - 2) < hostsNecesarios) bits++;
    return 32 - bits;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    resultDiv.innerHTML = "";

    const ipBaseStr = ipInput.value.trim();
    const prefix = parseInt(prefixInput.value, 10);

    // Validaciones
    const ipInt = ipToInt(ipBaseStr);
    if (isNaN(ipInt)) {
      resultDiv.innerHTML = `<div class="success-box" style="border-left-color:#d9534f;background:#fdecea;color:#a94442">Error: IP inválida.</div>`;
      return;
    }
    if (isNaN(prefix) || prefix < 1 || prefix > 30) {
      resultDiv.innerHTML = `<div class="success-box" style="border-left-color:#d9534f;background:#fdecea;color:#a94442">Error: Prefijo inválido (1-30).</div>`;
      return;
    }

    const hostInputs = hostsContainer.querySelectorAll("input");
    if (!hostInputs.length) {
      resultDiv.innerHTML = `<div class="success-box" style="border-left-color:#d9534f;background:#fdecea;color:#a94442">Error: Indica número de subredes y hosts por cada una.</div>`;
      return;
    }

    // Recolectar hosts solicitados 
    const hostsArray = [];
    for (let i = 0; i < hostInputs.length; i++) {
      const v = parseInt(hostInputs[i].value, 10);
      if (isNaN(v) || v < 1) {
        resultDiv.innerHTML = `<div class="success-box" style="border-left-color:#d9534f;background:#fdecea;color:#a94442">Error: Todos los campos de hosts deben ser enteros mayores a 0.</div>`;
        return;
      }
      hostsArray.push({ id: i + 1, hosts: v });
    }

    // Ordenar descendente para asignar VLSM (mayores primero)
    const sorted = hostsArray.slice().sort((a, b) => b.hosts - a.hosts);

    // Datos de la red base
    const maskInt = maskIntFromPrefix(prefix);
    const baseStart = (ipInt & maskInt) >>> 0;               
    const hostCountBase = 2 ** (32 - prefix);               
    const baseEnd = (baseStart + hostCountBase - 1) >>> 0;  
    const totalDisponibles = Math.max(0, hostCountBase - 2); 

    
    let current = baseStart >>> 0;
    const assigned = []; 
    let overflow = false;

    for (const req of sorted) {
      const newPref = calcularPrefijo(req.hosts);
      const blockSize = 2 ** (32 - newPref);     
      const usableHosts = Math.max(0, blockSize - 2);

      
      if (((current + blockSize - 1) >>> 0) > baseEnd) {
        overflow = true;
        
      }

      assigned.push({
        id: req.id,
        requested: req.hosts,
        assignedHosts: usableHosts, 
        newPrefix: newPref,
        netAddr: current >>> 0,
        maskStr: prefixToMask(newPref),
        firstHost: (current + 1) >>> 0,
        lastHost: (current + blockSize - 2) >>> 0,
        broadcast: (current + blockSize - 1) >>> 0,
        blockSize: blockSize >>> 0
      });

      current = (current + blockSize) >>> 0;
    }

    // Totales
    const totalSolicitados = hostsArray.reduce((acc, s) => acc + s.hosts, 0);
    
    const totalAsignados = assigned.reduce((acc, a) => acc + a.assignedHosts, 0);

    
    if (overflow) {
      resultDiv.innerHTML = `
        <div class="success-box" style="border-left-color:#d9534f;background:#fdecea;color:#a94442">
          <p>⚠️ Error: No hay suficiente espacio en la red base para asignar todas las subredes con el tamaño solicitado.</p>
          <p>Número total de hosts solicitados: ${totalSolicitados}</p>
          <p>Número total de direcciones requeridas (hosts asignados necesarios): ${totalAsignados}</p>
          <p>Rango de la red base: ${intToIp(baseStart)} - ${intToIp(baseEnd)} (prefijo /${prefix})</p>
        </div>
      `;
      return;
    }

    // Porcentaje uso = (hosts asignados / hosts disponibles de la red base) * 100
    const porcentaje = totalDisponibles > 0 ? (totalAsignados / totalDisponibles) * 100 : 0;

    // Construir HTML de resultados:
    // 1) Info de la red base
    let out = `
      <div class="success-box">
        <p>✅ ÉXITO! Se aprovecha el ${porcentaje.toFixed(2)}% del número de hosts disponibles</p>
        <p>Número total de hosts solicitados: ${totalSolicitados}</p>
        <p>Número total de direcciones requeridas: ${totalAsignados}</p>
        <p>Número total de hosts disponibles: ${totalDisponibles}</p>
      </div>

      <table class="result-table" style="margin-top:12px">
        <thead>
          <tr>
            <th>Dirección IP</th>
            <th>Dirección de red</th>
            <th>Máscara de red</th>
            <th>Dirección de Broadcast</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${ipBaseStr}</td>
            <td>${intToIp(baseStart)} /${prefix}</td>
            <td>${prefixToMask(prefix)}</td>
            <td>${intToIp(baseEnd)}</td>
          </tr>
        </tbody>
      </table>
    `;

    // tabla
    const assignedById = assigned.slice().sort((a, b) => a.id - b.id);

    out += `
      <table class="result-table" style="margin-top:14px">
        <thead>
          <tr>
            <th>Subred</th>
            <th>Nº de Hosts</th>
            <th>IP de red</th>
            <th>Máscara</th>
            <th>Primer Host</th>
            <th>Último Host</th>
            <th>Broadcast</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const a of assignedById) {
      out += `<tr>
        <td>Subred ${a.id}</td>
        <td>${a.assignedHosts}</td>
        <td>${intToIp(a.netAddr)} /${a.newPrefix}</td>
        <td>${a.maskStr}</td>
        <td>${intToIp(a.firstHost)}</td>
        <td>${intToIp(a.lastHost)}</td>
        <td>${intToIp(a.broadcast)}</td>
      </tr>`;
    }

    out += `</tbody></table>`;

    
    out += `
      <div class="action-buttons">
    <button class="danger" id="downloadPdfBtn">DESCARGAR</button>
        <button onclick="alert('VER EXPLICACIÓN PASO A PASO (implementable)')">VER EXPLICACIÓN PASO A PASO</button>
        <button onclick="location.reload()">SUBDIVIDIR OTRA RED</button>
      </div>
    `;

    resultDiv.innerHTML = out;


const downloadBtn = document.getElementById("downloadPdfBtn");
if (downloadBtn) {
  downloadBtn.onclick = function () {
    // Usar jsPDF para generar el PDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Extraer solo el contenido de resultados (puedes personalizar esto)
    const text = resultDiv.innerText;

    doc.setFontSize(12);
    doc.text(text, 10, 10, { maxWidth: 180 });

    doc.save("resultado_vlsm.pdf");
  };
}

  });
})();
