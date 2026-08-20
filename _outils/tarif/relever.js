/* Relève les prix homologués d'un arrêté du Journal officiel.
 *
 *   node _outils/tarif/relever.js "<arrêté.pdf>" [--ecrire]
 *
 * Sans « --ecrire », l'outil compare son relevé à tarifs.json et rend compte.
 * Avec, il écrit le nouveau relevé et garde le précédent sous
 * tarifs-precedent.json — de quoi raconter l'histoire d'un prix.
 *
 * Ce que le document a d'ingrat, et qu'il faut savoir avant d'y toucher :
 *
 *   - l'ordre du flux n'est pas l'ordre de lecture. Le titre d'une rubrique
 *     peut être tracé avant la ligne FOURNISSEUR qui la précède à l'œil. S'y
 *     fier fait basculer la rubrique au mauvais moment : la première tentative
 *     de ce relevé y avait perdu 1 244 cigares. On trie donc chaque page par
 *     ordonnée décroissante, et les pages entre elles par l'ordre du sommaire.
 *
 *   - le tableau tient en colonnes fixes : le libellé à gauche, le prix à
 *     l'unité vers 380, le prix du conditionnement vers 412. Une ligne sans
 *     prix à l'unité n'est pas un produit — c'est un titre, un fournisseur,
 *     une rubrique.
 *
 *   - les rubriques alternent cigares, cigarettes, tabacs à rouler. On ne
 *     retient que la première, et l'on suit aussi les retraits, qui portent
 *     des prix valides jusqu'à leur date d'effet.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { charger, inflate, runs, policesDuDocument } = require('../pastilles/lire-pdf.js');

const RACINE = path.join(__dirname, '..', '..');
const COL_LIBELLE = 200;      // au-delà, ce n'est plus la colonne des noms
const COL_UNITE = [360, 400]; // la colonne du prix à l'unité

/* La clé du relevé, telle que l'application la calcule : on la lui emprunte
   plutôt que d'en tenir une seconde version qui dériverait. */
function cleTarifDeLApp() {
  const lignes = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8').split('\n');
  const bloc = debut => {
    const i = lignes.findIndex(l => l.startsWith(debut));
    if (i < 0) throw new Error('introuvable dans index.html : ' + debut);
    if (!debut.startsWith('function')) {
      for (let j = i; j < lignes.length; j++) if (/;\s*$/.test(lignes[j])) return lignes.slice(i, j + 1).join('\n');
    }
    let p = 0;
    for (let j = i; j < lignes.length; j++) {
      for (const c of lignes[j]) { if (c === '{') p++; else if (c === '}') p--; }
      if (p === 0 && lignes[j].includes('}')) return lignes.slice(i, j + 1).join('\n');
    }
    throw new Error('bloc non terminé : ' + debut);
  };
  const banc = {};
  vm.createContext(banc);
  vm.runInContext(['const MOTS_VIDES=new Set(', 'function normCigar(s)', 'function cleTarif(nom)']
    .map(bloc).join('\n'), banc);
  return banc.cleTarif;
}

/* Les pages dans l'ordre du document, et non dans celui du fichier. */
function pagesEnOrdre(doc) {
  let kids = null;
  for (const [, corps] of doc.objets)
    if (/\/Type\s*\/Pages/.test(corps)) { kids = corps.match(/\/Kids\s*\[([^\]]*)\]/); if (kids) break; }
  const ordre = kids ? [...kids[1].matchAll(/(\d+)\s+\d+\s+R/g)].map(m => m[1]) : [...doc.objets.keys()];
  const pages = [];
  for (const num of ordre) {
    const corps = doc.objets.get(num);
    if (!corps || !/\/Type\s*\/Page[^s]/.test(corps)) continue;
    const c = corps.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
    if (c) pages.push(c[1]);
  }
  return pages;
}

const RUBRIQUE_CIGARE = /^cigares?\b|cigarillos/i;
const RUBRIQUE_AUTRE = /^cigarettes|^tabacs?\b|^produits? du tabac|^papiers?/i;
const NON_PRODUIT = /^(FOURNISSEUR|FABRICANT|DÉSIGNATION|DESIGNATION|NOUVEAU LIBELL|A l'unité|Prix homologu|Page\b|PRIX DE VENTE)/i;

function relever(chemin) {
  const doc = charger(chemin);
  const { tables } = policesDuDocument(doc);
  const cleTarif = cleTarifDeLApp();
  const tarifs = {};
  const collisions = [];
  let rubrique = null, lignesVues = 0, produits = 0;

  for (const numContenu of pagesEnOrdre(doc)) {
    const clair = inflate(doc.objets.get(numContenu) || '');
    if (!clair) continue;
    const tous = runs(doc, clair, tables);
    // l'ordre de lecture : de haut en bas, puis de gauche à droite
    tous.sort((a, b) => (b.y - a.y) || (a.x - b.x));

    // regrouper par ligne : même ordonnée à un point près
    const parLigne = [];
    for (const r of tous) {
      const derniere = parLigne[parLigne.length - 1];
      if (derniere && Math.abs(derniere.y - r.y) < 1.5) derniere.runs.push(r);
      else parLigne.push({ y: r.y, runs: [r] });
    }

    for (const ligne of parLigne) {
      lignesVues++;
      const gauche = ligne.runs.filter(r => r.x < COL_LIBELLE);
      const libelle = gauche.map(r => r.t).join(' ').replace(/\s+/g, ' ').trim();
      if (!libelle) continue;

      // un titre de rubrique : indenté, seul sur sa ligne, sans prix
      const seul = ligne.runs.length === gauche.length;
      if (seul && gauche[0].x > 90) {
        if (RUBRIQUE_CIGARE.test(libelle)) rubrique = 'cigares';
        else if (RUBRIQUE_AUTRE.test(libelle)) rubrique = 'autre';
        continue;
      }
      if (NON_PRODUIT.test(libelle)) continue;
      if (rubrique !== 'cigares') continue;

      /* Le prix à l'unité, quand l'arrêté le publie. Beaucoup de références —
         les coffrets, les grands crus — n'ont qu'un prix de conditionnement :
         on le divise alors par la quantité que le libellé annonce, « en 25
         cigares ». Sans cela, cinq cent quarante-deux cigares, et les plus
         beaux, restaient hors du relevé. On préfère toujours le prix imprimé
         au prix calculé : c'est celui que le buraliste affiche. */
      const nombre = r => /^\d[\d\s]*[.,]\d{2}$/.test(r.t.trim());
      const unite = ligne.runs.find(r => r.x >= COL_UNITE[0] && r.x < COL_UNITE[1] && nombre(r));
      let prix = unite ? Number(unite.t.trim().replace(/\s/g, '').replace(',', '.')) : null;
      let calcule = false;
      if (!(prix > 0)) {
        const lot = ligne.runs.find(r => r.x >= COL_UNITE[1] && r.x < 430 && nombre(r));
        const qte = libelle.match(/\ben\s+(\d+)\s+(?:cigares?|cigarillos?|unit[ée]s?|pi[èe]ces?)/i);
        if (!lot || !qte) continue;
        const total = Number(lot.t.trim().replace(/\s/g, '').replace(',', '.'));
        const n = +qte[1];
        if (!(total > 0) || !(n > 0)) continue;
        prix = Math.round(total / n * 100) / 100;
        calcule = true;
      }
      if (!(prix > 0)) continue;
      produits++;

      const cle = cleTarif(libelle);
      if (!cle) continue;
      if (tarifs[cle] !== undefined && tarifs[cle] !== prix) {
        collisions.push({ cle, garde: Math.min(tarifs[cle], prix), autre: Math.max(tarifs[cle], prix), libelle });
        // deux présentations d'un même cigare : on garde la moins chère, qui
        // est le prix à l'unité hors coffret
        tarifs[cle] = Math.min(tarifs[cle], prix);
      } else tarifs[cle] = prix;
    }
  }
  return { tarifs, collisions, lignesVues, produits };
}

module.exports = { relever };

if (require.main === module) {
  const chemin = process.argv[2];
  if (!chemin) { console.error('usage : node _outils/tarif/relever.js "<arrêté.pdf>" [--ecrire]'); process.exit(1); }
  const { tarifs, collisions, lignesVues, produits } = relever(chemin);
  const cles = Object.keys(tarifs);
  console.log(`lignes lues        ${lignesVues}`);
  console.log(`produits retenus   ${produits}`);
  console.log(`clés distinctes    ${cles.length}`);
  console.log(`collisions         ${collisions.length}`);

  const actuel = JSON.parse(fs.readFileSync(path.join(RACINE, 'tarifs.json'), 'utf8'));
  const anciennes = Object.keys(actuel);
  const communes = cles.filter(k => actuel[k] !== undefined);
  const memePrix = communes.filter(k => Math.abs(actuel[k] - tarifs[k]) < 0.005);
  console.log(`\nrelevé en place    ${anciennes.length} clés`);
  console.log(`   communes        ${communes.length}`);
  console.log(`   même prix       ${memePrix.length}`);
  console.log(`   prix différent  ${communes.length - memePrix.length}`);
  console.log(`   nouvelles       ${cles.length - communes.length}`);
  console.log(`   disparues       ${anciennes.length - communes.length}`);

  const ecarts = communes.filter(k => Math.abs(actuel[k] - tarifs[k]) >= 0.005).slice(0, 12);
  if (ecarts.length) {
    console.log('\n--- douze écarts de prix ---');
    ecarts.forEach(k => console.log(`   ${String(actuel[k]).padStart(7)} → ${String(tarifs[k]).padEnd(7)} ${k.slice(0, 50)}`));
  }

  if (!process.argv.includes('--ecrire')) { console.log('\n(épreuve à blanc — relancer avec --ecrire)'); process.exit(0); }
  // le relevé sortant devient l'histoire : c'est lui qui donnera « depuis »
  fs.writeFileSync(path.join(RACINE, 'tarifs-precedent.json'), JSON.stringify(actuel));
  fs.writeFileSync(path.join(RACINE, 'tarifs.json'), JSON.stringify(tarifs));
  console.log(`\nécrit : tarifs.json (${cles.length} clés), tarifs-precedent.json (${anciennes.length} clés)`);
}
