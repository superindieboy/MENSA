/* Met le relevé à jour, tout seul.
 *
 *   node _outils/tarif/mettre-a-jour.js            épreuve à blanc
 *   node _outils/tarif/mettre-a-jour.js --ecrire   met à jour les fichiers
 *
 * Quatre gestes, dans cet ordre — l'ordre compte, le troisième ayant besoin de
 * l'ancien relevé encore en place :
 *   1. trouver la nomenclature la plus récente sur le portail de la douane ;
 *   2. la lire ;
 *   3. porter les nouveaux prix sur les fiches qui tenaient les anciens ;
 *   4. écrire le relevé, son précédent, et la date affichée par l'app.
 *
 * Une fiche dont le prix ne vient pas du relevé — une correction de membre —
 * n'est jamais touchée. C'est la règle de tout ce dossier : on remplit le
 * vide, on ne remplace pas une décision humaine.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { relever } = require('./relever-ods.js');

const RACINE = path.join(__dirname, '..', '..');
const PORTAIL = 'https://www.douane.gouv.fr/la-douane/opendata/categories/tabacs-manufactures';
const ecrire = process.argv.includes('--ecrire');

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/* La page liste toutes les nomenclatures publiées, la plus récente comme les
   anciennes. On les date par leur libellé — « 1er septembre 2026 » — et non
   par leur place dans la page, qui ne garantit rien. */
async function derniereNomenclature() {
  const r = await fetch(PORTAIL, { redirect: 'follow' });
  if (!r.ok) throw new Error('portail douane : HTTP ' + r.status);
  const html = await r.text();
  const vus = new Map();
  for (const m of html.matchAll(/href="([^"]*Maquette[^"]*\.ods)"/gi)) {
    const url = new URL(m[1].replace(/&amp;/g, '&'), PORTAIL).href;
    const libelle = decodeURIComponent(m[1]);
    const d = libelle.match(/1er\s+([a-zéûô]+)\s+(\d{4})/i);
    if (!d) continue;
    const mois = MOIS.indexOf(d[1].toLowerCase());
    if (mois < 0) continue;
    const quand = new Date(Date.UTC(+d[2], mois, 1));
    if (!vus.has(url)) vus.set(url, { url, quand, texte: `1er ${d[1]} ${d[2]}` });
  }
  const toutes = [...vus.values()].sort((a, b) => b.quand - a.quand);
  if (!toutes.length) throw new Error("aucune nomenclature trouvée : la page a-t-elle changé de forme ?");
  return toutes[0];
}

async function telecharger(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('téléchargement : HTTP ' + r.status);
  const fichier = path.join(os.tmpdir(), 'nomenclature-' + Date.now() + '.ods');
  fs.writeFileSync(fichier, Buffer.from(await r.arrayBuffer()));
  return fichier;
}

/* La clé du relevé et les mots d'une fiche, empruntés à l'application. */
function outilsDeLApp() {
  const src = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8').split('\n');
  const bloc = debut => {
    const i = src.findIndex(l => l.startsWith(debut));
    if (i < 0) throw new Error('introuvable dans index.html : ' + debut);
    if (!debut.startsWith('function')) {
      for (let j = i; j < src.length; j++) if (/;\s*$/.test(src[j])) return src.slice(i, j + 1).join('\n');
    }
    let p = 0;
    for (let j = i; j < src.length; j++) {
      for (const c of src[j]) { if (c === '{') p++; else if (c === '}') p--; }
      if (p === 0 && src[j].includes('}')) return src.slice(i, j + 1).join('\n');
    }
    throw new Error('bloc non terminé : ' + debut);
  };
  const banc = {};
  vm.createContext(banc);
  vm.runInContext(['const MOTS_VIDES=new Set(', 'function normCigar(s)', 'function cleTarif(nom)',
    'function motsDeFiche(c)'].map(bloc).join('\n'), banc);
  return banc;
}

/* Quelle ligne du relevé répond du prix d'une fiche : son nom, ou l'entrée
   qu'elle recouvre entièrement. À défaut d'unicité, c'est le prix lui-même qui
   tranche — une seule des entrées recouvertes vaut ce que la fiche affiche. */
function cleDeLaFiche(f, banc, ancien, neuf, motsDuReleve) {
  const k = banc.cleTarif(f.name);
  if (ancien[k] !== undefined || neuf[k] !== undefined) return k;
  const mots = new Set(banc.motsDeFiche(f));
  if (!mots.size) return null;
  const couvre = motsDuReleve.filter(e => e.mots.every(x => mots.has(x)));
  if (couvre.length === 1) return couvre[0].k;
  const auPrix = couvre.filter(e => ancien[e.k] === f.tarif);
  return auPrix.length === 1 ? auPrix[0].k : null;
}

async function principal() {
  const derniere = await derniereNomenclature();
  const ancien = JSON.parse(fs.readFileSync(path.join(RACINE, 'tarifs.json'), 'utf8'));
  const source = (fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8')
    .match(/const TARIF_SOURCE='([^']*)'/) || [])[1] || '';
  console.log(`nomenclature la plus récente : ${derniere.texte}`);
  console.log(`relevé en place             : ${source} (${Object.keys(ancien).length} clés)`);
  if (source === 'Au ' + derniere.texte) {
    console.log('\nRien à faire : le relevé est déjà celui-là.');
    return 0;
  }

  const fichier = await telecharger(derniere.url);
  const { nouveaux, anciens, applicable, produits } = relever(fichier);
  fs.unlinkSync(fichier);
  console.log(`lu                          : ${produits} produits, ${Object.keys(nouveaux).length} clés`);
  if (Object.keys(nouveaux).length < 2000)
    throw new Error(`relevé anormalement court (${Object.keys(nouveaux).length} clés) : on n'écrit rien`);

  // les fiches qui tenaient leur prix de l'ancien relevé suivent le nouveau
  const banc = outilsDeLApp();
  const motsDuReleve = Object.keys(nouveaux).map(k => ({ k, mots: k.split(' ') }));
  let brut = fs.readFileSync(path.join(RACINE, 'catalogue.json'), 'utf8');
  const fiches = JSON.parse(brut);
  const aPorter = [];
  for (const f of fiches) {
    if (!(f.tarif > 0)) continue;
    const cle = cleDeLaFiche(f, banc, ancien, nouveaux, motsDuReleve);
    if (!cle || nouveaux[cle] === undefined) continue;
    // un prix qui s'écarte de l'ancien relevé est une correction : on la garde
    if (ancien[cle] !== undefined && Math.abs(f.tarif - ancien[cle]) > 0.005) continue;
    if (Math.abs(f.tarif - nouveaux[cle]) < 0.005) continue;
    aPorter.push({ f, vers: nouveaux[cle] });
  }
  console.log(`prix à porter aux fiches    : ${aPorter.length}`);
  aPorter.slice(0, 8).forEach(x => console.log(`   ${String(x.f.tarif).padStart(7)} → ${String(x.vers).padEnd(7)} ${x.f.name.slice(0, 44)}`));

  if (!ecrire) { console.log('\n(épreuve à blanc — relancer avec --ecrire)'); return 0; }

  for (const x of aPorter) {
    const ancre = `{"id":"${x.f.id}"`;
    const i = brut.indexOf(ancre);
    if (i < 0) continue;
    let p = 0, j = i;
    for (; j < brut.length; j++) {
      if (brut[j] === '{') p++;
      else if (brut[j] === '}') { p--; if (!p) { j++; break; } }
    }
    const corps = brut.slice(i, j);
    if (!/"tarif":[\d.]+/.test(corps)) continue;
    brut = brut.slice(0, i) + corps.replace(/"tarif":[\d.]+/, `"tarif":${x.vers}`) + brut.slice(j);
  }
  const relu = JSON.parse(brut);
  if (relu.length !== fiches.length) throw new Error('le nombre de fiches a changé : rien écrit');
  fs.writeFileSync(path.join(RACINE, 'catalogue.json'), brut);
  fs.writeFileSync(path.join(RACINE, 'tarifs.json'), JSON.stringify(nouveaux));
  fs.writeFileSync(path.join(RACINE, 'tarifs-precedent.json'), JSON.stringify(anciens));

  const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  fs.writeFileSync(path.join(RACINE, 'index.html'),
    html.replace(/const TARIF_SOURCE='[^']*'/, `const TARIF_SOURCE='Au ${applicable || derniere.texte}'`));
  console.log(`\nécrit : relevé au ${applicable || derniere.texte}, ${aPorter.length} fiches reprises.`);
  return 0;
}

principal().catch(e => { console.error('échec : ' + (e && e.message)); process.exit(1); });
