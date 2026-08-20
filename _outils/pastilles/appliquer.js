/* Verse les intensités relevées dans les revues au catalogue.
   L'échelle des revues va de 1 à 3, celle de l'application de 1 à 5 : on place
   chaque niveau au centre de sa bande — 1, 3, 5 — sans rien inventer entre.
   Écriture ciblée, fiche par fiche : le reste du fichier ne bouge pas.
   « --ecrire » pour écrire ; sans lui, on ne fait que rendre compte. */
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', '..');
const VERS_CINQ = { 1: 1, 2: 3, 3: 5 };
const LIBELLE = n => n >= 4 ? 'Corsé' : n <= 2 ? 'Doux' : 'Médium';
const ecrire = process.argv.includes('--ecrire');

const retenus = JSON.parse(fs.readFileSync(path.join(__dirname, 'intensites.json'), 'utf8'));
let brut = fs.readFileSync(path.join(RACINE, 'catalogue.json'), 'utf8');
const fiches = JSON.parse(brut);
const parId = new Map(fiches.map(f => [f.id, f]));

const accord = [], desaccord = [], aRemplir = [], introuvables = [];
for (const r of retenus) {
  const f = parId.get(r.id);
  if (!f) { introuvables.push(r); continue; }
  const vise = VERS_CINQ[r.rang];
  if (f.strength) {
    // la fiche portait déjà une intensité : elle sert d'épreuve, non de cible
    (LIBELLE(f.strength) === LIBELLE(vise) ? accord : desaccord)
      .push({ id: f.id, nom: f.name, avait: f.strength, revue: vise });
  } else aRemplir.push({ id: f.id, nom: f.name, vise });
}
console.log(`retenus des revues     ${retenus.length}`);
console.log(`déjà notées            ${accord.length + desaccord.length}`);
console.log(`   même bande          ${accord.length}`);
console.log(`   bande différente    ${desaccord.length}`);
console.log(`à remplir              ${aRemplir.length}`);
if (introuvables.length) console.log(`identifiants inconnus  ${introuvables.length}`);
if (desaccord.length) {
  console.log('\n--- désaccords avec la note existante ---');
  desaccord.forEach(d => console.log(`   ${d.id}  ${d.nom.slice(0, 40).padEnd(41)} fiche ${d.avait}/5 (${LIBELLE(d.avait)})  revue ${d.revue}/5 (${LIBELLE(d.revue)})`));
}

if (!ecrire) { console.log('\n(épreuve à blanc — relancer avec --ecrire)'); process.exit(0); }

/* Chaque fiche est un objet du tableau : on le délimite à partir de son
   identifiant, sans toucher à ses voisins. */
let faits = 0, rates = 0;
for (const r of aRemplir) {
  const ancre = `{"id":"${r.id}"`;
  const i = brut.indexOf(ancre);
  if (i < 0) { rates++; continue; }
  let p = 0, j = i;
  for (; j < brut.length; j++) {
    if (brut[j] === '{') p++;
    else if (brut[j] === '}') { p--; if (!p) { j++; break; } }
  }
  const avant = brut.slice(i, j);
  let apres;
  if (/"strength":null/.test(avant)) {
    apres = avant.replace('"strength":null', `"strength":${r.vise}`)
      .replace('"force":""', `"force":"${LIBELLE(r.vise)}"`);
    if (!/"force":"/.test(apres)) apres = apres.replace(/}$/, `,"force":"${LIBELLE(r.vise)}"}`);
  } else if (!/"strength":/.test(avant)) {
    apres = avant.replace(/}$/, `,"strength":${r.vise},"force":"${LIBELLE(r.vise)}"}`);
  } else { rates++; continue; }
  brut = brut.slice(0, i) + apres + brut.slice(j);
  faits++;
}
const relu = JSON.parse(brut);
if (relu.length !== fiches.length) { console.error('le nombre de fiches a changé — rien écrit'); process.exit(1); }
fs.writeFileSync(path.join(RACINE, 'catalogue.json'), brut);
console.log(`\n${faits} fiches complétées, ${rates} laissées de côté`);
const d = {};
relu.filter(f => f.force).forEach(f => d[f.force] = (d[f.force] || 0) + 1);
console.log('intensités au catalogue :', JSON.stringify(d), '—', relu.filter(f => f.strength).length, 'fiches');
