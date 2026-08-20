/* Épreuves de l'appariement des prix.
 *
 *   node _outils/epreuves.js
 *
 * C'est la logique qui a le plus cassé : le Half Corona Criollito, le gros
 * Robusto du My Father, le Double Château, les doublons dont le prix n'était
 * pas transféré. À chaque fois la panne a été découverte des jours plus tard,
 * par un membre. Ces épreuves rejouent en une seconde des cas dont on connaît
 * la réponse, pour que la prochaine régression se voie avant d'être poussée.
 *
 * Elles n'ouvrent pas de navigateur : elles découpent les fonctions pures
 * d'index.html — normCigar, cleTarif, tarifDuNom, tarifParCouverture — et les
 * exécutent contre tarifs.json et catalogue.json, tels qu'ils sont servis.
 * Si le découpage échoue, l'outil le dit et s'arrête : mieux vaut un contrôle
 * absent qu'un contrôle qui prétend passer sur du vide.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------------------------------------------------------------- Le banc */

function preparer(racine) {
  const lire = f => fs.readFileSync(path.join(racine, f), 'utf8');
  const lignes = lire('index.html').split('\n');

  /* Découpe un bloc de premier niveau à partir de sa première ligne. Les
     fonctions se ferment sur l'équilibre des accolades — qu'elles tiennent sur
     une ligne ou sur trente — les déclarations sur leur point-virgule. Aucune
     des fonctions visées ne contient d'accolade en chaîne ni en expression
     régulière ; si cela changeait, le morceau extrait ne s'analyserait plus et
     l'outil s'en plaindrait aussitôt. */
  function extraire(debut) {
    const i = lignes.findIndex(l => l.startsWith(debut));
    if (i < 0) throw new Error(`introuvable dans index.html : ${debut}`);
    if (!debut.startsWith('function')) {
      for (let j = i; j < lignes.length; j++)
        if (/;\s*$/.test(lignes[j])) return lignes.slice(i, j + 1).join('\n');
      throw new Error(`déclaration non terminée : ${debut}`);
    }
    let profondeur = 0;
    for (let j = i; j < lignes.length; j++) {
      for (const car of lignes[j]) {
        if (car === '{') profondeur++;
        else if (car === '}') profondeur--;
      }
      if (profondeur === 0 && j > i - 1 && lignes[j].includes('}'))
        return lignes.slice(i, j + 1).join('\n');
    }
    throw new Error(`fonction non terminée : ${debut}`);
  }

  const source = [
    'const MOTS_VIDES=new Set(',
    'function normCigar(s)',
    'function cleTarif(nom)',
    'function tarifDuNom(nom)',
    'function motsDeFiche(c)',
    'function tarifParCouverture(c)'
  ].map(extraire).join('\n');

  const banc = {
    TARIFS: JSON.parse(lire('tarifs.json')),
    TARIFS_MOTS: null,
    catalogue: JSON.parse(lire('catalogue.json'))
  };
  vm.createContext(banc);
  vm.runInContext(source, banc);

  /* Le catalogue tel que l'application le tient en mémoire une fois complété :
     c'est sur cet état que portent les garde-fous chiffrés. */
  banc.complete = () => {
    const cat = banc.catalogue.map(f => Object.assign({}, f));
    const partages = {};
    cat.forEach(c => {
      const k = banc.normCigar(c.name);
      partages[k] = (partages[k] || 0) + 1;
    });
    cat.forEach(c => {
      if (c.tarif > 0) return;
      let p = banc.tarifDuNom(c.name);
      if (!(p > 0) && !(partages[banc.normCigar(c.name)] > 1)) p = banc.tarifParCouverture(c);
      if (p > 0) c.tarif = p;
    });
    return cat;
  };
  return banc;
}

/* ------------------------------------------------------------- Les épreuves

   Trois familles, de la plus fine à la plus large : les règles d'écriture,
   les prix qu'on a vérifiés à la main dans le tarif, puis les nombres, qui
   attrapent ce qu'aucun cas nommé ne prévoit. */

// Deux libellés du même cigare doivent donner la même clé.
const MEMES = [
  ['Montecristo N° 2', 'Montecristo No. 2', 'la numérotation, quelle qu\'en soit l\'écriture'],
  ['Montecristo N° 2', 'Montecristo n°2', 'la numérotation collée au chiffre'],
  ['Le Hoyo du Maire', 'Hoyo du Maire', 'l\'article de tête'],
  ['El Rey del Mundo Choix Suprême', 'Rey del Mundo Choix Supreme', 'articles et accents'],
  ['Vegafina 1998 VF 56', 'Vegafina VF 1998 56', 'l\'ordre des mots'],
  ['Bolívar Royal Corona', 'Bolivar Royal Coronas', 'accent et pluriel'],
  ['Trinidad Fundadores, en boîte de 12 cigares', 'Trinidad Fundadores', 'le conditionnement'],
  ['Romeo y Julieta Wide Churchills, en 25 cigares', 'Romeo y Julieta Wide Churchill', 'conditionnement et pluriel'],
  ['My Father Le Bijou Gros Robusto', 'My Father Le Bijou Grand Robusto', 'gros robusto = grand robusto'],
  ['Partagás Serie D N° 4', 'Partagas Serie D No 4', 'accent et numérotation']
];

// Deux cigares distincts ne doivent jamais se confondre. Un prix faux est pire
// qu'un prix absent : c'est cette famille-là qui garde le rapprochement honnête.
const DISTINCTS = [
  ['Hoyo de Monterrey Epicure N° 1', 'Hoyo de Monterrey Epicure N° 2', 'deux numéros'],
  ['Cohiba BHK 52', 'Cohiba BHK 54', 'deux modules'],
  ['Montecristo Edmundo', 'Montecristo Petit Edmundo', 'un mot en plus'],
  ['Trinidad Coloniales', 'Trinidad Fundadores', 'deux vitoles'],
  ['Coronitas en Cedro', 'Coronitas', 'le cèdre n\'est pas un emballage']
];
/* Ce que ces épreuves n'exigent pas : qu'un mot répété distingue. « Coronas
   Claro » et « Coronas Claro Claro » donnent la même clé, les mots étant
   dédoublés — c'est le prix à payer pour rapprocher « Ramon Allones Allones
   Specially Selected » de « Ramon Allones Specially Selected ». Aucune paire
   du relevé n'en souffre aujourd'hui. */

// Prix relevés à la main dans le tarif, un par un.
const PRIX = [
  ['Arturo Fuente Château Fuente Double Château', 20],
  ['El Criollito Half Corona', 7],
  ['Cohiba BHK 54', 244],
  ['Cohiba BHK 56', 270],
  ['Ramon Allones Specially Selected', 19],
  ['Montecristo N° 2', 29.8],
  ['Hoyo de Monterrey Epicure N° 2', 22],
  ['Cigare Qui N\'existe Pas Chez Personne', null]
];

// Le nom seul ne suffit pas toujours : le format porte le reste. Ces fiches-là
// ne trouvent leur prix que par recouvrement, et c'est ce chemin qui a lâché.
// Le Behike y figure pour la raison inverse : trois entrées du relevé tiennent
// dans ses mots — le module seul, le coffret, le robusto — et l'application
// doit s'abstenir plutôt que d'en choisir une. Sa fiche porte son prix.
const FICHES = [
  [{ name: 'My Father Le Bijou 1922', module: 'Gros robusto' }, 23.5],
  [{ name: 'Cohiba Behike Bhk 54', module: 'Grand robusto (laguito n° 5)' }, null],
  [{ name: 'Marque Inventée Pour L\'épreuve', module: 'Robusto' }, null]
];

// Bout à bout : la fiche telle que le membre la voit, une fois le catalogue
// chargé et complété. C'est le seul endroit où l'on vérifie le résultat plutôt
// que le chemin.
const AU_CATALOGUE = [
  ['mensa-1138', 'Arturo Fuente Double Château Fuente', 20],
  ['mensa-1731', 'El Criollito Half Corona', 7],
  ['mensa-0533', 'My Father Le Bijou 1922', 23.5],
  ['mensa-0055', 'Cohiba Behike Bhk 54', 244]
];

// Ce qu'aucun cas nommé ne verrait : un effondrement général. Des planchers,
// non des égalités — le catalogue a vocation à grandir, pas à rétrécir.
const PLANCHERS = { fiches: 3090, chiffrees: 2755, cles: 2900 };

const MOJIBAKE = /°[a-zA-ZÀ-ÿ]/;   // « ch°teau » : un accent perdu en chemin

/* ------------------------------------------------------------------ Course */

function epreuves(racine) {
  let fautes = 0;
  const echec = m => { fautes++; console.error('  ✗ ' + m); };
  const bon = m => console.log('  ✓ ' + m);

  let b;
  try {
    b = preparer(racine);
  } catch (e) {
    console.error('  ✗ ' + e.message);
    return 1;
  }

  console.log('écriture des noms');
  let bons = 0;
  for (const [a, z, quoi] of MEMES) {
    const ka = b.cleTarif(a), kz = b.cleTarif(z);
    if (ka === kz) bons++;
    else echec(`${quoi} : « ${a} » → ${ka}\n      mais « ${z} » → ${kz}`);
  }
  if (bons === MEMES.length) bon(`${bons} écritures d'un même cigare ramenées à une seule clé`);

  bons = 0;
  for (const [a, z, quoi] of DISTINCTS) {
    if (b.cleTarif(a) !== b.cleTarif(z)) bons++;
    else echec(`${quoi} : « ${a} » et « ${z} » partagent la clé ${b.cleTarif(a)}`);
  }
  if (bons === DISTINCTS.length) bon(`${bons} paires de cigares distincts restent distinctes`);

  console.log('prix relevés à la main');
  bons = 0;
  for (const [nom, attendu] of PRIX) {
    const eu = b.tarifDuNom(nom);
    if (eu === attendu) bons++;
    else echec(`« ${nom} » : ${attendu === null ? 'aucun prix attendu' : attendu + ' €'}, obtenu ${eu === null ? 'aucun' : eu + ' €'}`);
  }
  if (bons === PRIX.length) bon(`${bons} prix retrouvés au nom`);

  bons = 0;
  for (const [fiche, attendu] of FICHES) {
    const eu = b.tarifDuNom(fiche.name) || b.tarifParCouverture(fiche);
    if ((eu || null) === attendu) bons++;
    else echec(`« ${fiche.name} » (${fiche.module}) : ${attendu === null ? 'aucun prix attendu' : attendu + ' €'}, obtenu ${eu ? eu + ' €' : 'aucun'}`);
  }
  if (bons === FICHES.length) bon(`${bons} fiches retrouvées par recouvrement du format`);

  console.log('fiches du catalogue');
  const cat = b.complete();
  bons = 0;
  for (const [id, nom, attendu] of AU_CATALOGUE) {
    const f = cat.find(x => x.id === id);
    if (!f) { echec(`${id} a disparu du catalogue`); continue; }
    if (f.name !== nom) { echec(`${id} s'appelle « ${f.name} », attendu « ${nom} »`); continue; }
    if (f.tarif === attendu) bons++;
    else echec(`${id} « ${nom} » : ${attendu} € attendus, ${f.tarif ? f.tarif + ' €' : 'aucun prix'}`);
  }
  if (bons === AU_CATALOGUE.length) bon(`${bons} fiches affichent le prix vérifié au tarif`);

  console.log('vue d\'ensemble');
  const chiffrees = cat.filter(f => f.tarif > 0).length;
  const cles = Object.keys(b.TARIFS).length;
  const mesures = [
    ['fiches au catalogue', cat.length, PLANCHERS.fiches],
    ['fiches chiffrées', chiffrees, PLANCHERS.chiffrees],
    ['clés au relevé', cles, PLANCHERS.cles]
  ];
  for (const [quoi, valeur, plancher] of mesures) {
    if (valeur >= plancher) bon(`${valeur} ${quoi} (plancher ${plancher})`);
    else echec(`${quoi} : ${valeur}, en dessous du plancher de ${plancher}`);
  }
  const part = Math.round(chiffrees / cat.length * 100);
  console.log(`  · ${part} % du catalogue porte un prix`);

  const abimees = cat.filter(f => MOJIBAKE.test([f.name, f.module, f.vitola].filter(Boolean).join(' ')));
  if (abimees.length) echec(`${abimees.length} fiche(s) au nom abîmé, dont ${abimees[0].id} « ${abimees[0].name} »`);
  else bon('aucun nom abîmé par un accent perdu');

  return fautes;
}

module.exports = epreuves;

if (require.main === module) {
  const racine = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..');
  const fautes = epreuves(racine);
  console.log('');
  if (fautes) {
    console.error(`${fautes} épreuve(s) échouée(s). Ne poussez pas en l'état.`);
    process.exit(1);
  }
  console.log('Toutes les épreuves passent.');
}
