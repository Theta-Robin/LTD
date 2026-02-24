const supabaseUrl = 'https://buqsbkloueboxhrnxvkv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1cXNia2xvdWVib3hocm54dmt2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MDQ4NzgsImV4cCI6MjA4NzA4MDg3OH0.b5gkFFHRy_fXZXc6gECx7R7bDQQoclaPhXhgeN01Iec';
const db = supabase.createClient(supabaseUrl, supabaseKey);

let currentEmployee = null; // Variable globale pour stocker l'employé actuel

document.addEventListener('DOMContentLoaded', async () => {
  // Vérifier si l'utilisateur est déjà connecté
  await checkAuthStatus();
});

async function checkAuthStatus() {
  const { data: { user }, error } = await db.auth.getUser();

  if (error || !user) {
    // Utilisateur non connecté, afficher la page de connexion
    document.getElementById('pageLogin').style.display = 'block';
    document.getElementById('pageStock').style.display = 'none';
  } else {
    // Utilisateur déjà connecté, charger l'employé actuel et le stock
    await loadCurrentEmployee();
    document.getElementById('pageLogin').style.display = 'none';
    document.getElementById('pageStock').style.display = 'block';
    loadStock();
  }
}

async function login() {
  const code = document.getElementById('codeInput').value.trim();

  if (!code || code.length !== 10) {
    document.getElementById('loginError').style.display = 'block';
    return;
  }

  try {
    // Remplacer cette partie par votre propre logique d'authentification
    // Par exemple, vous pourriez vérifier le code dans votre base de données
    const { data: employee, error } = await db
      .from('employees')
      .select('*')
      .eq('code', code)
      .single();

    if (error || !employee) {
      throw new Error('Code invalide ou introuvable');
    }

    // Stocker l'employé actuel
    currentEmployee = employee;

    // Mettre à jour l'interface utilisateur
    document.getElementById('empNom').textContent = `${employee.prenom} ${employee.nom}`;
    document.getElementById('empRoleBadge').textContent = employee.role;
    document.getElementById('empGradeBadge').textContent = employee.grade;
    document.getElementById('empCode').textContent = `Code: ${employee.code}`;

    // Afficher la page de stock et masquer la page de connexion
    document.getElementById('pageLogin').style.display = 'none';
    document.getElementById('pageStock').style.display = 'block';

    // Charger le stock
    loadStock();

  } catch (err) {
    document.getElementById('loginError').textContent = `❌ ${err.message}`;
    document.getElementById('loginError').style.display = 'block';
  }
}

function logout() {
  // Réinitialiser l'employé actuel
  currentEmployee = null;

  // Masquer la page de stock et afficher la page de connexion
  document.getElementById('pageLogin').style.display = 'block';
  document.getElementById('pageStock').style.display = 'none';

  // Réinitialiser le champ de code
  document.getElementById('codeInput').value = '';
  document.getElementById('loginError').style.display = 'none';
}

async function loadCurrentEmployee() {
  // Récupérer les détails de l'employé depuis la table employees
  const { data: employee, error: empError } = await db
    .from('employees')
    .select('*')
    .eq('id', currentEmployee.id)
    .single();

  if (empError) {
    console.error('Erreur lors de la récupération des détails de l\'employé:', empError);
    return;
  }

  currentEmployee = employee;
  console.log('Employé actuel:', currentEmployee);

  // Mettre à jour l'interface utilisateur
  document.getElementById('empNom').textContent = `${employee.prenom} ${employee.nom}`;
  document.getElementById('empRoleBadge').textContent = employee.role;
  document.getElementById('empGradeBadge').textContent = employee.grade;
  document.getElementById('empCode').textContent = `Code: ${employee.code}`;
}

async function loadStock() {
  const div = document.getElementById('stockContent');
  const { data: products, error } = await db
    .from('stock')
    .select('*')
    .order('product_name');

  if (error) {
    console.error('Erreur lors du chargement du stock:', error);
    div.innerHTML = '<p class="no-data">Erreur lors du chargement du stock</p>';
    return;
  }

  if (!products || products.length === 0) {
    div.innerHTML = '<p class="no-data">Aucun article dans le stock</p>';
    return;
  }

  let html = `
    <table class="stock-table">
      <thead>
        <tr>
          <th>Nom</th>
          <th>Quantité</th>
          <th>Prix unitaire</th>
          <th>Valeur totale</th>
          <th>Ajouté le</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const p of products) {
    const date = new Date(p.created_at).toLocaleString('fr-FR');
    const totalValue = (p.quantity * p.price_per_unit).toFixed(2);
    html += `
      <tr>
        <td>${p.product_name}</td>
        <td>${p.quantity}</td>
        <td>$${p.price_per_unit.toFixed(2)}</td>
        <td>$${totalValue}</td>
        <td>${date}</td>
      </tr>
    `;
  }

  html += `
      </tbody>
      <tfoot>
        <tr>
          <th colspan="3">Total</th>
          <th id="totalValue">Calcul en cours...</th>
          <th></th>
        </tr>
      </tfoot>
    </table>
  `;

  div.innerHTML = html;

  // Calcul du total
  let total = 0;
  products.forEach(p => {
    total += p.quantity * p.price_per_unit;
  });
  document.getElementById('totalValue').textContent = `$${total.toFixed(2)}`;
}

async function addProduct() {
  const productName = document.getElementById('productName').value.trim();
  const productQuantity = parseInt(document.getElementById('productQuantity').value);
  const productPrice = parseFloat(document.getElementById('productPrice').value);
  const msgOk = document.getElementById('addMsg');
  const msgErr = document.getElementById('addMsgErr');
  msgOk.style.display = 'none';
  msgErr.style.display = 'none';

  // Validation des champs
  if (!productName) {
    msgErr.textContent = '❌ Veuillez entrer un nom de produit';
    msgErr.style.display = 'block';
    return;
  }

  if (productQuantity <= 0) {
    msgErr.textContent = '❌ La quantité doit être supérieure à 0';
    msgErr.style.display = 'block';
    return;
  }

  if (productPrice < 0) {
    msgErr.textContent = '❌ Le prix doit être positif';
    msgErr.style.display = 'block';
    return;
  }

  // Vérifier si l'employé est connecté et a les permissions nécessaires
  if (!currentEmployee) {
    msgErr.textContent = '❌ Vous devez être connecté pour ajouter un produit';
    msgErr.style.display = 'block';
    return;
  }

  if (!['patron', 'co_patron', 'employe'].includes(currentEmployee.role)) {
    msgErr.textContent = '❌ Vous n\'avez pas les permissions nécessaires pour ajouter un produit';
    msgErr.style.display = 'block';
    return;
  }

  try {
    const { error } = await db.from('stock').insert({
      product_name: productName,
      quantity: productQuantity,
      price_per_unit: productPrice,
      added_by: currentEmployee.id,
      created_at: new Date().toISOString()
    }).select();

    if (error) {
      throw new Error(error.message || 'Erreur lors de l\'ajout du produit');
    }

    msgOk.textContent = '✅ Produit ajouté avec succès';
    msgOk.style.display = 'block';

    // Réinitialiser le formulaire
    document.getElementById('productName').value = '';
    document.getElementById('productQuantity').value = '1';
    document.getElementById('productPrice').value = '0.00';

    // Recharger le stock
    setTimeout(loadStock, 500);
  } catch (err) {
    console.error('Erreur lors de l\'ajout du produit:', err);
    msgErr.textContent = `❌ Erreur lors de l'ajout du produit: ${err.message}`;
    msgErr.style.display = 'block';
  }
}

