/* Le jeu d'icônes de MENSA.

   Pleines, pas au trait. À 14 ou 16 px — la taille des onglets et des titres
   de rail — un contour de 1,1 px tombe entre deux pixels et grisaille ; une
   forme pleine tient. Elles s'accordent aussi mieux au noir de la Baskerville,
   qui est une police à fort contraste, pas un filet.

   Toutes sur une grille de 20, toutes en currentColor : elles suivent donc
   l'encre, le cognac et le thème sombre sans qu'on ait à les redessiner.

   Le remplissage est non-nul, jamais pair-impair. C'est ce qui permet à deux
   formes de se souder quand elles se chevauchent — la hampe et la pointe
   d'une flèche, les deux barres d'une croix — au lieu de se trouer l'une
   l'autre. Les contre-formes sont donc percées explicitement par troue(), qui
   compare les aires algébriques et ne retourne la forme intérieure que si
   elle tourne déjà dans le même sens que l'extérieure. Deviner ce sens à
   l'écriture ne marche pas : une forme miroitée garde le sien.

   Quelques-unes viennent du sujet plutôt que d'une bibliothèque : un cigare
   bagué pour la liste d'envies, un humidor pour la cave, une volute pour ce
   qui monte, une bougie pour les séances, un sceau à rubans pour le club.
   C'est là que se voit la main. */

const K = 0.5522847498;
const n = v => (Math.round(v * 100) / 100).toString();

/* ---- primitives -------------------------------------------------------- */

function cercle(cx, cy, r) {
  const k = r * K;
  return `M${n(cx)} ${n(cy - r)}`
    + `C${n(cx + k)} ${n(cy - r)} ${n(cx + r)} ${n(cy - k)} ${n(cx + r)} ${n(cy)}`
    + `C${n(cx + r)} ${n(cy + k)} ${n(cx + k)} ${n(cy + r)} ${n(cx)} ${n(cy + r)}`
    + `C${n(cx - k)} ${n(cy + r)} ${n(cx - r)} ${n(cy + k)} ${n(cx - r)} ${n(cy)}`
    + `C${n(cx - r)} ${n(cy - k)} ${n(cx - k)} ${n(cy - r)} ${n(cx)} ${n(cy - r)}Z`;
}

function rect(x, y, l, h, r = 0) {
  if (!r) return `M${n(x)} ${n(y)}L${n(x + l)} ${n(y)}L${n(x + l)} ${n(y + h)}L${n(x)} ${n(y + h)}Z`;
  const k = r * K;
  return `M${n(x + r)} ${n(y)}L${n(x + l - r)} ${n(y)}`
    + `C${n(x + l - r + k)} ${n(y)} ${n(x + l)} ${n(y + r - k)} ${n(x + l)} ${n(y + r)}`
    + `L${n(x + l)} ${n(y + h - r)}`
    + `C${n(x + l)} ${n(y + h - r + k)} ${n(x + l - r + k)} ${n(y + h)} ${n(x + l - r)} ${n(y + h)}`
    + `L${n(x + r)} ${n(y + h)}`
    + `C${n(x + r - k)} ${n(y + h)} ${n(x)} ${n(y + h - r + k)} ${n(x)} ${n(y + h - r)}`
    + `L${n(x)} ${n(y + r)}`
    + `C${n(x)} ${n(y + r - k)} ${n(x + r - k)} ${n(y)} ${n(x + r)} ${n(y)}Z`;
}
const poly = pts => 'M' + pts.map(p => n(p[0]) + ' ' + n(p[1])).join('L') + 'Z';

/* un trait épais, à terminaisons droites — les bouts arrondis sont la
   signature de tous les jeux d'icônes par défaut */
function trait(x1, y1, x2, y2, ep) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  const px = -dy / L * ep / 2, py = dx / L * ep / 2;
  return poly([[x1 + px, y1 + py], [x2 + px, y2 + py], [x2 - px, y2 - py], [x1 - px, y1 - py]]);
}

/* ---- outils de tracé --------------------------------------------------- */

/* Découpe un tracé en segments. M/L/C/Z seulement : c'est tout ce qu'on
   produit ici. */
function segments(d) {
  const seg = [];
  let x = 0, y = 0, dep = null;
  for (const m of d.matchAll(/([MLCZ])([^MLCZ]*)/g)) {
    const v = m[2].trim() ? m[2].trim().split(/[\s,]+/).map(Number) : [];
    if (m[1] === 'M') { dep = [v[0], v[1]]; x = v[0]; y = v[1]; }
    else if (m[1] === 'L') { seg.push({ t: 'L', de: [x, y], a: [v[0], v[1]] }); x = v[0]; y = v[1]; }
    else if (m[1] === 'C') { seg.push({ t: 'C', de: [x, y], c1: [v[0], v[1]], c2: [v[2], v[3]], a: [v[4], v[5]] }); x = v[4]; y = v[5]; }
    else if (m[1] === 'Z' && dep) {
      if (x !== dep[0] || y !== dep[1]) seg.push({ t: 'L', de: [x, y], a: dep });
      x = dep[0]; y = dep[1];
    }
  }
  return seg;
}

/* Retourne le sens de parcours d'un tracé. */
function inverser(d) {
  const seg = segments(d);
  if (!seg.length) return '';
  let out = `M${n(seg[seg.length - 1].a[0])} ${n(seg[seg.length - 1].a[1])}`;
  for (let i = seg.length - 1; i >= 0; i--) {
    const s = seg[i];
    if (s.t === 'L') out += `L${n(s.de[0])} ${n(s.de[1])}`;
    else out += `C${n(s.c2[0])} ${n(s.c2[1])} ${n(s.c1[0])} ${n(s.c1[1])} ${n(s.de[0])} ${n(s.de[1])}`;
  }
  return out + 'Z';
}

/* L'aire algébrique : son signe donne le sens de parcours. On aplatit
   grossièrement les courbes — seul le signe compte. */
function aire(d) {
  const pts = [];
  for (const s of segments(d)) {
    if (s.t === 'L') pts.push(s.a);
    else for (let i = 1; i <= 8; i++) {
      const t = i / 8, u = 1 - t, p = s.de;
      pts.push([u*u*u*p[0] + 3*u*u*t*s.c1[0] + 3*u*t*t*s.c2[0] + t*t*t*s.a[0],
                u*u*u*p[1] + 3*u*u*t*s.c1[1] + 3*u*t*t*s.c2[1] + t*t*t*s.a[1]]);
    }
  }
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/* Perce une forme. On ne suppose rien du sens dans lequel la contre-forme a
   été écrite : on compare les aires, et on ne retourne que si nécessaire. */
function troue(exterieur, ...interieurs) {
  const s = Math.sign(aire(exterieur));
  return exterieur + interieurs.map(d => Math.sign(aire(d)) === s ? inverser(d) : d).join('');
}

/* Fait tourner un tracé autour d'un point. */
function tourner(d, cx, cy, deg) {
  const a = deg * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
  const T = (x, y) => [cx + (x - cx) * co - (y - cy) * si, cy + (x - cx) * si + (y - cy) * co];
  let out = '';
  for (const m of d.matchAll(/([MLCZ])([^MLCZ]*)/g)) {
    if (m[1] === 'Z') { out += 'Z'; continue; }
    const v = m[2].trim().split(/[\s,]+/).map(Number);
    const r = [];
    for (let i = 0; i < v.length; i += 2) { const p = T(v[i], v[i + 1]); r.push(n(p[0]), n(p[1])); }
    out += m[1] + r.join(' ');
  }
  return out;
}

/* ---- le jeu ------------------------------------------------------------ */

const E = 1.9;                       // l'épaisseur commune
const anneau = (cx, cy, r, ep) => troue(cercle(cx, cy, r), cercle(cx, cy, r - ep));
const ICONES = {};

ICONES.recherche = anneau(8.6, 8.6, 5.9, E) + trait(12.4, 12.4, 17.2, 17.2, E);

ICONES.cloche =
  poly([[4.2, 14.4], [5.7, 12.4], [5.7, 9.6], [14.3, 9.6], [14.3, 12.4], [15.8, 14.4]]) +
  `M5.7 10.2C5.7 6.6 7.6 4.4 10 4.4C12.4 4.4 14.3 6.6 14.3 10.2Z` +
  cercle(10, 3.3, 1.5) +
  `M7.9 15.6L12.1 15.6C12.1 17.2 11.2 18.2 10 18.2C8.8 18.2 7.9 17.2 7.9 15.6Z`;

// une croix d'un seul tenant : douze points, aucun chevauchement
ICONES.plus = (() => {
  const e = E / 2, a = 3.4, b = 16.6;
  return poly([[10 - e, a], [10 + e, a], [10 + e, 10 - e], [b, 10 - e], [b, 10 + e],
               [10 + e, 10 + e], [10 + e, b], [10 - e, b], [10 - e, 10 + e],
               [a, 10 + e], [a, 10 - e], [10 - e, 10 - e]]);
})();

ICONES.crayon =
  poly([[2.9, 17.1], [4.4, 12.8], [7.2, 15.6]]) +
  trait(5.9, 13.6, 14.4, 5.1, 3.7) +
  poly([[14.1, 2.9], [17.1, 5.9], [15.5, 7.5], [12.5, 4.5]]);

ICONES.fil = trait(3.2, 5.3, 16.8, 5.3, E) + trait(3.2, 10, 16.8, 10, E) + trait(3.2, 14.7, 11.8, 14.7, E);

// l'humidor : un coffre, son couvercle débordant et sa serrure
ICONES.humidor =
  troue(rect(2.8, 8.2, 14.4, 8.6, 1), rect(4.6, 10, 10.8, 5, .4)) +
  rect(1.6, 4.6, 16.8, 3.8, .9) +
  rect(8.9, 11.2, 2.2, 2.4, .4);

// un cigare bagué, incliné : couché, à 16 px, ce n'est plus qu'un tiret
ICONES.bague = tourner(
  troue(`M2.2 13.4L2.2 6.6L13.4 6.6C16.4 6.6 18.6 8.1 18.6 10C18.6 11.9 16.4 13.4 13.4 13.4Z`,
        rect(9.9, 6.6, 1.2, 6.8), rect(12.5, 6.6, 1.2, 6.8)),
  10, 10, -34);

ICONES.membre = cercle(10, 6.5, 3.4) +
  `M3.4 17.6C3.4 13.4 6.4 11.1 10 11.1C13.6 11.1 16.6 13.4 16.6 17.6Z`;

ICONES.membres = cercle(7.2, 6.6, 3) +
  `M1.2 17.6C1.2 13.7 3.9 11.5 7.2 11.5C10.5 11.5 13.2 13.7 13.2 17.6Z` +
  cercle(14.6, 7.4, 2.4) +
  `M12.2 12.5C13 12.3 13.8 12.2 14.6 12.2C17.2 12.2 18.8 13.9 18.8 17.6L15.4 17.6C15.4 15.4 14.2 13.5 12.2 12.5Z`;

// le club : un sceau et ses rubans. Des anneaux concentriques auraient fait
// une cible — précisément l'émoji qu'on remplace
ICONES.cercle =
  poly([[6.3, 11.4], [9.1, 11.4], [9.1, 18.8], [7.7, 17.3], [6.3, 18.8]]) +
  poly([[10.9, 11.4], [13.7, 11.4], [13.7, 18.8], [12.3, 17.3], [10.9, 18.8]]) +
  anneau(10, 7.8, 6.4, 1.6) +
  cercle(10, 7.8, 2.5);

// à votre goût : une rosace, comme une roue des arômes
ICONES.gout = (() => {
  let d = cercle(10, 10, 2.6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    d += cercle(10 + Math.cos(a) * 6, 10 + Math.sin(a) * 6, 2.1);
  }
  return d;
})();

// ce qui monte : une volute
ICONES.fumee =
  `M11.4 18C7.5 18 6 15.7 6 13.6C6 10.7 8.6 9.5 8.6 7.2C8.6 5.5 7.8 4 6.4 2.3`
  + `C10.3 3.4 11.6 5.9 11.6 7.8C11.6 10.5 9.1 11.6 9.1 13.6C9.1 15 9.9 16.5 11.4 18Z`
  + `M14.1 17.6C16.5 16.3 17.6 14.4 17.6 12.5C17.6 10 15.7 8.1 13.3 7.2`
  + `C14.2 8.7 14.5 10 14.5 11.1C14.5 13.4 13.2 15.1 12.1 16.6Z`;

ICONES.etoile = (() => {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 3.6 : 8.6;
    p.push([10 + Math.cos(a) * r, 10 + Math.sin(a) * r]);
  }
  return poly(p);
})();

// le prix : une étiquette et son œillet
ICONES.prix = troue(
  poly([[2.2, 10], [10, 2.2], [17.8, 2.2], [17.8, 10], [10, 17.8]]),
  cercle(14.2, 5.8, 1.6));

ICONES.cadeau =
  rect(2.9, 9, 14.2, 8.6, .8) + rect(1.9, 5.3, 16.2, 3.7, .6) +
  trait(10, 5.3, 10, 17.6, 1.7) +
  `M10 5.5C10 5.5 7.3 5.7 5.9 5C4.7 4.4 4.7 2.8 5.9 2.3C7.6 1.6 9.4 3.5 10 5.5Z` +
  `M10 5.5C10 5.5 12.7 5.7 14.1 5C15.3 4.4 15.3 2.8 14.1 2.3C12.4 1.6 10.6 3.5 10 5.5Z`;

ICONES.calendrier =
  troue(rect(2.4, 4.1, 15.2, 13.5, 1.3), rect(4.2, 8.3, 11.6, 7.5, .5)) +
  rect(5.5, 2.1, 1.9, 3.7, .95) + rect(12.6, 2.1, 1.9, 3.7, .95);

// la bougie des séances : corps étroit, mèche, flamme en goutte
ICONES.bougie =
  rect(8.1, 9.4, 3.8, 7.6, .5) + rect(5.6, 17, 8.8, 1.8, .6) +
  trait(10, 8.2, 10, 9.6, .8) +
  `M10 1.6C12.2 4.1 13.1 5.6 13.1 7C13.1 8.7 11.7 9.9 10 9.9C8.3 9.9 6.9 8.7 6.9 7C6.9 5.6 7.8 4.1 10 1.6Z`;

ICONES.lieu = troue(
  `M10 18.6C10 18.6 3.3 12.3 3.3 8.2C3.3 4.6 6.3 1.9 10 1.9C13.7 1.9 16.7 4.6 16.7 8.2C16.7 12.3 10 18.6 10 18.6Z`,
  cercle(10, 8.2, 2.4));

const COEUR = `M10 17.6C10 17.6 2.1 12.5 2.1 7.4C2.1 4.7 4.2 2.9 6.5 2.9C8.1 2.9 9.3 3.7 10 5C10.7 3.7 11.9 2.9 13.5 2.9C15.8 2.9 17.9 4.7 17.9 7.4C17.9 12.5 10 17.6 10 17.6Z`;
const COEUR_DEDANS = `M10 15.2C11.8 13.9 15.7 10.6 15.7 7.4C15.7 5.9 14.7 5.1 13.5 5.1C12.3 5.1 11.5 5.9 10.9 7.4L9.1 7.4C8.5 5.9 7.7 5.1 6.5 5.1C5.3 5.1 4.3 5.9 4.3 7.4C4.3 10.6 8.2 13.9 10 15.2Z`;
ICONES.coeurPlein = COEUR;
ICONES.coeur = troue(COEUR, COEUR_DEDANS);

const BULLE = `M10 2.4C14.9 2.4 18.6 5.5 18.6 9.5C18.6 13.5 14.9 16.6 10 16.6C9 16.6 8.1 16.5 7.2 16.3L2.8 18.4L4.1 14.6C2.4 13.3 1.4 11.5 1.4 9.5C1.4 5.5 5.1 2.4 10 2.4Z`;
const BULLE_DEDANS = `M10 4.8C6.1 4.8 3.8 7 3.8 9.5C3.8 10.9 4.5 12.2 5.8 13.2L6.9 14L6.3 15.4L7.8 14.7C8.5 14.8 9.2 14.9 10 14.9C13.9 14.9 16.2 12.6 16.2 9.5C16.2 7 13.9 4.8 10 4.8Z`;
ICONES.bulle = troue(BULLE, BULLE_DEDANS);

ICONES.photo =
  troue(rect(1.7, 5.1, 16.6, 12.5, 1.4), rect(3.5, 6.9, 13, 8.9, .6)) +
  poly([[6.5, 2.9], [13.5, 2.9], [12.7, 5.1], [7.3, 5.1]]) +
  anneau(10, 11.4, 3.5, 1.7);

ICONES.coche = poly([[3.1, 10.1], [4.9, 8.3], [8.1, 11.5], [15.1, 4.2], [16.9, 6], [8.1, 15.3]]);

// flèche et retour : un seul contour chacune, donc aucune encoche possible
ICONES.fleche = poly([[8.4, 4.3], [15.7, 4.3], [15.7, 11.6], [13.8, 11.6], [13.8, 7.5],
                      [5.7, 15.6], [4.4, 14.3], [12.5, 6.2], [8.4, 6.2]]);
ICONES.retour = (() => {
  const e = E / 2;
  return poly([[9.4, 3.6], [10.8, 5], [6.8, 10 - e], [16.6, 10 - e], [16.6, 10 + e],
               [6.8, 10 + e], [10.8, 15], [9.4, 16.4], [3, 10]]);
})();

module.exports = { ICONES };

/* ---- planche de contrôle ----------------------------------------------- */
if (require.main === module) {
  const fs = require('fs');
  const noms = Object.keys(ICONES);
  const COL = 5, CASE = 96, PAD = 20;
  const lignes = Math.ceil(noms.length / COL);
  const L = COL * CASE + PAD * 2, H = lignes * CASE + PAD * 2;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${H}" width="${L}" height="${H}">\n`;
  s += `  <rect x="0" y="0" width="${L}" height="${H}" fill="#F4EEDF"/>\n`;
  noms.forEach((nom, i) => {
    const x = PAD + (i % COL) * CASE, y = PAD + Math.floor(i / COL) * CASE;
    s += `  <g transform="translate(${x + 6},${y + 8}) scale(2.2)" fill="#2A1B0F"><path d="${ICONES[nom]}"/></g>\n`;
    s += `  <g transform="translate(${x + 56},${y + 30}) scale(0.8)" fill="#2A1B0F"><path d="${ICONES[nom]}"/></g>\n`;
    s += `  <g transform="translate(${x + 74},${y + 34}) scale(0.6)" fill="#6E5C49"><path d="${ICONES[nom]}"/></g>\n`;
  });
  s += '</svg>\n';
  fs.writeFileSync(__dirname + '/icones/planche.svg', s);
  console.log(`${noms.length} icônes · planche ${L} × ${H}`);
  for (let i = 0; i < noms.length; i += COL) console.log('   ' + noms.slice(i, i + COL).join('  ·  '));
}
