// Configuration Supabase
const supabaseUrl = 'https://buqsbkloueboxhrnxvkv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1cXNia2xvdWVib3hocm54dmt2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MDQ4NzgsImV4cCI6MjA4NzA4MDg3OH0.b5gkFFHRy_fXZXc6gECx7R7bDQQoclaPhXhgeN01Iec';
const db = supabase.createClient(supabaseUrl, supabaseKey);

// Variables globales
let currentEmployee = null;

// Fonction de formatage monétaire
function formatMoney(amount) {
  return amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}

// Fonction de déconnexion
function logout() {
  currentEmployee = null;
  document.getElementById('pageLogin').style.display = 'flex';
  document.getElementById('pageComptabilite').style.display = 'none';
  document.getElementById('codeInput').value = '';
}

// Fonction de connexion
async function login() {
  const code = document.getElementById('codeInput').value.trim();

  if (code.length !== 10) {
    document.getElementById('loginError').style.display = 'block';
    return;
  }

  try {
    // Vérifier si l'employé existe
    const { data: employee, error: employeeError } = await db
      .from('employees')
      .select('*')
      .eq('code', code)
      .single();

    if (employeeError || !employee) {
      throw new Error('Employé introuvable');
    }

    // Mettre à jour l'interface
    currentEmployee = employee;
    document.getElementById('comptableNom').textContent = `${employee.prenom} ${employee.nom}`;
    document.getElementById('comptableCode').textContent = `Code: ${employee.code}`;

    // Afficher la page de comptabilité
    document.getElementById('pageLogin').style.display = 'none';
    document.getElementById('pageComptabilite').style.display = 'block';

    // Initialiser le système de comptabilité
    await initComptabilite();

  } catch (error) {
    console.error("Erreur lors de la connexion:", error);
    document.getElementById('loginError').style.display = 'block';
  }
}

// Fonction pour initialiser le système comptable
async function initComptabilite() {
  // Vérifier si l'employé est connecté
  if (!currentEmployee) {
    console.error("Aucun employé connecté");
    return;
  }

  // Charger les données financières
  await loadFinancialData();

  // Initialiser les écouteurs d'événements
  setupEventListeners();
}

// Charger les données financières
async function loadFinancialData() {
  try {
    // Charger les ventes
    const { data: ventes, error: ventesError } = await db
      .from('ventes')
      .select('*')
      .eq('employee_id', currentEmployee.id)
      .order('created_at', { ascending: false });

    if (ventesError) throw ventesError;

    // Charger les primes
    const { data: primes, error: primesError } = await db
      .from('primes')
      .select('*')
      .eq('employee_id', currentEmployee.id)
      .order('created_at', { ascending: false });

    if (primesError) throw primesError;

    // Charger les dépenses
    const { data: depenses, error: depensesError } = await db
      .from('depenses')
      .select('*')
      .eq('employee_id', currentEmployee.id)
      .order('created_at', { ascending: false });

    if (depensesError) throw depensesError;

    // Mettre à jour l'interface
    updateFinancialUI(ventes, primes, depenses);

  } catch (error) {
    console.error("Erreur lors du chargement des données financières:", error);
    showError("Erreur lors du chargement des données financières");
  }
}

// Mettre à jour l'interface utilisateur avec les données financières
function updateFinancialUI(ventes, primes, depenses) {
  // Mettre à jour les statistiques
  const totalVentes = ventes.reduce((sum, vente) => sum + vente.total_argent, 0);
  const totalPrimes = primes.reduce((sum, prime) => sum + prime.montant, 0);
  const totalDepenses = depenses.reduce((sum, depense) => sum + depense.montant, 0);
  const benefice = totalVentes + totalPrimes - totalDepenses;

  document.getElementById('statVentes').textContent = `$${formatMoney(totalVentes)}`;
  document.getElementById('statPrimes').textContent = `$${formatMoney(totalPrimes)}`;
  document.getElementById('statDepenses').textContent = `$${formatMoney(totalDepenses)}`;
  document.getElementById('statBenefice').textContent = `$${formatMoney(benefice)}`;

  // Mettre à jour les tableaux
  updateVentesTable(ventes);
  updatePrimesTable(primes);
  updateDepensesTable(depenses);
}

// Mettre à jour le tableau des ventes
function updateVentesTable(ventes) {
  const tableBody = document.getElementById('ventesTableBody');
  tableBody.innerHTML = '';

  if (ventes.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="4" class="no-data">Aucune vente trouvée</td>';
    tableBody.appendChild(row);
    return;
  }

  ventes.forEach(vente => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${new Date(vente.created_at).toLocaleString('fr-FR')}</td>
      <td>${vente.items_count}</td>
      <td>$${formatMoney(vente.total_argent)}</td>
      <td>${vente.description || 'N/A'}</td>
    `;
    tableBody.appendChild(row);
  });
}

// Mettre à jour le tableau des primes
function updatePrimesTable(primes) {
  const tableBody = document.getElementById('primesTableBody');
  tableBody.innerHTML = '';

  if (primes.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="5" class="no-data">Aucune prime trouvée</td>';
    tableBody.appendChild(row);
    return;
  }

  primes.forEach(prime => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${new Date(prime.created_at).toLocaleString('fr-FR')}</td>
      <td>${prime.items_count}</td>
      <td>$${formatMoney(prime.total_vente)}</td>
      <td>$${formatMoney(prime.montant)}</td>
      <td>${prime.grade}</td>
    `;
    tableBody.appendChild(row);
  });
}

// Mettre à jour le tableau des dépenses
function updateDepensesTable(depenses) {
  const tableBody = document.getElementById('depensesTableBody');
  tableBody.innerHTML = '';

  if (depenses.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="4" class="no-data">Aucune dépense trouvée</td>';
    tableBody.appendChild(row);
    return;
  }

  depenses.forEach(depense => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${new Date(depense.created_at).toLocaleString('fr-FR')}</td>
      <td>${depense.description}</td>
      <td>$${formatMoney(depense.montant)}</td>
      <td>${depense.categorie}</td>
    `;
    tableBody.appendChild(row);
  });
}

// Ajouter une nouvelle dépense
async function addDepense(event) {
  event.preventDefault();

  const description = document.getElementById('depenseDescription').value;
  const montant = parseFloat(document.getElementById('depenseMontant').value);
  const categorie = document.getElementById('depenseCategorie').value;

  if (!description || isNaN(montant) || montant <= 0 || !categorie) {
    showError("Veuillez remplir tous les champs correctement");
    return;
  }

  try {
    const { data, error } = await db
      .from('depenses')
      .insert([
        {
          employee_id: currentEmployee.id,
          description,
          montant,
          categorie,
          created_at: new Date().toISOString()
        }
      ])
      .select();

    if (error) throw error;

    showSuccess("Dépense ajoutée avec succès");
    document.getElementById('depenseForm').reset();
    await loadFinancialData();
  } catch (error) {
    console.error("Erreur lors de l'ajout de la dépense:", error);
    showError("Erreur lors de l'ajout de la dépense");
  }
}

// Fonction pour afficher un message de succès
function showSuccess(message) {
  const msg = document.getElementById('successMsg');
  msg.textContent = message;
  msg.style.display = 'block';

  setTimeout(() => {
    msg.style.display = 'none';
  }, 5000);
}

// Fonction pour afficher un message d'erreur
function showError(message) {
  const msg = document.getElementById('errorMsg');
  msg.textContent = message;
  msg.style.display = 'block';

  setTimeout(() => {
    msg.style.display = 'none';
  }, 5000);
}

// Fonction pour initialiser les écouteurs d'événements
function setupEventListeners() {
  document.getElementById('depenseForm').addEventListener('submit', addDepense);
}

// Fonction pour exporter les données financières en PDF
async function exportFinancialPDF() {
  // Charger les données financières
  const { data: ventes, error: ventesError } = await db
    .from('ventes')
    .select('*')
    .eq('employee_id', currentEmployee.id)
    .order('created_at', { ascending: false });

  if (ventesError) {
    showError("Erreur lors du chargement des ventes");
    return;
  }

  const { data: primes, error: primesError } = await db
    .from('primes')
    .select('*')
    .eq('employee_id', currentEmployee.id)
    .order('created_at', { ascending: false });

  if (primesError) {
    showError("Erreur lors du chargement des primes");
    return;
  }

  const { data: depenses, error: depensesError } = await db
    .from('depenses')
    .select('*')
    .eq('employee_id', currentEmployee.id)
    .order('created_at', { ascending: false });

  if (depensesError) {
    showError("Erreur lors du chargement des dépenses");
    return;
  }

  // Créer le PDF
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Calculer les totaux
  const totalVentes = ventes.reduce((sum, vente) => sum + vente.total_argent, 0);
  const totalPrimes = primes.reduce((sum, prime) => sum + prime.montant, 0);
  const totalDepenses = depenses.reduce((sum, depense) => sum + depense.montant, 0);
  const benefice = totalVentes + totalPrimes - totalDepenses;

  // En-tête du PDF
  doc.setFontSize(20);
  doc.setTextColor(200, 168, 75);
  doc.text('Rapport Financier Entreprise GTA RP', 14, 22);
  doc.setFontSize(10);
  doc.setTextColor(150, 150, 150);
  doc.text(`Date: ${new Date().toLocaleString('fr-FR')}`, 14, 30);
  doc.setDrawColor(200, 168, 75);
  doc.line(14, 34, 196, 34);

  // Informations du vendeur
  doc.setFontSize(12);
  doc.text(`Comptable: ${currentEmployee.prenom} ${currentEmployee.nom}`, 14, 45);
  doc.text(`Code: ${currentEmployee.code}`, 14, 55);

  // Statistiques financières
  let yPos = 70;
  doc.setFontSize(14);
  doc.setTextColor(200, 168, 75);
  doc.text('Statistiques Financières', 14, yPos);
  yPos += 10;

  doc.setFontSize(12);
  doc.setTextColor(240, 232, 208);
  doc.text(`Ventes Totales: $${formatMoney(totalVentes)}`, 14, yPos);
  yPos += 8;
  doc.text(`Primes Totales: $${formatMoney(totalPrimes)}`, 14, yPos);
  yPos += 8;
  doc.text(`Dépenses Totales: $${formatMoney(totalDepenses)}`, 14, yPos);
  yPos += 8;
  doc.text(`Bénéfice: $${formatMoney(benefice)}`, 14, yPos);
  yPos += 16;

  // Tableau des ventes
  if (ventes.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(200, 168, 75);
    doc.text('Historique des Ventes', 14, yPos);
    yPos += 10;

    doc.autoTable({
      startY: yPos,
      head: [['Date', 'Items', 'Total', 'Description']],
      body: ventes.map(v => [
        new Date(v.created_at).toLocaleString('fr-FR'),
        v.items_count,
        `$${formatMoney(v.total_argent)}`,
        v.description || 'N/A'
      ]),
      styles: { fontSize: 8, textColor: [240, 232, 208], fillColor: [26, 26, 40] },
      headStyles: { fillColor: [200, 168, 75], textColor: [0, 0, 0], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [18, 18, 26] },
      margin: { left: 14 }
    });
    yPos = doc.lastAutoTable.finalY + 10;
  } else {
    doc.setFontSize(12);
    doc.setTextColor(240, 232, 208);
    doc.text('Aucune vente trouvée', 14, yPos);
    yPos += 10;
  }

  // Tableau des primes
  if (primes.length > 0) {
    if (yPos > 240) { doc.addPage(); yPos = 20; }
    doc.setFontSize(14);
    doc.setTextColor(200, 168, 75);
    doc.text('Historique des Primes', 14, yPos);
    yPos += 10;

    doc.autoTable({
      startY: yPos,
      head: [['Date', 'Items', 'Vente', 'Prime', 'Grade']],
      body: primes.map(p => [
        new Date(p.created_at).toLocaleString('fr-FR'),
        p.items_count,
        `$${formatMoney(p.total_vente)}`,
        `$${formatMoney(p.montant)}`,
        p.grade
      ]),
      styles: { fontSize: 8, textColor: [240, 232, 208], fillColor: [26, 26, 40] },
      headStyles: { fillColor: [85, 135, 224], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [18, 18, 26] },
      margin: { left: 14 }
    });
    yPos = doc.lastAutoTable.finalY + 10;
  } else {
    if (yPos > 240) { doc.addPage(); yPos = 20; }
    doc.setFontSize(12);
    doc.setTextColor(240, 232, 208);
    doc.text('Aucune prime trouvée', 14, yPos);
    yPos += 10;
  }

  // Tableau des dépenses
  if (depenses.length > 0) {
    if (yPos > 240) { doc.addPage(); yPos = 20; }
    doc.setFontSize(14);
    doc.setTextColor(200, 168, 75);
    doc.text('Historique des Dépenses', 14, yPos);
    yPos += 10;

    doc.autoTable({
      startY: yPos,
      head: [['Date', 'Description', 'Montant', 'Catégorie']],
      body: depenses.map(d => [
        new Date(d.created_at).toLocaleString('fr-FR'),
        d.description,
        `$${formatMoney(d.montant)}`,
        d.categorie
      ]),
      styles: { fontSize: 8, textColor: [240, 232, 208], fillColor: [26, 26, 40] },
      headStyles: { fillColor: [224, 85, 85], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [18, 18, 26] },
      margin: { left: 14 }
    });
    yPos = doc.lastAutoTable.finalY + 10;
  } else {
    if (yPos > 240) { doc.addPage(); yPos = 20; }
    doc.setFontSize(12);
    doc.setTextColor(240, 232, 208);
    doc.text('Aucune dépense trouvée', 14, yPos);
    yPos += 10;
  }

  // Sauvegarder le PDF
  doc.save(`rapport_financier_${currentEmployee.code}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
  // Vérifier si l'employé est déjà connecté (par exemple, via un cookie ou localStorage)
  const savedEmployee = localStorage.getItem('currentEmployee');
  if (savedEmployee) {
    try {
      currentEmployee = JSON.parse(savedEmployee);
      document.getElementById('comptableNom').textContent = `${currentEmployee.prenom} ${currentEmployee.nom}`;
      document.getElementById('comptableCode').textContent = `Code: ${currentEmployee.code}`;
      document.getElementById('pageLogin').style.display = 'none';
      document.getElementById('pageComptabilite').style.display = 'block';
      initComptabilite();
    } catch (e) {
      console.error("Erreur lors de la récupération de l'employé sauvegardé:", e);
    }
  }
});
