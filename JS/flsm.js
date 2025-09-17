(function () {
  const ipInput = document.getElementById("ip");
  const prefixInput = document.getElementById("prefix");
  const subnetsInput = document.getElementById("subnets");
  const hostsInput = document.getElementById("hostsPerSubnet");
  const form = document.getElementById("flsmForm");
  const resultDiv = document.getElementById("result");

  // Funciones auxiliares
  function ipToInt(ip) {
    const parts = ip.split(".").map(p => parseInt(p, 10));
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return NaN;
    return (parts[0] * 2 ** 24 + parts[1] * 2 ** 16 + parts[2] * 2 ** 8 + parts[3]) >>> 0;
  }

  function intToIp(int) {
    int = int >>> 0;
    return [
      (int >>> 24) & 255,
      (int >>> 16) & 255,
      (int >>> 8) & 255,
      int & 255
    ].join(".");
  }

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

  // Autocompletar prefijo según clase
  ipInput.addEventListener("input", function () {
    const parts = this.value.split(".");
    if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
      const first = parseInt(parts[0], 10);
      if (first >= 1 && first <= 126) prefixInput.value = 8;
      else if (first >= 128 && first <= 191) prefixInput.value = 16;
      else if (first >= 192 && first <= 223) prefixInput.value = 24;
      else prefixInput.value = "";
    }
  });

  // Sincronización subredes ↔ hosts
  subnetsInput.addEventListener("input", function () {
    const subnets = parseInt(this.value, 10);
    const prefix = parseInt(prefixInput.value, 10);
    if (!isNaN(subnets) && !isNaN(prefix)) {
      const bitsForSubnets = Math.ceil(Math.log2(subnets));
      const newPrefix = prefix + bitsForSubnets;
      if (newPrefix <= 30) {
        const blockSize = 2 ** (32 - newPrefix);
        hostsInput.value = Math.max(0, blockSize - 2);
      }
    }
  });

  hostsInput.addEventListener("input", function () {
    const hosts = parseInt(this.value, 10);
    const prefix = parseInt(prefixInput.value, 10);
    if (!isNaN(hosts) && !isNaN(prefix)) {
      let bits = 0;
      while ((2 ** bits - 2) < hosts) bits++;
      const newPrefix = 32 - bits;
      if (newPrefix >= prefix) {
        const subnets = 2 ** (newPrefix - prefix);
        subnetsInput.value = subnets;
      }
    }
  });

form.addEventListener("submit", function (e) {
  e.preventDefault();
  resultDiv.innerHTML = "";

  const ipBaseStr = ipInput.value.trim();
  const prefix = parseInt(prefixInput.value, 10);
  const subnetsNeeded = parseInt(subnetsInput.value, 10);

  const ipInt = ipToInt(ipBaseStr);
  if (isNaN(ipInt)) {
    resultDiv.innerHTML = `<div class="success-box" style="border-left-color:#d9534f;background:#fdecea;color:#a94442">Error: IP inválida.</div>`;
    return;
  }
  if (isNaN(prefix) || prefix < 1 || prefix > 30) {
    resultDiv.innerHTML = `<div class="success-box" style="border-left-color:#d9534f;background:#fdecea;color:#a94442">Error: Prefijo inválido (1-30).</div>`;
    return;
  }
  if (isNaN(subnetsNeeded) || subnetsNeeded < 1) {
    resultDiv.innerHTML = `<div class="success-box" style="border-left-color:#d9534f;background:#fdecea;color:#a94442">Error: Número de subredes inválido.</div>`;
    return;
  }

  // Calcular bits necesarios
  const bitsForSubnets = Math.ceil(Math.log2(subnetsNeeded));
  const newPrefix = prefix + bitsForSubnets;
  if (newPrefix > 30) {
    resultDiv.innerHTML = `<div class="success-box" style="border-left-color:#d9534f;background:#fdecea;color:#a94442">Error: No es posible dividir en ${subnetsNeeded} subredes.</div>`;
    return;
  }

  const blockSize = 2 ** (32 - newPrefix);
  const usableHosts = Math.max(0, blockSize - 2);
  const maskStr = prefixToMask(newPrefix);

  let out = `
    <div class="success-box">
      <p>✅ ÉXITO! Se han creado ${subnetsNeeded} subred(es) con prefijo /${newPrefix}.</p>
      <p>Hosts por subred: ${usableHosts}</p>
      <p>Máscara de subred: ${maskStr}</p>
    </div>
  `;

  // Tabla de resultados
  out += `
    <table class="result-table" style="margin-top:12px">
      <thead>
        <tr>
          <th>Subred</th>
          <th>IP de red</th>
          <th>Máscara</th>
          <th>Primer Host</th>
          <th>Último Host</th>
          <th>Broadcast</th>
        </tr>
      </thead>
      <tbody>
  `;

  const baseStart = ipInt & ((0xFFFFFFFF << (32 - prefix)) >>> 0);
  for (let i = 0; i < subnetsNeeded; i++) {
    const netAddr = baseStart + i * blockSize;
    const firstHost = netAddr + 1;
    const lastHost = netAddr + blockSize - 2;
    const broadcast = netAddr + blockSize - 1;

    out += `<tr>
      <td>Subred ${i + 1}</td>
      <td>${intToIp(netAddr)} /${newPrefix}</td>
      <td>${maskStr}</td>
      <td>${intToIp(firstHost)}</td>
      <td>${intToIp(lastHost)}</td>
      <td>${intToIp(broadcast)}</td>
    </tr>`;
  }

  out += `</tbody></table>`;

  // Botones
  out += `
    <div class="action-buttons">
      <button class="danger" id="downloadPdfBtn">DESCARGAR PDF</button>
      <button type="button" id="toggleExplanation">📖 Ver explicación paso a paso</button>
      <button onclick="location.reload()">SUBDIVIDIR OTRA RED</button>
    </div>
  `;

  // Paso a paso oculto
  out += `
    <div id="explanationBox" style="display:none;margin-top:15px" class="success-box">
      <h4>Explicación paso a paso</h4>
      <p>1️⃣ Se parte de la red base con prefijo inicial /${prefix}.</p>
      <p>2️⃣ El usuario solicitó ${subnetsNeeded} subred(es).</p>
      <p>3️⃣ Para poder obtener al menos esa cantidad, se necesitan ${bitsForSubnets} bits adicionales (2^${bitsForSubnets} = ${2 ** bitsForSubnets}).</p>
      <p>4️⃣ El nuevo prefijo es /${newPrefix}, lo que equivale a la máscara ${maskStr}.</p>
      <p>5️⃣ Cada subred tendrá ${blockSize} direcciones en total.</p>
      <p>6️⃣ De esas, ${usableHosts} son hosts utilizables (quitando red y broadcast).</p>
      <p>7️⃣ Finalmente, se listan todas las subredes generadas en la tabla anterior.</p>
    </div>
  `;

  resultDiv.innerHTML = out;

  // Botón desplegable
  document.getElementById("toggleExplanation").onclick = function () {
    const box = document.getElementById("explanationBox");
    box.style.display = (box.style.display === "none") ? "block" : "none";
  };

  // PDF export (solo resumen + tabla, sin paso a paso)
  const downloadBtn = document.getElementById("downloadPdfBtn");
  if (downloadBtn) {
    downloadBtn.onclick = function () {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();

      // Título
      doc.setFontSize(16);
      doc.setTextColor(40, 80, 40);
      doc.text("Resultado de Subnetting FLSM", 14, 18);

      // Resumen
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(`Red base: ${ipBaseStr} /${prefix}`, 14, 28);
      doc.text(`Subredes solicitadas: ${subnetsNeeded}`, 14, 36);
      doc.text(`Nuevo prefijo: /${newPrefix}`, 14, 44);
      doc.text(`Máscara: ${maskStr}`, 14, 52);
      doc.text(`Hosts por subred: ${usableHosts}`, 14, 60);

      // Tabla de subredes
      const rows = [];
      for (let i = 0; i < subnetsNeeded; i++) {
        const netAddr = baseStart + i * blockSize;
        const firstHost = netAddr + 1;
        const lastHost = netAddr + blockSize - 2;
        const broadcast = netAddr + blockSize - 1;

        rows.push([
          `Subred ${i + 1}`,
          `${intToIp(netAddr)} /${newPrefix}`,
          maskStr,
          intToIp(firstHost),
          intToIp(lastHost),
          intToIp(broadcast),
        ]);
      }

      doc.autoTable({
        startY: 70,
        head: [["Subred", "IP de red", "Máscara", "Primer Host", "Último Host", "Broadcast"]],
        body: rows,
        theme: "grid",
        styles: { fontSize: 10 },
        headStyles: { fillColor: [20, 120, 60], textColor: 255 },
        alternateRowStyles: { fillColor: [230, 240, 230] }
      });

      doc.save("resultado_flsm.pdf");
    };
  }
});
})();
