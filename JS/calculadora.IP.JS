/* calculadora_ip.js
   Comportamiento:
   - Autocompleta prefijo según clase (A/B/C) salvo que el usuario edite el prefijo.
   - Acepta IP con /prefijo (p. ej. 192.168.0.5/26)
   - Muestra mensaje "Correcto!" o error según la validación.
   - Calcula: máscara, wildcard, red, host, primer/último host, broadcast, hosts asignables y tipo/clase.
*/

let manualPrefijo = false;
const ipInput = document.getElementById('ip');
const prefInput = document.getElementById('prefijo');
const msg = document.getElementById('mensajeEstado');
const btn = document.getElementById('btnCalcular');

ipInput && ipInput.addEventListener('input', setPrefijoAutomatico);
prefInput && prefInput.addEventListener('input', () => { manualPrefijo = true; validateInputs(); });
btn && btn.addEventListener('click', calcularIP);

function setPrefijoAutomatico(){
  const raw = ipInput.value.trim();
  if (!raw) { clearMessage(); return; }

  // Si el usuario escribe "ip/pref", tomar el prefijo y marcar manual
  if (raw.includes('/')) {
    const parts = raw.split('/');
    const prefPart = parseInt(parts[1]);
    if (!isNaN(prefPart)) {
      prefInput.value = prefPart;
      manualPrefijo = true;
    }
  }

  // Determinar primer octeto para autocompletar clase
  const beforeSlash = raw.split('/')[0].trim();
  const octs = beforeSlash.split('.');
  const first = parseInt(octs[0]);
  if (!isNaN(first) && !manualPrefijo) {
    if (first >= 1 && first <= 126) prefInput.value = 8;
    else if (first >= 128 && first <= 191) prefInput.value = 16;
    else if (first >= 192 && first <= 223) prefInput.value = 24;
  }

  validateInputs();
}

function validateInputs(){
  const parsed = parseIpField();
  if (!parsed) {
    setMessage('Dirección IP inválida', 'err');
    return false;
  }
  const { ipParts, pref } = parsed;
  if (isNaN(pref) || pref < 0 || pref > 32) {
    setMessage('Prefijo inválido (0-32)', 'err');
    return false;
  }
  // IP bytes valid?
  if (ipParts.some(o => isNaN(o) || o < 0 || o > 255)) {
    setMessage('Dirección IP inválida', 'err');
    return false;
  }
  setMessage('Correcto!', 'ok');
  return true;
}

function setMessage(text, type){
  msg.textContent = text;
  msg.className = 'msg ' + (type === 'ok' ? 'ok' : 'err');
}
function clearMessage(){ msg.textContent = ''; msg.className = 'msg'; }

/* Devuelve { ipParts: [a,b,c,d], pref } o null */
function parseIpField(){
  const raw = ipInput.value.trim();
  if (!raw) return null;
  let ipStr = raw;
  let pref = parseInt(prefInput.value);
  if (raw.includes('/')) {
    const parts = raw.split('/');
    ipStr = parts[0].trim();
    const p = parseInt(parts[1]);
    if (!isNaN(p)) pref = p;
  }
  const octs = ipStr.split('.');
  if (octs.length !== 4) return null;
  const ipParts = octs.map(o => parseInt(o));
  return { ipParts, pref };
}

/* Utilidades enteras a IP y viceversa (unsigned 32 bits) */
function ipArrayToInt(a){
  return (((a[0] << 24) >>> 0) | (a[1] << 16) | (a[2] << 8) | a[3]) >>> 0;
}
function intToIpArray(n){
  return [ (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255 ];
}
function octetsToString(arr){ return arr.join('.'); }
function toBinary(arr){ return arr.map(o => (o >>> 0).toString(2).padStart(8,'0')).join('.'); }

/* Crear máscara a partir del prefijo */
function maskFromPrefix(pref){
  if (pref === 0) return [0,0,0,0];
  const maskInt = (pref === 32) ? 0xFFFFFFFF >>> 0 : ((0xFFFFFFFF << (32 - pref)) >>> 0);
  return intToIpArray(maskInt);
}

/* Calcular datos y mostrar tabla */
function calcularIP(){
  if (!validateInputs()) return;
  const parsed = parseIpField();
  const ipParts = parsed.ipParts.map(n => parseInt(n));
  const pref = parseInt(parsed.pref);

  const ipInt = ipArrayToInt(ipParts);
  const maskArr = maskFromPrefix(pref);
  const maskInt = ipArrayToInt(maskArr);
  const wildcardInt = (~maskInt) >>> 0;
  const wildcardArr = intToIpArray(wildcardInt);

  const networkInt = (ipInt & maskInt) >>> 0;
  const broadcastInt = (networkInt | wildcardInt) >>> 0;
  const hostInt = (ipInt & wildcardInt) >>> 0;
  const networkArr = intToIpArray(networkInt);
  const broadcastArr = intToIpArray(broadcastInt);
  const hostArr = intToIpArray(hostInt);

  // Hosts asignables (usables)
  let usableHosts;
  if (pref <= 30) usableHosts = Math.pow(2, 32 - pref) - 2;
  else if (pref === 31) usableHosts = 0;
  else usableHosts = 1; // /32

  // Primer / último host (si aplicable)
  let primerHostArr = 'No aplicable', ultimoHostArr = 'No aplicable';
  if (usableHosts >= 1) {
    primerHostArr = intToIpArray((networkInt + 1) >>> 0);
    ultimoHostArr = intToIpArray((broadcastInt - 1) >>> 0);
  } else if (pref === 32) {
    // single address: primer y ultimo = la IP
    primerHostArr = intToIpArray(ipInt);
    ultimoHostArr = intToIpArray(ipInt);
  }

  // Tipo y clase
  const clase = getClase(ipParts[0]);
  const tipo = getTipo(ipParts);

  // Construir HTML resultado
  const titulo = `${octetsToString(ipParts)} /${pref}`;
  const tabla = `
    <div class="result-header">${titulo}</div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Item</th><th>Decimal</th><th>Binario</th></tr>
        </thead>
        <tbody>
          <tr><td>Dirección IPv4</td><td>${octetsToString(ipParts)}</td><td>${toBinary(ipParts)}</td></tr>
          <tr><td>Máscara de red</td><td>${octetsToString(maskArr)}</td><td>${toBinary(maskArr)}</td></tr>
          <tr><td>Máscara Wildcard</td><td>${octetsToString(wildcardArr)}</td><td>${toBinary(wildcardArr)}</td></tr>
          <tr><td>Dirección de red</td><td>${octetsToString(networkArr)}</td><td>${toBinary(networkArr)}</td></tr>
          <tr><td>Dirección de host</td><td>${Array.isArray(hostArr)? octetsToString(hostArr) : hostArr}</td><td>${Array.isArray(hostArr)? toBinary(hostArr) : '-'}</td></tr>
          <tr><td>Dirección del primer host</td><td>${Array.isArray(primerHostArr)? octetsToString(primerHostArr): primerHostArr}</td><td>${Array.isArray(primerHostArr)? toBinary(primerHostArr): '-'}</td></tr>
          <tr><td>Dirección del último host</td><td>${Array.isArray(ultimoHostArr)? octetsToString(ultimoHostArr): ultimoHostArr}</td><td>${Array.isArray(ultimoHostArr)? toBinary(ultimoHostArr): '-'}</td></tr>
          <tr><td>Dirección de difusión</td><td>${octetsToString(broadcastArr)}</td><td>${toBinary(broadcastArr)}</td></tr>
          <tr><td>Número de direcciones asignables</td><td colspan="2">${usableHosts}</td></tr>
          <tr><td>Tipo de dirección IPv4</td><td colspan="2" class="tipo">${tipo}, Clase ${clase}</td></tr>
        </tbody>
      </table>
    </div>

    <button class="reload-btn" onclick="location.reload()">Calcular otra IP</button>
  `;

  document.getElementById('resultado').innerHTML = tabla;
}

/* Determina si es privada o pública */
function getTipo(octets){
  const a = octets[0], b = octets[1];
  if (a === 10) return 'IP privada';
  if (a === 172 && b >= 16 && b <= 31) return 'IP privada';
  if (a === 192 && b === 168) return 'IP privada';
  if (a === 127) return 'Loopback';
  return 'IP pública';
}

/* Determina clase (A/B/C etc). Si no está en A-C devuelve etiqueta apropiada */
function getClase(firstOctet){
  if (firstOctet >=1 && firstOctet <=126) return 'A';
  if (firstOctet >=128 && firstOctet <=191) return 'B';
  if (firstOctet >=192 && firstOctet <=223) return 'C';
  if (firstOctet >=224 && firstOctet <=239) return 'D';
  if (firstOctet >=240 && firstOctet <=254) return 'E';
  return 'N/A';
}
