/* Cherche un prix, pour les fiches qui n'en ont pas, dans les relevés passés.
 *
 *   node _outils/tarif/chercher-anciens.js
 *
 * On interroge chaque relevé exactement comme l'application interroge le
 * sien : par le nom d'abord, par recouvrement du format ensuite, et jamais
 * pour une fiche homonyme d'une autre — les mêmes règles, sinon le résultat
 * ne voudrait rien dire.
 *
 * Le script ne modifie rien. Un prix d'un relevé périmé n'est pas le prix
 * d'aujourd'hui, et l'écrire comme tel serait un mensonge : ce qu'il dit,
 * c'est ce qu'on pourrait retrouver, et à quelle date.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = path.join(__dirname, '..', '..');
const BAC = process.argv[2] || null;      // un dossier de relevés supplémentaires

function outilsDeLApp() {
  const src = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8').split('\n');
  const bloc = debut => {
    const i = src.findIndex(l => l.startsWith(debut));
    if (i < 0) throw new Error('introuvable : ' + debut);
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
  const banc = { TARIFS: {}, nomsPartages: {}, TARIFS_MOTS: null };
  vm.createContext(banc);
  vm.runInContext(['const MOTS_VIDES=new Set(', 'function normCigar(s)', 'function cleTarif(nom)',
    'function motsDeFiche(c)', 'function clesParCouverture(c)', 'function cleParCouverture(c)']
    .map(bloc).join('\n'), banc);
  return banc;
}

const banc = outilsDeLApp();
const fiches = JSON.parse(fs.readFileSync(path.join(RACINE, 'catalogue.json'), 'utf8'));

// le décompte des homonymes, comme le fait l'app avant de chiffrer
fiches.forEach(c => { const k = banc.normCigar(c.name); banc.nomsPartages[k] = (banc.nomsPartages[k] || 0) + 1; });

/* le prix qu'un relevé donné répond pour une fiche, selon les règles de l'app */
let dernier = null;
function prixDans(releve, c) {
  // le recouvrement met en cache les mots du relevé : changer de relevé l'invalide
  if (releve !== dernier) { banc.TARIFS = releve; banc.TARIFS_MOTS = null; dernier = releve; }
  const k = banc.cleTarif(c.name);
  if (k && releve[k] > 0) return { prix: releve[k], par: 'nom' };
  if (banc.nomsPartages[banc.normCigar(c.name)] > 1) return null;
  const kc = banc.cleParCouverture(c);
  return (kc && releve[kc] > 0) ? { prix: releve[kc], par: 'recouvrement' } : null;
}

const courant = JSON.parse(fs.readFileSync(path.join(RACINE, 'tarifs.json'), 'utf8'));
const orphelines = fiches.filter(c => !(c.tarif > 0) && !c.exclusivite && !prixDans(courant, c));
console.log(`fiches sans prix, relevé courant épuisé : ${orphelines.length}`);

const relevés = [['précédent (repo)', path.join(RACINE, 'tarifs-precedent.json')]];
if (BAC) for (const f of fs.readdirSync(BAC).filter(f => /tarifs.*.json$/.test(f)))
  relevés.push([f, path.join(BAC, f)]);

const trouve = new Map();
for (const [nom, chemin] of relevés) {
  if (!fs.existsSync(chemin)) { console.log(`   (${nom} : absent)`); continue; }
  const r = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  let n = 0, parNom = 0;
  for (const c of orphelines) {
    const t = prixDans(r, c);
    if (!t) continue;
    n++; if (t.par === 'nom') parNom++;
    if (!trouve.has(c.id)) trouve.set(c.id, { c, ...t, source: nom });
  }
  console.log(`   ${nom.padEnd(22)} ${String(Object.keys(r).length).padStart(5)} clés  →  ${String(n).padStart(3)} retrouvées  (${parNom} au nom, ${n - parNom} par recouvrement)`);
}

console.log(`\nau total, ${trouve.size} des ${orphelines.length} fiches auraient un prix dans un relevé passé`);
if (trouve.size) {
  console.log('\nun échantillon :');
  [...trouve.values()].slice(0, 12).forEach(t =>
    console.log(`   ${String(t.prix).padStart(7)} €  ${t.par.padEnd(13)} ${t.c.name.slice(0, 46)}`));
}
const restant = orphelines.length - trouve.size;
console.log(`\n${restant} fiches n'apparaissent dans aucun relevé, passé ou présent.`);
