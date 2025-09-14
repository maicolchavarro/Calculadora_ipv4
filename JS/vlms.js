// script.js - VLSM corregido (asigna el bloque mínimo y calcula con los hosts asignados)
(function () {
  const ipInput = document.getElementById("ip");
  const prefixInput = document.getElementById("prefix");
  const subnetsInput = document.getElementById("subnets");
  const hostsContainer = document.getElementById("hostsContainer");
  const form = document.getElementById("vlsmForm");
  const resultDiv = document.getElementById("result");

  prefixInput.readOnly = false;
  prefixInput.min = 1;
  prefixInput.max = 30; // /31 y /32 no son útiles para hosts, limitar a /30 como mínimo práctico

  // Detecta clase A/B/C y propone un prefijo por defecto
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

  // Genera dinámicamente filas para hosts por subred
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

  // Prefijo -> máscara string (ej. 255.255.248.0)
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

  // Prefijo -> máscara entera 32-bit unsigned
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

  // IP string -> entero (32-bit unsigned)
  function ipToInt(ip) {
    const parts = ip.split(".").map(p => parseInt(p, 10));
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return NaN;
    return (parts[0] * 2 ** 24 + parts[1] * 2 ** 16 + parts[2] * 2 ** 8 + parts[3]) >>> 0;
  }

  // entero -> IP string
  function intToIp(int) {
    int = int >>> 0;
    return [
      (int >>> 24) & 255,
      (int >>> 16) & 255,
      (int >>> 8) & 255,
      int & 255
    ].join(".");
  }

  // Calcula el prefijo mínimo que soporte 'hostsNecesarios' (redondea hacia arriba)
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

    // Recolectar hosts solicitados (con su id original)
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
    const baseStart = (ipInt & maskInt) >>> 0;               // dirección de red base
    const hostCountBase = 2 ** (32 - prefix);               // direcciones totales en la red base
    const baseEnd = (baseStart + hostCountBase - 1) >>> 0;  // broadcast de la red base
    const totalDisponibles = Math.max(0, hostCountBase - 2); // hosts utilizables en la red base

    // Asignación de bloques (mayores primero)
    let current = baseStart >>> 0;
    const assigned = []; // guardará la asignación para cada request (con id original)
    let overflow = false;

    for (const req of sorted) {
      const newPref = calcularPrefijo(req.hosts);
      const blockSize = 2 ** (32 - newPref);     // direcciones totales en el bloque asignado
      const usableHosts = Math.max(0, blockSize - 2);

      // Si este bloque se sale de la red base => overflow
      if (((current + blockSize - 1) >>> 0) > baseEnd) {
        overflow = true;
        // aun así, lo agregamos para indicar el intento; pero marcaremos error después
      }

      assigned.push({
        id: req.id,
        requested: req.hosts,
        assignedHosts: usableHosts, // hosts útiles en el bloque asignado
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
    // "Número de direcciones requeridas" según te pediste: suma de hosts asignados (útiles)
    const totalAsignados = assigned.reduce((acc, a) => acc + a.assignedHosts, 0);

    // Si overflow -> advertencia y salida
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

    // 2) Tabla con subredes — mostramos en orden del id original (para que Subred 1 sea la que ingresaste 1ª)
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

    // Acción final (descargar/demo, paso a paso y recargar)
    out += `
      <div class="action-buttons">
        <button class="danger" onclick="alert('DESCARGAR: se puede implementar con jsPDF si lo deseas')">DESCARGAR</button>
        <button onclick="alert('VER EXPLICACIÓN PASO A PASO (implementable)')">VER EXPLICACIÓN PASO A PASO</button>
        <button onclick="location.reload()">SUBDIVIDIR OTRA RED</button>
      </div>
    `;

    resultDiv.innerHTML = out;
  });
})();
