const supabaseUrl = 'https://buqsbkloueboxhrnxvkv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1cXNia2xvdWVib3hocm54dmt2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MDQ4NzgsImV4cCI6MjA4NzA4MDg3OH0.b5gkFFHRy_fXZXc6gECx7R7bDQQoclaPhXhgeN01Iec';
const db = supabase.createClient(supabaseUrl, supabaseKey);

let currentEmployee = null;
let uploadedFile = null;
let carUploadedFile = null;
let invoiceUploadedFile = null;

function formatMoney(n) {
  return Number(n).toLocaleString('fr-FR');
}

/* ============================================
   LOGIN
============================================ */
async function login() {
  const code = document.getElementById('codeInput').value.trim();
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';

  if (code.length !== 10) {
    errEl.style.display = 'block';
    return;
  }

  const { data, error } = await db
    .from('employees')
    .select('*')
    .eq('code', code)
    .single();

  if (error || !data) {
    errEl.style.display = 'block';
    return;
  }

  currentEmployee = data;
  document.getElementById('pageLogin').style.display = 'none';

  if (data.role === 'patron' || data.role === 'co_patron') {
    showPatronPage(data);
  } else {
    showEmployeePage(data);
  }
}

/* ============================================
   LOGOUT
============================================ */
function logout() {
  currentEmployee = null;
  uploadedFile = null;
  carUploadedFile = null;
  invoiceUploadedFile = null;
  document.getElementById('pageLogin').style.display = 'flex';
  document.getElementById('pageEmployee').style.display = 'none';
  document.getElementById('pagePatron').style.display = 'none';
  document.getElementById('codeInput').value = '';
}

/* ============================================
   PAGE EMPLOYÉ
============================================ */
async function showEmployeePage(emp) {
  document.getElementById('pageEmployee').style.display = 'block';
  document.getElementById('empNom').textContent = `${emp.prenom} ${emp.nom}`;
  document.getElementById('empRoleBadge').textContent = emp.role;
  document.getElementById('empCode').textContent = `Code : ${emp.code}`;

  const gradeBadge = document.getElementById('empGradeBadge');
  gradeBadge.textContent = emp.grade;
  gradeBadge.className = `badge badge-grade-${emp.grade}`;

  await refreshEmployeeStats();
  loadHistory();
  loadPrimesHistory();
  loadAvailableCars();
}

async function refreshEmployeeStats() {
  const stats = await loadEmployeeStats(currentEmployee.id);
  document.getElementById('statArgent').textContent = `$${formatMoney(stats.totalArgent)}`;
  document.getElementById('statItems').textContent = formatMoney(stats.totalItems);
  document.getElementById('statPrimes').textContent = `$${formatMoney(stats.totalPrimes)}`;
}

/* ============================================
   CALCUL TEMPS RÉEL
============================================ */
function updateItemsCalc() {
  const items = parseInt(document.getElementById('itemsInput').value) || 0;
  const prixParItem = 120;
  const total = items * prixParItem;
  const calcEl = document.getElementById('calcResult');
  const primeEl = document.getElementById('primeResult');

  if (items <= 0) {
    calcEl.textContent = 'Entrez un nombre d\'items...';
    calcEl.className = 'calc-total';
    primeEl.textContent = '';
    primeEl.className = '';
    return;
  }

  calcEl.textContent = `${items} items × $120 = $${formatMoney(total)}`;
  calcEl.className = 'calc-total';

  if (currentEmployee) {
    const grade = currentEmployee.grade;
    const taux = grade === 'debutant' ? 0.20 : grade === 'intermediaire' ? 0.25 : 0.30;
    const paliers = Math.floor(items / 1200);

    if (paliers > 0) {
      const prime = Math.floor(total * taux);
      primeEl.textContent = `🏆 Prime (${taux * 100}%) : $${formatMoney(prime)}`;
      primeEl.className = 'calc-prime';
    } else {
      const restant = 1200 - items;
      primeEl.textContent = `⚠️ Il manque ${restant} items pour une prime`;
      primeEl.className = 'calc-warning';
    }
  }
}

/* ============================================
   PREVIEW PHOTO
============================================ */
function previewPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  uploadedFile = file;
  document.getElementById('upload-text').textContent = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('photoPreview');
    preview.src = e.target.result;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

/* ============================================
   SOUMETTRE VENTE
============================================ */
async function submitVente() {
  const items = parseInt(document.getElementById('itemsInput').value) || 0;
  const msgOk = document.getElementById('venteMsg');
  const msgErr = document.getElementById('venteMsgErr');
  msgOk.style.display = 'none';
  msgErr.style.display = 'none';

  if (items <= 0) {
    msgErr.textContent = '❌ Entrez un nombre d\'items valide';
    msgErr.style.display = 'block';
    return;
  }

  const prixParItem = 120;
  const total = items * prixParItem;
  const grade = currentEmployee.grade;
  const taux = grade === 'debutant' ? 0.20 : grade === 'intermediaire' ? 0.25 : 0.30;

  let photoUrl = null;
  if (uploadedFile) {
    const fileName = `${currentEmployee.id}_${Date.now()}_${uploadedFile.name}`;
    const { data: uploadData, error: uploadError } = await db.storage
      .from('photos')
      .upload(fileName, uploadedFile);
    if (!uploadError && uploadData) {
      const { data: urlData } = db.storage.from('photos').getPublicUrl(fileName);
      photoUrl = urlData?.publicUrl || null;
    }
  }

  const { error: venteError } = await db.from('ventes').insert({
    employee_id: currentEmployee.id,
    items_count: items,
    total_argent: total,
    photo_url: photoUrl
  });

  if (venteError) {
    msgErr.textContent = '❌ Erreur lors de l\'enregistrement';
    msgErr.style.display = 'block';
    return;
  }

  const paliers = Math.floor(items / 1200);
  let totalPrime = 0;

  if (paliers > 0) {
    totalPrime = Math.floor(total * taux);
    await db.from('primes').insert({
      employee_id: currentEmployee.id,
      items_count: items,
      total_vente: total,
      prime_montant: totalPrime,
      grade: grade
    });
  }

  msgOk.textContent = `✅ Vente enregistrée !${totalPrime > 0 ? ` Prime obtenue : $${formatMoney(totalPrime)} 🎉` : ''}`;
  msgOk.style.display = 'block';

  // RESET formulaire
  document.getElementById('itemsInput').value = '';
  document.getElementById('photoPreview').style.display = 'none';
  document.getElementById('photoPreview').src = '';
  document.getElementById('photoFile').value = '';
  document.getElementById('upload-text').textContent = 'Glisse une photo ou clique pour choisir';
  document.getElementById('calcResult').textContent = 'Entrez un nombre d\'items...';
  document.getElementById('primeResult').textContent = '';
  uploadedFile = null;

  await refreshEmployeeStats();
  loadHistory();
  loadPrimesHistory();

  setTimeout(() => { msgOk.style.display = 'none'; }, 5000);
}

/* ============================================
   STATS EMPLOYÉ
============================================ */
async function loadEmployeeStats(employeeId) {
  const { data: ventes } = await db
    .from('ventes')
    .select('items_count, total_argent')
    .eq('employee_id', employeeId)
    .is('reset_at', null);

  const { data: primes } = await db
    .from('primes')
    .select('prime_montant')
    .eq('employee_id', employeeId);

  const totalItems = (ventes || []).reduce((s, v) => s + v.items_count, 0);
  const totalArgent = (ventes || []).reduce((s, v) => s + v.total_argent, 0);
  const totalPrimes = (primes || []).reduce((s, p) => s + p.prime_montant, 0);

  return { totalItems, totalArgent, totalPrimes };
}

/* ============================================
   HISTORIQUE VENTES
============================================ */
async function loadHistory() {
  const div = document.getElementById('historyContent');
  const { data } = await db
    .from('ventes')
    .select('*')
    .eq('employee_id', currentEmployee.id)
    .is('reset_at', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!data || data.length === 0) {
    div.innerHTML = '<p class="no-data">Aucune vente enregistrée</p>';
    return;
  }

  let totalItems = 0;
  let totalArgent = 0;
  let html = `<table class="history-table">
    <thead><tr>
      <th>Date</th><th>Items</th><th>Total</th><th>Photo</th>
    </tr></thead><tbody>`;

  for (const v of data) {
    totalItems += v.items_count;
    totalArgent += v.total_argent;
    const date = new Date(v.created_at).toLocaleString('fr-FR');
    const photoCell = v.photo_url
      ? `<td><img src="${v.photo_url}" alt="bucket"/><br/><small>${v.items_count} items</small></td>`
      : '<td><span style="color:#555">Pas de photo</span></td>';
    html += `<tr>
      <td>${date}</td>
      <td>${v.items_count}</td>
      <td class="td-money">$${formatMoney(v.total_argent)}</td>
      ${photoCell}
    </tr>`;
  }

  html += `</tbody></table>
  <div class="total-line">
    <span>Total</span>
    <span>$${formatMoney(totalArgent)}</span>
  </div>`;
  div.innerHTML = html;
}

/* ============================================
   HISTORIQUE PRIMES
============================================ */
async function loadPrimesHistory() {
  const div = document.getElementById('primesContent');
  const { data } = await db
    .from('primes')
    .select('*')
    .eq('employee_id', currentEmployee.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!data || data.length === 0) {
    div.innerHTML = '<p class="no-data">Aucune prime enregistrée</p>';
    return;
  }

  let totalPrimes = 0;
  let html = `<table class="history-table">
    <thead><tr>
      <th>Date</th><th>Items</th><th>Vente</th><th>Prime</th><th>Grade</th>
    </tr></thead><tbody>`;

  for (const p of data) {
    totalPrimes += p.prime_montant;
    const date = new Date(p.created_at).toLocaleString('fr-FR');
    html += `<tr>
      <td>${date}</td>
      <td>${p.items_count}</td>
      <td class="td-money">$${formatMoney(p.total_vente)}</td>
      <td class="td-prime">$${formatMoney(p.prime_montant)}</td>
      <td>${p.grade}</td>
    </tr>`;
  }

  html += `</tbody></table>
  <div class="total-line">
    <span>Total primes</span>
    <span>$${formatMoney(totalPrimes)}</span>
  </div>`;
  div.innerHTML = html;
}

/* ============================================
   VOITURES DISPONIBLES
============================================ */
async function loadAvailableCars() {
  const div = document.getElementById('availableCars');
  const { data: cars, error } = await db
    .from('cars')
    .select('*')
    .eq('employee_id', currentEmployee.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erreur lors du chargement des voitures:', error);
    div.innerHTML = '<p class="no-data">Erreur lors du chargement des voitures</p>';
    return;
  }

  if (!cars || cars.length === 0) {
    div.innerHTML = '<p class="no-data">Aucune voiture disponible</p>';
    return;
  }

  let html = '<div class="cars-grid">';
  for (const car of cars) {
    html += `
      <div class="car-card">
        <div class="car-image" style="background-image: url('${car.image_url || 'default-car-image.jpg'}')"></div>
        <div class="car-info">
          <h4>${car.model}</h4>
          <p>Marque: ${car.brand}</p>
          <p>Couleur: ${car.color}</p>
          <p>Plaque: ${car.license_plate}</p>
        </div>
      </div>
    `;
  }
  html += '</div>';
  div.innerHTML = html;
}


/* ============================================
   PAGE PATRON
============================================ */
async function showPatronPage(emp) {
  document.getElementById('pagePatron').style.display = 'block';
  document.getElementById('patronNom').textContent = `👑 ${emp.prenom} ${emp.nom}`;
  document.getElementById('patronRoleBadge').textContent = emp.role.replace('_', ' ');

  await loadGlobalStats();
  await loadAllEmployees();
  await loadAllVentes();
  await loadResetSelect();
  await loadExportSelect();
  await loadCarEmployeeSelect();
  await loadEmployeeSelect();
  await loadInvoiceHistory();
}

/* ============================================
   STATS GLOBALES PATRON
============================================ */
/* ============================================
   STATISTIQUES GLOBALES COMBINÉES (VENTES + FACTURES + PRIMES)
============================================ */
async function loadGlobalStats() {
  console.log("Chargement des statistiques globales...");

  try {
    // Charger les données nécessaires
    const data = await loadGlobalStatsData();

    // Calculer les totaux
    const totals = calculateGlobalStatsTotals(data);

    // Afficher les statistiques globales
    displayGlobalStats(totals);

    console.log("✅ Chargement des statistiques globales terminé.");
  } catch (error) {
    console.error('Erreur lors du chargement des statistiques globales:', error);
  }
}

async function loadGlobalStatsData() {
  const [
    invoicesPromise,
    facturesPromise,
    ventesPromise,
    primesPromise
  ] = await Promise.all([
    db.from('invoices').select('amount'),
    db.from('factures').select('amount'),
    db.from('ventes').select('total_argent, items_count').is('reset_at', null),
    db.from('primes').select('prime_montant')
  ]);

  return {
    invoicesData: invoicesPromise.data,
    invoicesError: invoicesPromise.error,
    facturesData: facturesPromise.data,
    facturesError: facturesPromise.error,
    ventesData: ventesPromise.data,
    ventesError: ventesPromise.error,
    primesData: primesPromise.data,
    primesError: primesPromise.error
  };
}

function calculateGlobalStatsTotals(data) {
  const {
    invoicesData,
    invoicesError,
    facturesData,
    facturesError,
    ventesData,
    ventesError,
    primesData,
    primesError
  } = data;

  let totalInvoicesAmount = 0;
  let totalFacturesAmount = 0;
  let totalVentesAmount = 0;
  let totalVentesItems = 0;
  let totalPrimesAReverser = 0;

  // Calculer le total des invoices
  if (invoicesError) {
    console.error('Erreur chargement invoices:', invoicesError);
  } else if (invoicesData) {
    totalInvoicesAmount = invoicesData.reduce((sum, invoice) => {
      return sum + (parseFloat(invoice.amount) || 0);
    }, 0);
  }

  // Calculer le total des factures
  if (facturesError) {
    console.error('Erreur chargement factures:', facturesError);
  } else if (facturesData) {
    totalFacturesAmount = facturesData.reduce((sum, facture) => {
      return sum + (parseFloat(facture.amount) || 0);
    }, 0);
  }

  // Calculer le total des ventes
  if (ventesError) {
    console.error('Erreur chargement ventes:', ventesError);
  } else if (ventesData) {
    totalVentesAmount = ventesData.reduce((sum, vente) => {
      return sum + (parseFloat(vente.total_argent) || 0);
    }, 0);

    totalVentesItems = ventesData.reduce((sum, vente) => {
      return sum + (parseInt(vente.items_count) || 0);
    }, 0);
  }

  // Calculer le total des primes
  if (primesError) {
    console.error('Erreur chargement primes:', primesError);
  } else if (primesData) {
    totalPrimesAReverser = primesData.reduce((sum, prime) => {
      return sum + (parseFloat(prime.prime_montant) || 0);
    }, 0);
  }

  // Calculer le chiffre d'affaires global
  const globalTotalRevenue = totalInvoicesAmount +  totalVentesAmount-totalFacturesAmount;

  return {
    totalInvoicesAmount,
    totalFacturesAmount,
    totalVentesAmount,
    totalVentesItems,
    totalPrimesAReverser,
    globalTotalRevenue
  };
}

function displayGlobalStats(totals) {
  const {
    totalInvoicesAmount,
    totalFacturesAmount,
    totalVentesAmount,
    totalVentesItems,
    totalPrimesAReverser,
    globalTotalRevenue
  } = totals;

  console.log("Invoices:", totalInvoicesAmount);
  console.log("Factures:", totalFacturesAmount);
  console.log("Ventes:", totalVentesAmount);
  console.log("CA Total:", globalTotalRevenue);

  // Afficher le chiffre d'affaires global
  const globalCAElement = document.getElementById('globalCA');
  if (globalCAElement) {
    globalCAElement.textContent = formatMoney(globalTotalRevenue);
    globalCAElement.style.color = '#00ff33';
    globalCAElement.parentElement.style.display = 'block';
  }

  // Afficher le total des items
  const globalItemsElement = document.getElementById('globalItems');
  if (globalItemsElement) {
    globalItemsElement.textContent = formatNumber(totalVentesItems);
    globalItemsElement.style.color = '#ffffff';
    globalItemsElement.parentElement.style.display = 'block';
  }

  // Afficher le total des factures
  const totalFacturesElement = document.getElementById('totalFacturesAmount');
  if (totalFacturesElement) {
    totalFacturesElement.textContent = formatMoney(totalFacturesAmount);
    totalFacturesElement.style.color = '#ec0c00';
    totalFacturesElement.parentElement.style.display = 'block';
  }

  // Afficher le total des primes
  const globalPrimesElement = document.getElementById('globalPrimes');
  if (globalPrimesElement) {
    globalPrimesElement.textContent = formatMoney(totalPrimesAReverser);
    globalPrimesElement.style.color = '#c8a84b';
    globalPrimesElement.parentElement.style.display = 'block';
  }
}

// Fonctions de formatage
function formatMoney(amount) {
  if (isNaN(amount)) return '$0';
  return `$${amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`;
}

function formatNumber(num) {
  if (isNaN(num)) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
/* ============================================
   CHARGEMENT DU SÉLECTEUR D'EMPLOYÉS POUR DIVIDENDES
============================================ */
async function loadDividendEmployeeSelect() {
  const sel = document.getElementById('dividendEmployeeSelect');
  const { data: employees } = await db.from('employees').select('*').order('nom');

  sel.innerHTML = '<option value="">-- Tous les employés --</option>';

  for (const emp of (employees || [])) {
    const opt = document.createElement('option');
    opt.value = emp.id;
    opt.textContent = `${emp.prenom} ${emp.nom} (${emp.role})`;
    sel.appendChild(opt);
  }
}

/* ============================================
   REVERSEMENT DE DIVIDENDES
============================================ */
async function reverseDividends() {
  const employeeId = document.getElementById('dividendEmployeeSelect').value;
  const amount = parseFloat(document.getElementById('dividendAmount').value) || 0;
  const description = document.getElementById('dividendDescription').value.trim();

  const msgOk = document.getElementById('dividendMsg');
  const msgErr = document.getElementById('dividendMsgErr');
  msgOk.style.display = 'none';
  msgErr.style.display = 'none';

  // Validation des champs
  if (amount <= 0) {
    msgErr.textContent = '❌ Veuillez entrer un montant valide';
    msgErr.style.display = 'block';
    return;
  }

  if (!description) {
    msgErr.textContent = '❌ Veuillez entrer une description';
    msgErr.style.display = 'block';
    return;
  }

  try {
    // Si un employé spécifique est sélectionné, vérifier son solde
    if (employeeId) {
      const { data: employee, error: employeeError } = await db
        .from('employees')
        .select('*')
        .eq('id', employeeId)
        .single();

      if (employeeError) throw employeeError;

      if (employee.account_balance < amount) {
        msgErr.textContent = '❌ Solde insuffisant pour reverser ce montant';
        msgErr.style.display = 'block';
        return;
      }

      // Mettre à jour le solde de l'employé
      const { data: updateEmployee, error: updateError } = await db
        .from('employees')
        .update({ account_balance: employee.account_balance - amount })
        .eq('id', employeeId)
        .select()
        .single();

      if (updateError) throw updateError;
    } else {
      // Si aucun employé spécifique n'est sélectionné, vérifier le solde du patron
      const { data: patron, error: patronError } = await db
        .from('employees')
        .select('*')
        .eq('id', currentEmployee.id)
        .single();

      if (patronError) throw patronError;

      if (patron.account_balance < amount) {
        msgErr.textContent = '❌ Solde insuffisant pour reverser ce montant';
        msgErr.style.display = 'block';
        return;
      }

      // Mettre à jour le solde du patron
      const { data: updatePatron, error: updateError } = await db
        .from('employees')
        .update({ account_balance: patron.account_balance - amount })
        .eq('id', currentEmployee.id)
        .select()
        .single();

      if (updateError) throw updateError;
    }

    // Créer l'enregistrement des dividendes
    const { data: dividend, error: dividendError } = await db
      .from('dividendes')
      .insert({
        amount,
        description,
        created_by: currentEmployee.id,
        employee_id: employeeId || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (dividendError) throw dividendError;

    // Réinitialiser les champs
    document.getElementById('dividendAmount').value = '';
    document.getElementById('dividendDescription').value = '';
    document.getElementById('dividendEmployeeSelect').value = '';

    msgOk.textContent = `✅ Dividendes de $${formatMoney(amount)} reversés avec succès`;
    msgOk.style.display = 'block';

    // Rafraîchir l'historique des dividendes
    await loadDividendHistory();
    await loadGlobalStats();
  } catch (error) {
    console.error('Erreur lors du reversement des dividendes:', error);
    msgErr.textContent = `❌ Erreur lors du reversement des dividendes: ${error.message}`;
    msgErr.style.display = 'block';
  }
}

/* ============================================
   CHARGEMENT DE L'HISTORIQUE DES DIVIDENDES
============================================ */
async function loadDividendHistory() {
  const div = document.getElementById('dividendHistory');

  const { data: dividends, error } = await db
    .from('dividendes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erreur lors du chargement des dividendes:', error);
    div.innerHTML = '<p class="no-data">Erreur lors du chargement des dividendes</p>';
    return;
  }

  if (!dividends || dividends.length === 0) {
    div.innerHTML = '<p class="no-data">Aucun dividende reversé</p>';
    return;
  }

  let html = '<table class="dividend-table"><thead><tr><th>Date</th><th>Description</th><th>Montant</th></tr></thead><tbody>';

  for (const dividend of dividends) {
    const date = new Date(dividend.created_at).toLocaleString('fr-FR');

    html += `
      <tr>
        <td>${date}</td>
        <td>${dividend.description}</td>
        <td class="td-money">$${formatMoney(dividend.amount)}</td>
      </tr>
    `;
  }

  html += '</tbody></table>';
  div.innerHTML = html;
}

/* ============================================
   CHARGEMENT DES STATISTIQUES GLOBALES
============================================ */
async function loadGlobalStats() {
  await loadGlobalStatsData().then(calculateGlobalStatsTotals);
}

/* ============================================
   CALCUL DES STATISTIQUES GLOBALES
============================================ */
function calculateGlobalStatsTotals(data) {
  const {
    invoicesData,
    invoicesError,
    facturesData,
    facturesError,
    ventesData,
    ventesError,
    primesData,
    primesError,
    dividendesData,
    dividendesError
  } = data;

  let totalInvoicesAmount = 0;
  let totalFacturesAmount = 0;
  let totalVentesAmount = 0;
  let totalVentesItems = 0;
  let totalPrimesAReverser = 0;
  let totalDividendes = 0;

  // Calculer le total des invoices
  if (invoicesError) {
    console.error('Erreur chargement invoices:', invoicesError);
  } else if (invoicesData) {
    totalInvoicesAmount = invoicesData.reduce((sum, invoice) => {
      return sum + (parseFloat(invoice.amount) || 0);
    }, 0);
  }

  // Calculer le total des factures
  if (facturesError) {
    console.error('Erreur chargement factures:', facturesError);
  } else if (facturesData) {
    totalFacturesAmount = facturesData.reduce((sum, facture) => {
      return sum + (parseFloat(facture.amount) || 0);
    }, 0);
  }

  // Calculer le total des ventes
  if (ventesError) {
    console.error('Erreur chargement ventes:', ventesError);
  } else if (ventesData) {
    totalVentesAmount = ventesData.reduce((sum, vente) => {
      return sum + (parseFloat(vente.total_argent) || 0);
    }, 0);
    totalVentesItems = ventesData.reduce((sum, vente) => {
      return sum + (parseInt(vente.items_count) || 0);
    }, 0);
  }

  // Calculer le total des primes
  if (primesError) {
    console.error('Erreur chargement primes:', primesError);
  } else if (primesData) {
    totalPrimesAReverser = primesData.reduce((sum, prime) => {
      return sum + (parseFloat(prime.prime_montant) || 0);
    }, 0);
  }

  // Calculer le total des dividendes
  if (dividendesError) {
    console.error('Erreur chargement dividendes:', dividendesError);
  } else if (dividendesData) {
    totalDividendes = dividendesData.reduce((sum, dividende) => {
      return sum + (parseFloat(dividende.amount) || 0);
    }, 0);
  }

  // Calculer le chiffre d'affaires total
  const globalTotalRevenue = totalVentesAmount - totalFacturesAmount - totalPrimesAReverser - totalDividendes;

  console.log("Invoices:", totalInvoicesAmount);
  console.log("Factures:", totalFacturesAmount);
  console.log("Ventes:", totalVentesAmount);
  console.log("CA Total:", globalTotalRevenue);
  console.log("Dividendes:", totalDividendes);

  // Afficher le chiffre d'affaires global
  const globalCAElement = document.getElementById('globalCA');
  if (globalCAElement) {
    globalCAElement.textContent = formatMoney(globalTotalRevenue);
    globalCAElement.style.color = '#00ff33';
    globalCAElement.parentElement.style.display = 'block';
  }

  // Afficher le total des items
  const globalItemsElement = document.getElementById('globalItems');
  if (globalItemsElement) {
    globalItemsElement.textContent = formatNumber(totalVentesItems);
    globalItemsElement.style.color = '#ffffff';
    globalItemsElement.parentElement.style.display = 'block';
  }

  // Afficher le total des factures
  const totalFacturesElement = document.getElementById('totalFacturesAmount');
  if (totalFacturesElement) {
    totalFacturesElement.textContent = formatMoney(totalFacturesAmount);
    totalFacturesElement.style.color = '#4CAF50';
    totalFacturesElement.parentElement.style.display = 'block';
  }

  // Afficher le total des primes
  const globalPrimesElement = document.getElementById('globalPrimes');
  if (globalPrimesElement) {
    globalPrimesElement.textContent = formatMoney(totalPrimesAReverser);
    globalPrimesElement.style.color = '#c8a84b';
    globalPrimesElement.parentElement.style.display = 'block';
  }

  // Afficher le total des dividendes
  const globalDividendesElement = document.getElementById('globalDividendes');
  if (globalDividendesElement) {
    globalDividendesElement.textContent = formatMoney(totalDividendes);
    globalDividendesElement.style.color = '#ff0000';
    globalDividendesElement.parentElement.style.display = 'block';
  }
}

/* ============================================
   CHARGEMENT DES DONNÉES DES STATISTIQUES GLOBALES
============================================ */
async function loadGlobalStatsData() {
  const [
    invoicesPromise,
    facturesPromise,
    ventesPromise,
    primesPromise,
    dividendesPromise
  ] = await Promise.all([
    db.from('invoices').select('amount'),
    db.from('factures').select('amount'),
    db.from('ventes').select('total_argent, items_count').is('reset_at', null),
    db.from('primes').select('prime_montant'),
    db.from('dividendes').select('amount')
  ]);

  return {
    invoicesData: invoicesPromise.data,
    invoicesError: invoicesPromise.error,
    facturesData: facturesPromise.data,
    facturesError: facturesPromise.error,
    ventesData: ventesPromise.data,
    ventesError: ventesPromise.error,
    primesData: primesPromise.data,
    primesError: primesPromise.error,
    dividendesData: dividendesPromise.data,
    dividendesError: dividendesPromise.error
  };
}

/* ============================================
   MISE À JOUR DE LA PAGE PATRON
============================================ */
async function showPatronPage(emp) {
  document.getElementById('pagePatron').style.display = 'block';
  document.getElementById('patronNom').textContent = `👑 ${emp.prenom} ${emp.nom}`;
  document.getElementById('patronRoleBadge').textContent = emp.role.replace('_', ' ');

  await loadGlobalStats();
  await loadAllEmployees();
  await loadAllVentes();
  await loadFactures(); // Charger les factures
  await loadResetSelect();
  await loadExportSelect();
  await loadCarEmployeeSelect();
  await loadEmployeeSelect();
  await loadInvoiceHistory();
  await loadDividendHistory(); // Charger l'historique des dividendes
}

/* ============================================
   TOUS LES EMPLOYÉS
============================================ */
async function loadAllEmployees() {
  const div = document.getElementById('allEmployees');
  const { data: employees } = await db.from('employees').select('*').order('nom');

  if (!employees || employees.length === 0) {
    div.innerHTML = '<p class="no-data">Aucun employé</p>';
    return;
  }

  let html = '';
  for (const emp of employees) {
    const stats = await loadEmployeeStats(emp.id);
    html += `<div class="emp-row">
      <div class="emp-info">
        <div class="emp-name">${emp.prenom} ${emp.nom}</div>
        <div class="emp-meta">${emp.role} — ${emp.grade}</div>
      </div>
      <div class="emp-stats">
        <div class="emp-total">$${formatMoney(stats.totalArgent)}</div>
        <div class="emp-prime">Prime: $${formatMoney(stats.totalPrimes)}</div>
      </div>
    </div>`;
  }
  div.innerHTML = html;
}

/* ============================================
   TOUTES LES VENTES
============================================ */
async function loadAllVentes() {
  const div = document.getElementById('allVentes');
  const { data: ventes } = await db
    .from('ventes')
    .select('*')
    .order('created_at', { ascending: false });

  if (!ventes || ventes.length === 0) {
    div.innerHTML = '<p class="no-data">Aucune vente enregistrée</p>';
    return;
  }

  // Créer un objet pour regrouper les ventes par employé
  const ventesParEmploye = {};
  for (const vente of ventes) {
    const { data: emp } = await db
      .from('employees')
      .select('*')
      .eq('id', vente.employee_id)
      .single();

    if (!ventesParEmploye[vente.employee_id]) {
      ventesParEmploye[vente.employee_id] = {
        employee: emp,
        items: [],
        totalItems: 0,
        totalArgent: 0
      };
    }

    ventesParEmploye[vente.employee_id].items.push(vente);
    ventesParEmploye[vente.employee_id].totalItems += vente.items_count;
    ventesParEmploye[vente.employee_id].totalArgent += vente.total_argent;
  }

  // Générer le HTML pour chaque employé
  let html = '<div class="employee-ventes">';
  for (const employeeId in ventesParEmploye) {
    const employee = ventesParEmploye[employeeId].employee;
    const items = ventesParEmploye[employeeId].items;
    const totalItems = ventesParEmploye[employeeId].totalItems;
    const totalArgent = ventesParEmploye[employeeId].totalArgent;

    html += `
      <div class="employee-vente-card">
        <h4>${employee.prenom} ${employee.nom} (${employee.role})</h4>
        <p>Total d'articles vendus: ${totalItems}</p>
        <p>Total d'argent: $${formatMoney(totalArgent)}</p>
        <table class="vente-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Articles</th>
              <th>Total</th>
              <th>Photo</th>
            </tr>
          </thead>
          <tbody>`;

    for (const vente of items) {
      const date = new Date(vente.created_at).toLocaleString('fr-FR');
      const photoCell = vente.photo_url
        ? `<td><img src="${vente.photo_url}" alt="bucket" style="max-width: 100px; max-height: 100px;"/></td>`
        : '<td><span style="color:#555">Pas de photo</span></td>';

      html += `
        <tr>
          <td>${date}</td>
          <td>${vente.items_count}</td>
          <td>$${formatMoney(vente.total_argent)}</td>
          ${photoCell}
        </tr>`;
    }

    html += `
          </tbody>
        </table>
      </div>
    `;
  }

  html += '</div>';
  div.innerHTML = html;
}


/* ============================================
   SELECT RESET & EXPORT
============================================ */
async function loadResetSelect() {
  const sel = document.getElementById('resetSelect');
  const { data: employees } = await db.from('employees').select('*').order('nom');

  // ✅ Option vide par défaut
  sel.innerHTML = '<option value="">-- Choisir un employé --</option>';

  for (const emp of (employees || [])) {
    const opt = document.createElement('option');
    opt.value = emp.id;
    opt.textContent = `${emp.prenom} ${emp.nom} (${emp.role})`;
    sel.appendChild(opt);
  }
}

async function loadExportSelect() {
  const sel = document.getElementById('exportSelect');
  const { data: employees } = await db.from('employees').select('*').order('nom');
  sel.innerHTML = '<option value="all">Tous les employés</option>';
  for (const emp of (employees || [])) {
    const opt = document.createElement('option');
    opt.value = emp.id;
    opt.textContent = `${emp.prenom} ${emp.nom} (${emp.role})`;
    sel.appendChild(opt);
  }
}

/* ============================================
   RESET EMPLOYÉ
============================================ */
async function resetEmployee(employeeId) {
  // VÉRIFIE que l'ID est bien passé
  console.log('🔄 resetEmployee appelé avec ID :', employeeId);

  if (!employeeId) {
    alert('❌ ID employé manquant !');
    return;
  }

  if (!confirm('⚠️ Remettre à zéro les ventes ET les primes de cet employé ?')) return;

  // ---- SUPPRIME LES VENTES ----
  const { data: delVentes, error: errVentes } = await db
    .from('ventes')
    .delete()
    .eq('employee_id', employeeId)
    .select();

  console.log('Résultat suppression ventes :', delVentes, errVentes);

  if (errVentes) {
    alert(`❌ Erreur ventes : ${errVentes.message}`);
    return;
  }

  // ---- SUPPRIME LES PRIMES ----
  const { data: delPrimes, error: errPrimes } = await db
    .from('primes')
    .delete()
    .eq('employee_id', employeeId)
    .select();

  console.log('Résultat suppression primes :', delPrimes, errPrimes);

  if (errPrimes) {
    alert(`❌ Erreur primes : ${errPrimes.message}`);
    return;
  }

  alert('✅ Ventes et primes remises à zéro !');
  await loadGlobalStats();
  await loadAllEmployees();
  await loadAllVentes();
}

/* ============================================
   FACTURATION
============================================ */
async function showPatronPage(emp) {
  document.getElementById('pagePatron').style.display = 'block';
  document.getElementById('patronNom').textContent = `👑 ${emp.prenom} ${emp.nom}`;
  document.getElementById('patronRoleBadge').textContent = emp.role.replace('_', ' ');

  await loadGlobalStats();
  await loadAllEmployees();
  await loadAllVentes();
  await loadFactures(); // Charger les factures
  await loadResetSelect();
  await loadExportSelect();
  await loadCarEmployeeSelect();
  await loadEmployeeSelect();
  await loadInvoiceHistory();
}

async function loadFactures() {
  const div = document.getElementById('invoiceHistory');

  try {
    // Charger les factures
    const { data: factures } = await db
      .from('factures')
      .select('*')
      .order('created_at', { ascending: false });

    if (!factures || factures.length === 0) {
      div.innerHTML = '<p class="no-data">Aucune facture enregistrée</p>';
      return;
    }

    // Calculer le total des montants
    let totalAmount = 0;
    let totalItems = 0;

    // Générer le HTML pour chaque facture
    let html = `
      <table class="history-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Montant</th>
            <th>Articles</th>
            <th>Photo</th>
            <th>Créé par</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>`;

    for (const facture of factures) {
      totalAmount += facture.amount;
      totalItems += facture.items_count;

      const date = new Date(facture.created_at).toLocaleString('fr-FR');

      const { data: emp } = await db
        .from('employees')
        .select('*')
        .eq('id', facture.employee_id)
        .single();

      const photoCell = facture.photo_url
        ? `<td><img src="${facture.photo_url}" alt="facture" style="max-width: 100px; max-height: 100px;"/></td>`
        : '<td><span style="color:#555">Pas de photo</span></td>';

      html += `
        <tr>
          <td>${date}</td>
          <td>${facture.description}</td>
          <td class="td-money">$${formatMoney(facture.amount)}</td>
          <td>${facture.items_count}</td>
          ${photoCell}
          <td>${emp?.prenom} ${emp?.nom} (${emp?.role})</td>
          <td>
            <button class="btn-delete" onclick="deleteFacture('${facture.id}')">❌ Supprimer</button>
            <button class="btn-edit" onclick="editFacture('${facture.id}')">✏️ Modifier</button>
          </td>
        </tr>`;
    }

    html += `
        </tbody>
        <tfoot>
          <tr>
            <th colspan="2">Total</th>
            <th class="td-money">$${formatMoney(totalAmount)}</th>
            <th>${totalItems}</th>
            <th colspan="3"></th>
          </tr>
        </tfoot>
      </table>`;

    div.innerHTML = html;
  } catch (error) {
    console.error('Erreur lors du chargement des factures:', error);
    div.innerHTML = '<p class="no-data">Erreur lors du chargement des factures</p>';
  }
}

async function generateFacture() {
  const amount = parseFloat(document.getElementById('factureAmount').value) || 0;
  const description = document.getElementById('factureDescription').value.trim();
  const items_count = parseInt(document.getElementById('factureItemsCount').value) || 0;
  const photoFile = document.getElementById('facturePhotoFile').files[0];
  const msgOk = document.getElementById('factureMsg');
  const msgErr = document.getElementById('factureMsgErr');
  msgOk.style.display = 'none';
  msgErr.style.display = 'none';

  if (!currentEmployee) {
    msgErr.textContent = '❌ Employé non connecté';
    msgErr.style.display = 'block';
    return;
  }

  if (amount <= 0) {
    msgErr.textContent = '❌ Veuillez entrer un montant valide';
    msgErr.style.display = 'block';
    return;
  }

  if (!description) {
    msgErr.textContent = '❌ Veuillez entrer une description';
    msgErr.style.display = 'block';
    return;
  }

  let photoUrl = null;
  if (photoFile) {
    const fileName = `${Date.now()}_${photoFile.name}`;
    const { data: uploadData, error: uploadError } = await db.storage
      .from('photos')
      .upload(fileName, photoFile);

    if (uploadError) {
      msgErr.textContent = '❌ Erreur lors du téléversement de la photo';
      msgErr.style.display = 'block';
      return;
    }

    const { data: urlData } = db.storage.from('photos').getPublicUrl(fileName);
    photoUrl = urlData?.publicUrl || null;
  }

  try {
    // Générer un identifiant unique pour la facture
    const factureId = generateUniqueId();

    const { data, error } = await db
      .from('factures')
      .insert({
        id: factureId, // Ajout de l'identifiant unique
        employee_id: currentEmployee.id,
        description: description,
        amount: amount,
        items_count: items_count,
        photo_url: photoUrl
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error('Aucune donnée retournée par la base de données');
    }

    msgOk.textContent = '✅ Facture générée avec succès';
    msgOk.style.display = 'block';
    setTimeout(() => { msgOk.style.display = 'none'; }, 5000);
    await loadFactures();
  } catch (dbErr) {
    console.error('Erreur lors de la génération de la facture:', dbErr);
    msgErr.textContent = `❌ Erreur lors de la génération de la facture: ${dbErr.message}`;
    msgErr.style.display = 'block';
  }
}

// Fonction pour générer un identifiant unique
function generateUniqueId() {
  return 'facture_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
}


async function deleteFacture(factureId) {
  const msgOk = document.getElementById('factureMsg');
  const msgErr = document.getElementById('factureMsgErr');
  msgOk.style.display = 'none';
  msgErr.style.display = 'none';

  try {
    const { error } = await db
      .from('factures')
      .delete()
      .eq('id', factureId);

    if (error) throw error;

    msgOk.textContent = '✅ Facture supprimée avec succès';
    msgOk.style.display = 'block';
    setTimeout(() => { msgOk.style.display = 'none'; }, 5000);
    await loadFactures();
  } catch (dbErr) {
    console.error('Erreur lors de la suppression de la facture:', dbErr);
    msgErr.textContent = `❌ Erreur lors de la suppression de la facture: ${dbErr.message}`;
    msgErr.style.display = 'block';
  }
}

async function editFacture(factureId) {
  const msgOk = document.getElementById('factureMsg');
  const msgErr = document.getElementById('factureMsgErr');
  msgOk.style.display = 'none';
  msgErr.style.display = 'none';

  if (!factureId) {
    msgErr.textContent = '❌ Identifiant de facture manquant';
    msgErr.style.display = 'block';
    return;
  }

  try {
    const { data: facture } = await db
      .from('factures')
      .select('*')
      .eq('id', factureId)
      .single();

    if (!facture) {
      msgErr.textContent = '❌ Facture introuvable';
      msgErr.style.display = 'block';
      return;
    }

    document.getElementById('factureAmount').value = facture.amount;
    document.getElementById('factureDescription').value = facture.description;
    document.getElementById('factureItemsCount').value = facture.items_count;
    document.getElementById('editFactureId').value = factureId;

    const modal = document.getElementById('editFactureModal');
    modal.style.display = 'block';
  } catch (dbErr) {
    console.error('Erreur lors de la récupération de la facture:', dbErr);
    msgErr.textContent = `❌ Erreur lors de la récupération de la facture: ${dbErr.message}`;
    msgErr.style.display = 'block';
  }
}

async function saveEditedFacture() {
  const factureId = document.getElementById('editFactureId').value;
  const amount = parseFloat(document.getElementById('factureAmount').value) || 0;
  const description = document.getElementById('factureDescription').value.trim();
  const items_count = parseInt(document.getElementById('factureItemsCount').value) || 0;
  const photoFile = document.getElementById('editFacturePhotoFile').files[0];
  const msgOk = document.getElementById('factureMsg');
  const msgErr = document.getElementById('factureMsgErr');
  msgOk.style.display = 'none';
  msgErr.style.display = 'none';

  if (amount <= 0) {
    msgErr.textContent = '❌ Veuillez entrer un montant valide';
    msgErr.style.display = 'block';
    return;
  }

  if (!description) {
    msgErr.textContent = '❌ Veuillez entrer une description';
    msgErr.style.display = 'block';
    return;
  }

  let photoUrl = null;
  if (photoFile) {
    const fileName = `${Date.now()}_${photoFile.name}`;
    const { data: uploadData, error: uploadError } = await db.storage
      .from('photos')
      .upload(fileName, photoFile);

    if (uploadError) {
      msgErr.textContent = '❌ Erreur lors du téléversement de la photo';
      msgErr.style.display = 'block';
      return;
    }

    const { data: urlData } = db.storage.from('photos').getPublicUrl(fileName);
    photoUrl = urlData?.publicUrl || null;
  }

  try {
    const updateData = {
      description: description,
      amount: amount,
      items_count: items_count
    };

    if (photoUrl) {
      updateData.photo_url = photoUrl;
    }

    const { error } = await db
      .from('factures')
      .update(updateData)
      .eq('id', factureId);

    if (error) throw error;

    msgOk.textContent = '✅ Facture mise à jour avec succès';
    msgOk.style.display = 'block';
    setTimeout(() => { msgOk.style.display = 'none'; }, 5000);
    document.getElementById('editFactureModal').style.display = 'none';
    await loadFactures();
  } catch (dbErr) {
    console.error('Erreur lors de la mise à jour de la facture:', dbErr);
    msgErr.textContent = `❌ Erreur lors de la mise à jour de la facture: ${dbErr.message}`;
    msgErr.style.display = 'block';
  }
}


/* ============================================
   EXPORT PDF
============================================ */
async function exportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const { data: ventes } = await db
    .from('ventes')
    .select('*')
    .order('created_at', { ascending: false });

  const { data: primes } = await db
    .from('primes')
    .select('*')
    .order('created_at', { ascending: false });

  // Créer un objet pour regrouper les ventes par employé
  const ventesParEmploye = {};
  for (const vente of ventes) {
    if (!ventesParEmploye[vente.employee_id]) {
      ventesParEmploye[vente.employee_id] = {
        items: [],
        totalItems: 0,
        totalArgent: 0
      };
    }

    ventesParEmploye[vente.employee_id].items.push(vente);
    ventesParEmploye[vente.employee_id].totalItems += vente.items_count;
    ventesParEmploye[vente.employee_id].totalArgent += vente.total_argent;
  }

  // Ajouter le titre
  doc.setFontSize(16);
  doc.setTextColor(200, 168, 75);
  doc.text('Rapport des ventes par employé', 14, 15);

  // Ajouter les ventes par employé
  let yPos = 25;
  for (const employeeId in ventesParEmploye) {
    const items = ventesParEmploye[employeeId].items;
    const totalItems = ventesParEmploye[employeeId].totalItems;
    const totalArgent = ventesParEmploye[employeeId].totalArgent;

    doc.setFontSize(12);
    doc.setTextColor(240, 232, 208);
    doc.text(`Employé: ${employeeId}`, 14, yPos);
    doc.text(`Total d'articles vendus: ${totalItems}`, 14, yPos + 6);
    doc.text(`Total d'argent: $${formatMoney(totalArgent)}`, 14, yPos + 12);

    if (items.length > 0) {
      doc.autoTable({
        startY: yPos + 20,
        head: [['Date', 'Articles', 'Total']],
        body: items.map(v => [
          new Date(v.created_at).toLocaleString('fr-FR'),
          v.items_count,
          `$${formatMoney(v.total_argent)}`
        ]),
        styles: { fontSize: 8, textColor: [240, 232, 208], fillColor: [26, 26, 40] },
        headStyles: { fillColor: [200, 168, 75], textColor: [0, 0, 0], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [18, 18, 26] },
        margin: { left: 14 }
      });
      yPos = doc.lastAutoTable.finalY + 5;
    } else {
      yPos += 20;
    }
  }

  // Ajouter les primes si nécessaire
  if (primes && primes.length > 0) {
    if (yPos > 240) { doc.addPage(); yPos = 20; }
    doc.autoTable({
      startY: yPos,
      head: [['Date', 'Items', 'Vente', 'Prime', 'Grade']],
      body: primes.map(p => [
        new Date(p.created_at).toLocaleString('fr-FR'),
        p.items_count,
        `$${formatMoney(p.total_vente)}`,
        `$${formatMoney(p.prime_montant)}`,
        p.grade
      ]),
      styles: { fontSize: 8, textColor: [240, 232, 208], fillColor: [26, 26, 40] },
      headStyles: { fillColor: [85, 135, 224], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [18, 18, 26] },
      margin: { left: 14 }
    });
    yPos = doc.lastAutoTable.finalY + 12;
  }

  doc.setDrawColor(42, 37, 53);
  doc.line(14, yPos, 196, yPos);
  yPos += 8;

  doc.save(`rapport_entreprise_${new Date().toISOString().slice(0, 10)}.pdf`);
}


/* ============================================
   GESTION DES VOITURES
============================================ */
async function loadCarEmployeeSelect() {
  const sel = document.getElementById('carEmployeeSelect');
  const { data: employees } = await db.from('employees').select('*').order('nom');

  sel.innerHTML = '<option value="">-- Sélectionner un employé --</option>';

  for (const emp of (employees || [])) {
    const opt = document.createElement('option');
    opt.value = emp.id;
    opt.textContent = `${emp.prenom} ${emp.nom} (${emp.role})`;
    sel.appendChild(opt);
  }
}

function previewCarPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Vérification du type de fichier
  if (!file.type.match('image.*')) {
    alert('Veuillez sélectionner une image valide');
    return;
  }

  // Vérification de la taille du fichier (5MB max)
  if (file.size > 5 * 1024 * 1024) {
    alert('La taille de la photo ne doit pas dépasser 5MB');
    return;
  }

  carUploadedFile = file;
  document.getElementById('carUploadText').textContent = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('carPhotoPreview');
    preview.src = e.target.result;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

/* ============================================
   GESTION DES VOITURES
============================================ */
async function assignCar() {
  const model = document.getElementById('carModel').value.trim();
  const brand = document.getElementById('carBrand').value.trim();
  const color = document.getElementById('carColor').value.trim();
  const licensePlate = document.getElementById('carLicensePlate').value.trim();
  const employeeId = document.getElementById('carEmployeeSelect').value;
  const msgOk = document.getElementById('carMsg');
  const msgErr = document.getElementById('carMsgErr');

  if (!model || !brand || !color || !licensePlate || !employeeId) {
    msgErr.textContent = '❌ Veuillez remplir tous les champs';
    msgErr.style.display = 'block';
    return;
  }

  if (!carUploadedFile) {
    msgErr.textContent = '❌ Veuillez ajouter une photo de la voiture';
    msgErr.style.display = 'block';
    return;
  }

  try {
    const fileName = `car_${Date.now()}_${carUploadedFile.name}`;
    const { data: uploadData, error: uploadError } = await db.storage
      .from('voitures')
      .upload(fileName, carUploadedFile);

    if (uploadError) {
      throw new Error(uploadError.message || 'Erreur lors du téléchargement de la photo');
    }

    const { data: insertData, error: insertError } = await db
      .from('voitures')
      .insert([
        {
          model: model,
          brand: brand,
          color: color,
          license_plate: licensePlate,
          employee_id: employeeId,
          photo_url: fileName
        }
      ])
      .select();

    if (insertError) {
      throw new Error(insertError.message || 'Erreur lors de l\'insertion de la voiture');
    }

    msgOk.textContent = '✅ Voiture assignée avec succès';
    msgOk.style.display = 'block';
    setTimeout(() => { msgOk.style.display = 'none'; }, 5000);
  } catch (err) {
    console.error('Erreur lors de l\'assignation de la voiture:', err);
    msgErr.textContent = `❌ Erreur lors de l'assignation de la voiture: ${err.message}`;
    msgErr.style.display = 'block';
  }
}


/* ============================================
   VOITURES DISPONIBLES
============================================ */
async function loadAvailableCars() {
  const div = document.getElementById('availableCars');
  const { data: cars, error } = await db
    .from('voitures')  // Changement ici: de 'cars' à 'voitures'
    .select('*')
    .eq('employee_id', currentEmployee.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erreur lors du chargement des voitures:', error);
    div.innerHTML = '<p class="no-data">Erreur lors du chargement des voitures</p>';
    return;
  }

  if (!cars || cars.length === 0) {
    div.innerHTML = '<p class="no-data">Aucune voiture disponible</p>';
    return;
  }

  let html = '<div class="cars-grid">';
  for (const car of cars) {
    html += `
      <div class="car-card">
        <div class="car-image" style="background-image: url('${car.image_url || 'default-car-image.jpg'}')"></div>
        <div class="car-info">
          <h4>${car.model}</h4>
          <p>Marque: ${car.brand}</p>
          <p>Couleur: ${car.color}</p>
          <p>Plaque: ${car.license_plate}</p>
        </div>
      </div>
    `;
  }
  html += '</div>';
  div.innerHTML = html;
}



/* ============================================
   FACTURATION
============================================ */
async function generateInvoice() {
  const amount = parseFloat(document.getElementById('invoiceAmount').value) || 0;
  const description = document.getElementById('invoiceDescription').value.trim();
  const msgOk = document.getElementById('invoiceMsg');
  const msgErr = document.getElementById('invoiceMsgErr');
  msgOk.style.display = 'none';
  msgErr.style.display = 'none';

  if (amount <= 0) {
    msgErr.textContent = '❌ Veuillez entrer un montant valide';
    msgErr.style.display = 'block';
    return;
  }

  if (!description) {
    msgErr.textContent = '❌ Veuillez entrer une description';
    msgErr.style.display = 'block';
    return;
  }

  let imageUrl = null;
  if (invoiceUploadedFile) {
    const fileName = `invoice_${Date.now()}_${invoiceUploadedFile.name}`;
    const { data: uploadData, error: uploadError } = await db.storage
      .from('invoices')
      .upload(fileName, invoiceUploadedFile);

    if (uploadError) {
      console.error('Erreur lors du téléchargement de la photo:', uploadError);
      msgErr.textContent = '❌ Erreur lors du téléchargement de la photo';
      msgErr.style.display = 'block';
      return;
    }

    if (uploadData) {
      const { data: urlData } = db.storage.from('invoices').getPublicUrl(fileName);
      imageUrl = urlData?.publicUrl || null;
    }
  }

  try {
    const { error } = await db.from('invoices').insert({
      amount: amount,
      description: description,
      image_url: imageUrl,
      created_by: currentEmployee.id
    });

    if (error) {
      console.error('Erreur lors de l\'insertion de la facture:', error);
      msgErr.textContent = '❌ Erreur lors de la génération de la facture';
      msgErr.style.display = 'block';
      return;
    }

    msgOk.textContent = '✅ Facture générée avec succès';
    msgOk.style.display = 'block';

    // RESET formulaire
    document.getElementById('invoiceAmount').value = '';
    document.getElementById('invoiceDescription').value = '';
    document.getElementById('invoicePhotoPreview').style.display = 'none';
    document.getElementById('invoicePhotoPreview').src = '';
    document.getElementById('invoicePhotoFile').value = '';
    document.getElementById('invoiceUploadText').textContent = 'Glisse une photo ou clique pour choisir';
    invoiceUploadedFile = null;

    setTimeout(() => { msgOk.style.display = 'none'; }, 5000);
    await loadInvoiceHistory();
  } catch (err) {
    console.error('Erreur lors de la génération de la facture:', err);
    msgErr.textContent = '❌ Erreur lors de la génération de la facture';
    msgErr.style.display = 'block';
  }
}

/* ============================================
   CRÉATION D'EMPLOYÉS
============================================ */
async function createEmployee() {
  const prenom = document.getElementById('newEmpPrenom').value.trim();
  const nom = document.getElementById('newEmpNom').value.trim();
  const role = document.getElementById('newEmpRole').value.trim();
  const grade = document.getElementById('newEmpGrade').value;
  const code = document.getElementById('newEmpCode').value.trim();

  const msgOk = document.getElementById('creationMsg');
  const msgErr = document.getElementById('creationMsgErr');
  msgOk.style.display = 'none';
  msgErr.style.display = 'none';

  // Validation des champs
  if (!prenom || !nom || !role || !grade || !code) {
    msgErr.textContent = '❌ Tous les champs sont obligatoires';
    msgErr.style.display = 'block';
    return;
  }

  if (code.length !== 10 || !/^\d+$/.test(code)) {
    msgErr.textContent = '❌ Le code doit contenir 10 chiffres';
    msgErr.style.display = 'block';
    return;
  }

  // Vérification des rôles valides
  const validRoles = ['patron', 'employe', 'livreur', 'comptable', 'securite', 'rh'];
  if (!validRoles.includes(role.toLowerCase())) {
    msgErr.textContent = '❌ Rôle invalide. Les rôles valides sont : patron, employe, livreur, comptable, securite, rh';
    msgErr.style.display = 'block';
    return;
  }

  try {
    // Vérification de l'unicité du code
    const { data: existingEmployee, error: existingEmployeeError } = await db
      .from('employees')
      .select('*')
      .eq('code', code)
      .limit(1);

    if (existingEmployeeError) throw existingEmployeeError;

    if (existingEmployee && existingEmployee.length > 0) {
      msgErr.textContent = '❌ Un employé avec ce code existe déjà';
      msgErr.style.display = 'block';
      return;
    }

    // Création de l'employé
    const { data: newEmployee, error: createError } = await db
      .from('employees')
      .insert([
        {
          prenom,
          nom,
          role: role.toLowerCase(),
          grade,
          code,
          account_balance: 0,
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (createError) throw createError;

    // Réinitialiser les champs
    document.getElementById('newEmpPrenom').value = '';
    document.getElementById('newEmpNom').value = '';
    document.getElementById('newEmpRole').value = '';
    document.getElementById('newEmpGrade').value = 'debutant';
    document.getElementById('newEmpCode').value = '';

    msgOk.textContent = `✅ Employé ${prenom} ${nom} créé avec succès`;
    msgOk.style.display = 'block';

    // Rafraîchir la liste des employés
    await loadAllEmployees();
  } catch (error) {
    console.error('Erreur lors de la création de l\'employé:', error);
    msgErr.textContent = `❌ Erreur lors de la création de l'employé: ${error.message}`;
    msgErr.style.display = 'block';
  }
}

/* ============================================
   GESTION DES EMPLOYÉS
============================================ */
async function loadEmployeeSelect() {
  const sel = document.getElementById('employeeSelect');
  const { data: employees } = await db.from('employees').select('*').order('nom');

  sel.innerHTML = '<option value="">-- Choisir un employé --</option>';

  for (const emp of (employees || [])) {
    const opt = document.createElement('option');
    opt.value = emp.id;
    opt.textContent = `${emp.prenom} ${emp.nom} (${emp.role})`;
    sel.appendChild(opt);
  }
}

async function updateEmployeeGrade() {
  const employeeId = document.getElementById('employeeSelect').value;
  const newGrade = document.getElementById('gradeSelect').value;
  const msgOk = document.getElementById('managementMsg');
  const msgErr = document.getElementById('managementMsgErr');
  msgOk.style.display = 'none';
  msgErr.style.display = 'none';

  if (!employeeId) {
    msgErr.textContent = '❌ Sélectionnez un employé';
    msgErr.style.display = 'block';
    return;
  }

  const { error } = await db
    .from('employees')
    .update({ grade: newGrade })
    .eq('id', employeeId);

  if (error) {
    msgErr.textContent = '❌ Erreur lors de la mise à jour';
    msgErr.style.display = 'block';
    return;
  }

  msgOk.textContent = '✅ Grade mis à jour avec succès';
  msgOk.style.display = 'block';
  setTimeout(() => { msgOk.style.display = 'none'; }, 5000);
  await loadAllEmployees();
}

async function fireEmployee() {
  const employeeId = document.getElementById('employeeSelect').value;
  const msgOk = document.getElementById('managementMsg');
  const msgErr = document.getElementById('managementMsgErr');
  msgOk.style.display = 'none';
  msgErr.style.display = 'none';

  if (!employeeId) {
    msgErr.textContent = '❌ Sélectionnez un employé';
    msgErr.style.display = 'block';
    return;
  }

  if (!confirm('⚠️ Êtes-vous sûr de vouloir virer cet employé ?')) return;

  const { error } = await db
    .from('employees')
    .delete()
    .eq('id', employeeId);

  if (error) {
    msgErr.textContent = '❌ Erreur lors du renvoi';
    msgErr.style.display = 'block';
    return;
  }

  msgOk.textContent = '✅ Employé renvoyé avec succès';
  msgOk.style.display = 'block';
  setTimeout(() => { msgOk.style.display = 'none'; }, 5000);
  await loadAllEmployees();
  document.getElementById('employeeSelect').value = '';
}

/* ============================================
   FACTURATION
============================================ */
function previewInvoicePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  invoiceUploadedFile = file;
  document.getElementById('invoiceUploadText').textContent = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('invoicePhotoPreview');
    preview.src = e.target.result;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function generateInvoice() {
  // Initialisation des éléments de l'interface
  const amount = parseFloat(document.getElementById('invoiceAmount').value) || 0;
  const description = document.getElementById('invoiceDescription').value.trim();
  const msgOk = document.getElementById('invoiceMsg');
  const msgErr = document.getElementById('invoiceMsgErr');
  msgOk.style.display = 'none';
  msgErr.style.display = 'none';

  // Validation des champs
  if (amount <= 0) {
    msgErr.textContent = '❌ Veuillez entrer un montant valide';
    msgErr.style.display = 'block';
    return;
  }

  if (!description) {
    msgErr.textContent = '❌ Veuillez entrer une description';
    msgErr.style.display = 'block';
    return;
  }

  // Gestion du téléchargement de la photo
  let imageUrl = null;
  if (invoiceUploadedFile) {
    try {
      // Vérification du type de fichier
      if (!invoiceUploadedFile.type.match('image.*')) {
        throw new Error('Type de fichier invalide');
      }

      // Vérification de la taille du fichier (5MB max)
      if (invoiceUploadedFile.size > 5 * 1024 * 1024) {
        throw new Error('La taille de la photo ne doit pas dépasser 5MB');
      }

      // Génération d'un nom de fichier unique
      const fileName = `invoice_${Date.now()}_${currentEmployee.id}_${invoiceUploadedFile.name.replace(/\s+/g, '_')}`;

      // Téléversement du fichier
      const { data: uploadData, error: uploadError } = await db.storage
        .from('invoices')
        .upload(fileName, invoiceUploadedFile);

      if (uploadError) {
        throw new Error(uploadError.message || 'Erreur lors du téléchargement de la photo');
      }

      // Récupération de l'URL publique
      const { data: urlData, error: urlError } = await db.storage
        .from('invoices')
        .getPublicUrl(fileName);

      if (urlError) {
        throw new Error(urlError.message || 'Erreur lors de la récupération de l\'URL de la photo');
      }

      imageUrl = urlData?.publicUrl || null;
    } catch (uploadErr) {
      console.error('Erreur lors du traitement de la photo:', uploadErr);
      msgErr.textContent = `❌ Erreur lors du traitement de la photo: ${uploadErr.message}`;
      msgErr.style.display = 'block';
      return;
    }
  }

  // Insertion de la facture dans la base de données
  try {
    const { data: invoiceData, error: dbError } = await db.from('invoices').insert({
      amount: amount,
      description: description,
      image_url: imageUrl,
      created_by: currentEmployee.id,
      created_at: new Date().toISOString()
    }).select();

    if (dbError) {
      throw new Error(dbError.message || 'Erreur lors de l\'insertion de la facture');
    }

    // Affichage du message de succès
    msgOk.textContent = '✅ Facture générée avec succès';
    msgOk.style.display = 'block';

    // RESET formulaire
    document.getElementById('invoiceAmount').value = '';
    document.getElementById('invoiceDescription').value = '';
    document.getElementById('invoicePhotoPreview').style.display = 'none';
    document.getElementById('invoicePhotoPreview').src = '';
    document.getElementById('invoicePhotoFile').value = '';
    document.getElementById('invoiceUploadText').textContent = 'Glisse une photo ou clique pour choisir';
    invoiceUploadedFile = null;

    // Actualisation de l'historique après 2 secondes
    setTimeout(async () => {
      await loadInvoiceHistory();
      msgOk.style.display = 'none';
    }, 2000);
  } catch (dbErr) {
    console.error('Erreur lors de la génération de la facture:', dbErr);
    msgErr.textContent = `❌ Erreur lors de la génération de la facture: ${dbErr.message}`;
    msgErr.style.display = 'block';
  }
}


/* ============================================
   HISTORIQUE DES FACTURES
============================================ */
async function loadInvoiceHistory() {
  const div = document.getElementById('invoiceHistory');

  try {
    // Charger les factures
    const { data: invoices } = await db
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false });

    if (!invoices || invoices.length === 0) {
      div.innerHTML = '<p class="no-data">Aucune facture enregistrée</p>';
      return;
    }

    // Calculer le total des montants
    let totalAmount = 0;
    let totalItems = 0;

    // Générer le HTML pour chaque facture
    let html = `
      <table class="history-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Montant</th>
            <th>Articles</th>
            <th>Photo</th>
            <th>Créé par</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>`;

    for (const invoice of invoices) {
      totalAmount += invoice.amount;

      // Extraire le nombre d'articles
      let itemsCount = 0;
      if (invoice.items) {
        try {
          // Si items est une chaîne JSON
          if (typeof invoice.items === 'string') {
            const items = JSON.parse(invoice.items);
            if (Array.isArray(items)) {
              itemsCount = items.reduce((sum, item) => {
                return sum + (item.quantity || 0);
              }, 0);
            } else if (typeof items === 'object' && 'quantity' in items) {
              itemsCount = items.quantity;
            }
          }
          // Si items est déjà un objet
          else if (typeof invoice.items === 'object') {
            if (Array.isArray(invoice.items)) {
              itemsCount = invoice.items.reduce((sum, item) => {
                return sum + (item.quantity || 0);
              }, 0);
            } else if ('quantity' in invoice.items) {
              itemsCount = invoice.items.quantity;
            }
          }
          // Si items est un nombre
          else if (typeof invoice.items === 'number') {
            itemsCount = invoice.items;
          }
        } catch (e) {
          console.error('Erreur lors de l\'analyse des articles:', e);
          // Si l'analyse échoue, essayer de prendre la valeur quantity si elle existe
          if (invoice.quantity) {
            itemsCount = invoice.quantity;
          }
        }
      }

      // Si on n'a toujours pas de nombre d'articles, utiliser quantity directement
      if (itemsCount === 0 && invoice.quantity) {
        itemsCount = invoice.quantity;
      }

      totalItems += itemsCount;

      const date = new Date(invoice.created_at).toLocaleString('fr-FR');

      const { data: emp } = await db
        .from('employees')
        .select('*')
        .eq('id', invoice.created_by)
        .single();

      const photoCell = invoice.image_url
        ? `<td><img src="${invoice.image_url}" alt="facture" style="max-width: 100px; max-height: 100px;"/></td>`
        : '<td><span style="color:#555">Pas de photo</span></td>';

      html += `
        <tr>
          <td>${date}</td>
          <td>${invoice.description}</td>
          <td class="td-money">$${formatMoney(invoice.amount)}</td>
          <td>${itemsCount}</td>
          ${photoCell}
          <td>${emp?.prenom} ${emp?.nom} (${emp?.role})</td>
          <td>
            <button class="btn-delete" onclick="deleteInvoice('${invoice.id}')">❌ Supprimer</button>
            <button class="btn-edit" onclick="editInvoice('${invoice.id}')">✏️ Modifier</button>
          </td>
        </tr>`;
    }

    html += `
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2"><strong>Total</strong></td>
            <td class="td-money"><strong>$${formatMoney(totalAmount)}</strong></td>
            <td><strong>${totalItems}</strong></td>
            <td colspan="3"></td>
          </tr>
        </tfoot>
      </table>`;
    div.innerHTML = html;

  } catch (error) {
    console.error('Erreur lors du chargement des factures:', error);
    div.innerHTML = '<p class="no-data">Erreur lors du chargement des factures</p>';
  }
}

/* ============================================
   SUPPRESSION D'UNE FACTURE
============================================ */
async function deleteInvoice(invoiceId) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer cette facture ?')) {
    return;
  }

  try {
    const { error } = await db
      .from('invoices')
      .delete()
      .eq('id', invoiceId);

    if (error) throw error;

    // Mettre à jour l'affichage
    await loadInvoiceHistory();
    alert('Facture supprimée avec succès');
  } catch (error) {
    console.error('Erreur lors de la suppression de la facture:', error);
    alert(`Erreur lors de la suppression: ${error.message}`);
  }
}

/* ============================================
   MODIFICATION D'UNE FACTURE
============================================ */
async function editInvoice(invoiceId) {
  try {
    // Charger la facture à modifier
    const { data: invoice, error } = await db
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (error) throw error;

    if (!invoice) {
      alert('Facture introuvable');
      return;
    }

    // Remplir le formulaire de modification
    document.getElementById('invoiceAmount').value = invoice.amount;
    document.getElementById('invoiceDescription').value = invoice.description;

    // Afficher le modal de modification
    document.getElementById('editInvoiceModal').style.display = 'block';
    document.getElementById('editInvoiceId').value = invoice.id;

    // Afficher la photo si elle existe
    const photoPreview = document.getElementById('editInvoicePhotoPreview');
    if (invoice.image_url) {
      photoPreview.src = invoice.image_url;
      photoPreview.style.display = 'block';
    } else {
      photoPreview.style.display = 'none';
    }

  } catch (error) {
    console.error('Erreur lors de la modification de la facture:', error);
    alert(`Erreur lors de la modification: ${error.message}`);
  }
}

/* ============================================
   SAUVEGARDE DES MODIFICATIONS D'UNE FACTURE
============================================ */
async function saveEditedInvoice() {
  const invoiceId = document.getElementById('editInvoiceId').value;
  const amount = parseFloat(document.getElementById('invoiceAmount').value) || 0;
  const description = document.getElementById('invoiceDescription').value.trim();
  const photoFile = document.getElementById('editInvoicePhotoFile').files[0];

  try {
    // Préparer les données à mettre à jour
    const updateData = {
      amount: amount,
      description: description,
    };

    // Gérer le téléversement de la photo si une nouvelle photo est sélectionnée
    if (photoFile) {
      const fileName = `${invoiceId}_${Date.now()}_${photoFile.name}`;
      const { data: uploadData, error: uploadError } = await db.storage
        .from('invoices')
        .upload(fileName, photoFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = db.storage.from('invoices').getPublicUrl(fileName);
      updateData.image_url = urlData?.publicUrl || null;
    }

    // Mettre à jour la facture dans la base de données
    const { error } = await db
      .from('invoices')
      .update(updateData)
      .eq('id', invoiceId);

    if (error) throw error;

    // Fermer le modal et rafraîchir l'affichage
    document.getElementById('editInvoiceModal').style.display = 'none';
    await loadInvoiceHistory();
    alert('Facture modifiée avec succès');

  } catch (error) {
    console.error('Erreur lors de la sauvegarde de la facture:', error);
    alert(`Erreur lors de la sauvegarde: ${error.message}`);
  }
}

