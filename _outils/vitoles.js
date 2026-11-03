/* Rend aux fiches la vitole qui dort dans leur nom.
 *
 *   node _outils/vitoles.js            épreuve à blanc
 *   node _outils/vitoles.js --ecrire   applique
 *
 * « Alec Bradley Gatekeeper Robusto » n'a pas de vitole renseignée, et le mot
 * est pourtant là. Mille quatre-vingt-seize fiches sont dans ce cas, dont les
 * cent quarante-trois que le relevé vient d'ouvrir.
 *
 * Le vocabulaire n'est pas écrit à la main : il est relevé sur les fiches qui
 * portent DÉJÀ une vitole. Le catalogue sert de dictionnaire, comme pour les
 * accents — on ne lui apprend rien qu'il ne dise, et une vitole qu'il n'emploie
 * pas ne sera pas inventée.
 *
 * Deux prudences. La plus longue expression l'emporte, sans quoi « Petit
 * Corona » serait lu « Corona ». Et deux vitoles distinctes dans un même nom
 * font renoncer : on ne devine pas laquelle.
 *
 * Attention enfin à ce que la vitole déclenche. Elle entre dans motsDeFiche,
 * donc dans l'appariement par recouvrement du relevé — une fiche peut y gagner
 * un prix — et dans la fusion automatique des fiches jumelles. Les épreuves
 * ont le dernier mot.
 */
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const ecrire = process.argv.includes('--ecrire');
const SEUIL = 3;                   // une vitole vue moins souvent n'en est pas une

const nu = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function principal() {
  const brut = fs.readFileSync(path.join(RACINE, 'catalogue.json'), 'utf8');
  const fiches = JSON.parse(brut);

  /* Ce qui a le droit d'être une vitole.

     Le champ « vitole » du catalogue ne peut pas servir seul de dictionnaire :
     il range « Maduro », « Connecticut », « Reserva », « Nicaragua » parmi les
     vitoles — ce sont des capes, des lignes, des origines. S'en servir tel
     quel répandrait la confusion au lieu de la réparer.

     Le champ « module », lui, est la classification de format, et il est
     propre : ni Maduro, ni Connecticut, ni Reserva n'y paraissent une seule
     fois. Ses mots font donc le socle du vocabulaire.

     Il ne connaît pourtant pas tout : ni Toro, qui est la vitole la plus
     portée du catalogue après Robusto, ni Gordo, ni Lancero. Ces noms-là sont
     ceux du métier, pas une invention — on les ajoute, et la liste reste
     courte et relisible. */
  const motsDuModule = new Map();
  for (const f of fiches) {
    if (!f.module || f.module === '—') continue;
    for (const m of nu(f.module).replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9]+/))
      if (m.length > 3) motsDuModule.set(m, (motsDuModule.get(m) || 0) + 1);
  }
  const MOTS_DU_METIER = ['toro', 'gordo', 'gordito', 'lancero', 'lanceros', 'torpedo',
    'belicoso', 'perfecto', 'piramide', 'diadema', 'salomon', 'salomones', 'culebra',
    'gigante', 'magnum', 'rothschild', 'epicure', 'sublime', 'hermoso', 'campana',
    'dalia', 'cazador', 'coronita', 'canonazo', 'panetela', 'prominente', 'half'];
  const permis = new Set([...[...motsDuModule].filter(([, n]) => n >= 5).map(([m]) => m), ...MOTS_DU_METIER]);

  /* Les expressions, relevées sur les vitoles déjà portées — mais seules
     passent celles dont chaque mot est permis. */
  const compte = new Map();
  for (const f of fiches) {
    const v = f.vitola;
    if (!v || v === '—') continue;
    const mots = String(v).trim().split(/\s+/);
    if (mots.length > 2) continue;             // au-delà, c'est un nom de produit
    const k = nu(v.trim());
    if (k.length < 4) continue;
    const parties = k.split(/[^a-z0-9]+/).filter(x => x.length > 3);
    if (!parties.length || !parties.every(x => permis.has(x))) continue;
    const e = compte.get(k) || { n: 0, formes: new Map() };
    e.n++;
    e.formes.set(v.trim(), (e.formes.get(v.trim()) || 0) + 1);
    compte.set(k, e);
  }
  const vocabulaire = [...compte.entries()]
    .filter(([, e]) => e.n >= SEUIL)
    // la graphie la plus courante fait foi
    .map(([k, e]) => ({ k, n: e.n, forme: [...e.formes.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => b.k.length - a.k.length);   // le plus long d'abord
  console.log(`vocabulaire : ${vocabulaire.length} vitoles employées au moins ${SEUIL} fois`);
  console.log('   les plus courantes : ' + vocabulaire.slice().sort((a, b) => b.n - a.n).slice(0, 8)
    .map(v => v.forme + ' (' + v.n + ')').join(', '));

  const sans = fiches.filter(f => !f.vitola || f.vitola === '—');
  const trouvees = [], ambigues = [];
  for (const f of sans) {
    const nom = ' ' + nu(f.name).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
    const vus = [];
    for (const v of vocabulaire) {
      if (!nom.includes(' ' + v.k + ' ')) continue;
      // « Corona » dans « Petit Corona » ne compte pas deux fois
      if (vus.some(d => d.k.includes(v.k))) continue;
      vus.push(v);
    }
    if (!vus.length) continue;
    if (vus.length > 1) { ambigues.push({ f, vus: vus.map(v => v.forme) }); continue; }
    trouvees.push({ f, vitole: vus[0].forme });
  }

  console.log(`\nfiches sans vitole : ${sans.length}`);
  console.log(`   une vitole lue dans le nom : ${trouvees.length}`);
  console.log(`   deux vitoles, on renonce   : ${ambigues.length}`);
  if (ambigues.length) ambigues.slice(0, 4).forEach(a =>
    console.log('      ' + a.f.name.slice(0, 44).padEnd(44) + '  ' + a.vus.join(' / ')));

  const parVitole = {};
  trouvees.forEach(t => parVitole[t.vitole] = (parVitole[t.vitole] || 0) + 1);
  console.log('\n   ce qu\'on rendrait :');
  Object.entries(parVitole).sort((a, b) => b[1] - a[1]).slice(0, 12)
    .forEach(([v, n]) => console.log('      ' + String(n).padStart(4) + '  ' + v));
  console.log('\n   un échantillon :');
  trouvees.slice(0, 8).forEach(t => console.log('      ' + t.f.name.slice(0, 48).padEnd(48) + '  → ' + t.vitole));

  if (!ecrire || !trouvees.length) {
    if (!trouvees.length) console.log('\nRien à rendre.');
    else console.log('\n(épreuve à blanc — relancer avec --ecrire)');
    return 0;
  }

  /* Insertion ciblée : 491 prix sont écrits « 14.50 », et un aller-retour JSON
     les réécrirait tous en « 14.5 ». On touche donc le texte à l'endroit exact,
     et nulle part ailleurs. */
  let texte = brut;
  let poses = 0;
  for (const t of trouvees) {
    const ancre = `{"id":"${t.f.id}"`;
    const i = texte.indexOf(ancre);
    if (i < 0) continue;
    let p = 0, j = i;
    for (; j < texte.length; j++) {
      if (texte[j] === '{') p++;
      else if (texte[j] === '}') { p--; if (!p) break; }
    }
    if (p !== 0) continue;
    texte = texte.slice(0, j) + ',"vitola":' + JSON.stringify(t.vitole) + texte.slice(j);
    poses++;
  }
  const relu = JSON.parse(texte);
  if (relu.length !== fiches.length) throw new Error('le nombre de fiches a changé : rien écrit');
  const gagnees = relu.filter(f => f.vitola && f.vitola !== '—').length
    - fiches.filter(f => f.vitola && f.vitola !== '—').length;
  if (gagnees !== poses) throw new Error(`${poses} posées mais ${gagnees} gagnées : rien écrit`);
  fs.writeFileSync(path.join(RACINE, 'catalogue.json'), texte);
  console.log(`\nécrit : ${poses} vitoles rendues.`);
  return 0;
}

process.exit(principal());
