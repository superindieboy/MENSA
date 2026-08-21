/* Trois temps, dans cet ordre :
     node _outils/pastilles/apparier.js <revue.pdf> [autres.pdf...]   → intensites.json
     node _outils/pastilles/appliquer.js                              → épreuve à blanc
     node _outils/pastilles/appliquer.js --ecrire                     → verse au catalogue
*/
/* Apparie les intensités relevées dans les revues avec les fiches du catalogue.
   On reprend la normalisation de l'application — celle qui apparie déjà les
   tarifs — et l'on refuse tout ce qui n'est pas certain : un nom qui désigne
   deux fiches ne vaut rien, et les dimensions servent de contre-épreuve. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { extraire } = require('./extraire.js');

const RACINE = path.join(__dirname, '..', '..');
const lignes = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8').split('\n');
function bloc(debut) {
  const i = lignes.findIndex(l => l.startsWith(debut));
  if (i < 0) throw new Error('introuvable : ' + debut);
  if (!debut.startsWith('function')) {
    for (let j = i; j < lignes.length; j++) if (/;\s*$/.test(lignes[j])) return lignes.slice(i, j + 1).join('\n');
  }
  let p = 0;
  for (let j = i; j < lignes.length; j++) {
    for (const c of lignes[j]) { if (c === '{') p++; else if (c === '}') p--; }
    if (p === 0 && lignes[j].includes('}')) return lignes.slice(i, j + 1).join('\n');
  }
  throw new Error('non terminé : ' + debut);
}
const banc = { TARIFS: {} };
vm.createContext(banc);
vm.runInContext(['const MOTS_VIDES=new Set(', 'function normCigar(s)', 'function cleTarif(nom)']
  .map(bloc).join('\n'), banc);

const catalogue = JSON.parse(fs.readFileSync(path.join(RACINE, 'catalogue.json'), 'utf8'));
const parCle = {};
for (const f of catalogue) {
  const k = banc.cleTarif(f.name);
  (parCle[k] = parCle[k] || []).push(f);
}
const motsDe = f => new Set(banc.cleTarif([f.name, f.vitola, f.module].filter(Boolean).join(' ')).split(' ').filter(Boolean));

const lots = [];
for (const chemin of process.argv.slice(2)) {
  const r = extraire(chemin);
  const revue = path.basename(chemin);
  (r.lots || []).filter(l => l.titre).forEach(l => lots.push({ ...l, revue }));
  console.error(`${revue} : ${r.pastilles} pastilles, ${(r.lots || []).filter(l => l.titre).length} titrées`);
}

const REFUS = /SIGNIFICATION|INDICES DE PUISSANCE|SOMMAIRE|ÉDITO|EDITO/i;
const resultats = [], echecs = [];
for (const l of lots) {
  if (REFUS.test(l.titre)) continue;
  const k = banc.cleTarif(l.titre);
  let candidats = parCle[k] || [];
  let voie = 'nom exact';
  if (!candidats.length) {
    // recouvrement : tous les mots du titre figurent dans la fiche
    const mots = k.split(' ').filter(Boolean);
    candidats = catalogue.filter(f => { const s = motsDe(f); return mots.every(m => s.has(m)); });
    voie = 'recouvrement';
  }
  // contre-épreuve par les dimensions
  if (candidats.length > 1 && l.length && l.ring) {
    const serres = candidats.filter(f => f.length && f.ring &&
      Math.abs(f.length - l.length) <= 3 && Math.abs(f.ring - l.ring) <= 1);
    if (serres.length) { candidats = serres; voie += ' + dimensions'; }
  }
  if (candidats.length === 1) {
    const f = candidats[0];
    if (l.length && l.ring && f.length && f.ring &&
      (Math.abs(f.length - l.length) > 4 || Math.abs(f.ring - l.ring) > 1)) {
      echecs.push({ ...l, raison: `dimensions incompatibles (fiche ${f.length}×${f.ring})` });
      continue;
    }
    resultats.push({ id: f.id, nom: f.name, rang: l.rang, voie, titre: l.titre, revue: l.revue, aromes: l.aromes || [] });
  } else echecs.push({ ...l, raison: candidats.length ? `${candidats.length} fiches` : 'aucune fiche' });
}

// une même vitole peut revenir dans plusieurs revues : on ne garde que
// l'unanimité, un désaccord valant aveu d'appariement douteux
const parFiche = {};
resultats.forEach(r => (parFiche[r.id] = parFiche[r.id] || []).push(r));
const retenus = [], discordants = [];
for (const [id, l] of Object.entries(parFiche)) {
  /* Les arômes, eux, s'additionnent : deux numéros qui décrivent le même
     cigare ne se contredisent pas, ils se complètent. On garde les plus
     souvent cités — cinq suffisent à dessiner un profil. */
  const compte = {};
  l.forEach(x => (x.aromes || []).forEach(a => compte[a] = (compte[a] || 0) + 1));
  const aromes = Object.entries(compte).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]);
  const rangs = [...new Set(l.map(x => x.rang))];
  if (rangs.length === 1) retenus.push({ id, nom: l[0].nom, rang: rangs[0], sources: l.length, aromes });
  // un désaccord sur l'intensité ne disqualifie pas les arômes : c'est la même
  // fiche, décrite deux fois, et seul le chiffre diverge
  else { discordants.push({ id, nom: l[0].nom, rangs: l.map(x => `${x.rang}/3 (${x.revue.slice(0, 12)})`) });
         if (aromes.length) retenus.push({ id, nom: l[0].nom, rang: null, sources: l.length, aromes }); }
}

console.log(`\nlots titrés          ${lots.length}`);
console.log(`appariés             ${resultats.length}`);
console.log(`fiches distinctes    ${Object.keys(parFiche).length}`);
console.log(`   dont unanimes     ${retenus.length}`);
console.log(`   dont discordants  ${discordants.length}`);
console.log(`non appariés         ${echecs.length}`);
const parRang = {};
retenus.forEach(r => parRang[r.rang] = (parRang[r.rang] || 0) + 1);
console.log('répartition retenue :', JSON.stringify(parRang));

console.log('\n--- vingt appariements ---');
retenus.slice(0, 20).forEach(r => console.log(`   ${r.rang}/3  ${r.id}  ${r.nom}`));
console.log('\n--- discordants ---');
discordants.slice(0, 10).forEach(d => console.log(`   ${d.id}  ${d.nom} : ${d.rangs.join(' vs ')}`));
console.log('\n--- vingt échecs ---');
echecs.slice(0, 20).forEach(e => console.log(`   ${e.raison.padEnd(26)} ${e.titre.slice(0, 55)}`));

fs.writeFileSync(path.join(__dirname, 'intensites.json'), JSON.stringify(retenus, null, 1));
console.log('\nécrit : intensites.json');
