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

/* La fiche technique : longueur, diamètre, pays, cape, sous-cape, tripe.
   On ne remplit que le vide, et l'on refuse en bloc dès que les dimensions
   connues des deux côtés se contredisent — ce n'est alors pas la fiche qui a
   tort, c'est l'appariement. Un pays rempli entraîne son terroir, faute de
   quoi le cigare resterait classé « autre » avec un pays écrit dessus. */
const CHAMPS_TECH = ['length', 'ring', 'country', 'wrapper', 'binder', 'filler'];
const TERROIRS = { 'Cuba': 'cuba', 'Nicaragua': 'nica', 'République dominicaine': 'rep',
  'Honduras': 'hon', 'Costa Rica': 'cr', 'Mexique': 'mex', 'Brésil': 'bre' };
const vide = v => v === null || v === undefined || v === '' || v === '—';

const accord = [], desaccord = [], aRemplir = [], introuvables = [], aromatiser = [], techniques = [];
const conflits = [];
for (const r of retenus) {
  const f = parId.get(r.id);
  if (!f) { introuvables.push(r); continue; }
  const t = r.tech || {};
  if (t.length && t.ring && f.length && f.ring
      && (Math.abs(f.length - t.length) > 4 || Math.abs(f.ring - t.ring) > 1)) {
    conflits.push({ id: f.id, nom: f.name, fiche: `${f.length}×${f.ring}`, revue: `${t.length}×${t.ring}` });
  } else {
    const champs = {};
    for (const c of CHAMPS_TECH) if (!vide(t[c]) && vide(f[c])) champs[c] = t[c];
    if (champs.country && (vide(f.terroir) || f.terroir === 'autre') && TERROIRS[champs.country])
      champs.terroir = TERROIRS[champs.country];
    if (Object.keys(champs).length) techniques.push({ id: f.id, nom: f.name, champs });
  }
  // les arômes ne remplacent jamais ceux d'une fiche qui en porte déjà
  if ((r.aromes || []).length && !(f.flavors && f.flavors.length))
    aromatiser.push({ id: f.id, nom: f.name, aromes: r.aromes });
  if (!r.rang) continue;
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
console.log(`arômes à poser         ${aromatiser.length}`);
console.log(`fiches techniques      ${techniques.length}`);
const parChamp = {};
techniques.forEach(t => Object.keys(t.champs).forEach(c => parChamp[c] = (parChamp[c] || 0) + 1));
console.log(`   champs gagnés       ${JSON.stringify(parChamp)}`);
if (conflits.length) {
  console.log(`\n--- ${conflits.length} dimensions contradictoires, écartées ---`);
  conflits.slice(0, 8).forEach(c => console.log(`   ${c.id}  ${c.nom.slice(0, 38).padEnd(39)} fiche ${c.fiche}  revue ${c.revue}`));
}
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
/* Les arômes, posés de la même façon : dans la fiche et nulle part ailleurs. */
let parfumees = 0;
for (const r of aromatiser) {
  const ancre = `{"id":"${r.id}"`;
  const i = brut.indexOf(ancre);
  if (i < 0) { rates++; continue; }
  let p = 0, j = i;
  for (; j < brut.length; j++) {
    if (brut[j] === '{') p++;
    else if (brut[j] === '}') { p--; if (!p) { j++; break; } }
  }
  const avant = brut.slice(i, j);
  const liste = JSON.stringify(r.aromes);
  let apres;
  if (/"flavors":\[\]/.test(avant)) apres = avant.replace('"flavors":[]', `"flavors":${liste}`);
  else if (!/"flavors":/.test(avant)) apres = avant.replace(/}$/, `,"flavors":${liste}}`);
  else { rates++; continue; }
  brut = brut.slice(0, i) + apres + brut.slice(j);
  parfumees++;
}

/* La fiche technique, champ par champ, dans l'objet de la fiche et nulle part
   ailleurs. Un champ absent s'ajoute, un champ vide se remplit ; rien d'autre
   n'est touché. */
let completees = 0;
for (const t of techniques) {
  const ancre = `{"id":"${t.id}"`;
  const i = brut.indexOf(ancre);
  if (i < 0) { rates++; continue; }
  let p = 0, j = i;
  for (; j < brut.length; j++) {
    if (brut[j] === '{') p++;
    else if (brut[j] === '}') { p--; if (!p) { j++; break; } }
  }
  let corps = brut.slice(i, j);
  for (const [champ, valeur] of Object.entries(t.champs)) {
    const v = typeof valeur === 'number' ? String(valeur) : JSON.stringify(valeur);
    const videRe = new RegExp(`"${champ}":(null|""|"—")`);
    if (videRe.test(corps)) corps = corps.replace(videRe, `"${champ}":${v}`);
    else if (!new RegExp(`"${champ}":`).test(corps)) corps = corps.replace(/}$/, `,"${champ}":${v}}`);
  }
  brut = brut.slice(0, i) + corps + brut.slice(j);
  completees++;
}

const relu = JSON.parse(brut);
if (relu.length !== fiches.length) { console.error('le nombre de fiches a changé — rien écrit'); process.exit(1); }
console.log(`${parfumees} fiches parfumées, ${completees} fiches complétées techniquement`);
fs.writeFileSync(path.join(RACINE, 'catalogue.json'), brut);
console.log(`\n${faits} fiches complétées, ${rates} laissées de côté`);
const d = {};
relu.filter(f => f.force).forEach(f => d[f.force] = (d[f.force] || 0) + 1);
console.log('intensités au catalogue :', JSON.stringify(d), '—', relu.filter(f => f.strength).length, 'fiches');
