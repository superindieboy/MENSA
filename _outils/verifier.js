/* Contrôle avant de pousser.
 *
 *   node _outils/verifier.js
 *
 * L'application tient dans un seul bloc de script : une faute de syntaxe, et
 * c'est l'écran blanc pour tout le cercle. Or rien ne la signale avant le
 * déploiement — pas de build, pas de test. Ce fichier est le filet.
 *
 * Il vérifie trois choses, dans l'ordre où elles cassent :
 *   - chaque bloc <script> d'index.html s'analyse sans erreur ;
 *   - catalogue.json et tarifs.json sont du JSON valide ;
 *   - les fiches ont un identifiant unique et un tarif bien formé.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Un dossier peut être passé en argument : c'est ce qui permet d'éprouver le
// contrôle lui-même, sur une copie volontairement abîmée.
const racine = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..');
const lire = f => fs.readFileSync(path.join(racine, f), 'utf8');
let fautes = 0;
const echec = m => { fautes++; console.error('  ✗ ' + m); };
const bon = m => console.log('  ✓ ' + m);

// ---- 1. La syntaxe du script ----
console.log('index.html');
const html = lire('index.html');
const blocs = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
if (!blocs.length) echec('aucun bloc de script trouvé — le fichier est-il intact ?');
blocs.forEach((m, i) => {
  const ligne = html.slice(0, m.index).split('\n').length;
  try {
    new vm.Script(m[1], { filename: `index.html:${ligne}` });
    bon(`bloc ${i + 1} (ligne ${ligne}) : ${m[1].split('\n').length} lignes, syntaxe correcte`);
  } catch (e) {
    echec(`bloc ${i + 1} (ligne ${ligne}) : ${e.message}`);
  }
});

// ---- 2. Les données ----
const donnees = {};
for (const f of ['catalogue.json', 'tarifs.json']) {
  console.log(f);
  try {
    donnees[f] = JSON.parse(lire(f));
    bon('JSON valide');
  } catch (e) {
    echec(e.message);
  }
}

// ---- 3. Ce que le JSON valide ne dit pas ----
const cat = donnees['catalogue.json'];
if (Array.isArray(cat)) {
  console.log('catalogue');
  const vus = new Set(), doubles = [];
  let sansNom = 0, tarifsFaux = 0;
  for (const f of cat) {
    if (vus.has(f.id)) doubles.push(f.id); else vus.add(f.id);
    if (!f.name) sansNom++;
    if ('tarif' in f && !(typeof f.tarif === 'number' && f.tarif > 0)) tarifsFaux++;
  }
  bon(`${cat.length} fiches, ${cat.filter(f => f.tarif > 0).length} chiffrées`);
  if (doubles.length) echec(`identifiants en double : ${doubles.slice(0, 5).join(', ')}`);
  if (sansNom) echec(`${sansNom} fiche(s) sans nom`);
  if (tarifsFaux) echec(`${tarifsFaux} tarif(s) mal formé(s)`);
  if (!doubles.length && !sansNom && !tarifsFaux) bon('identifiants uniques, noms et tarifs bien formés');
}

const tar = donnees['tarifs.json'];
if (tar && typeof tar === 'object') {
  console.log('relevé');
  const mauvais = Object.entries(tar).filter(([k, v]) => !k || typeof v !== 'number' || !(v > 0));
  bon(`${Object.keys(tar).length} clés`);
  if (mauvais.length) echec(`${mauvais.length} entrée(s) mal formée(s), dont « ${mauvais[0][0]} »`);
  else bon('toutes les valeurs sont des prix positifs');
}

// ---- 4. L'appariement des prix ----
// Une seule commande avant de pousser : la forme des fichiers, puis le sens.
console.log('');
fautes += require('./epreuves.js')(racine);

console.log('');
if (fautes) { console.error(`${fautes} problème(s). Ne poussez pas en l'état.`); process.exit(1); }
console.log('Rien à signaler.');
