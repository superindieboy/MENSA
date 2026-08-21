/* Extrait, de chaque revue, les couples (cigare, intensité).
 *
 * La pastille se lit A/B/C — remplie, à moitié, vide — soit 3, 2, 1. Elle
 * termine le bloc de sa dégustation, et le titre du cigare l'ouvre : marque et
 * vitole s'y écrivent plus gros que le corps du texte. On délimite donc le
 * bloc par les pastilles elles-mêmes, dans la colonne, et l'on y cherche le
 * texte de grande taille. Les dimensions, quand elles y figurent, servent de
 * contre-épreuve à l'appariement.
 */
const { charger, inflate, tableDePolice, runs } = require('./lire-pdf.js');

const RANG = { C: 1, B: 2, A: 3 };

/* Le vocabulaire des arômes, et lui seul.
   On relève des descripteurs, non des phrases : « cèdre » est un fait, la
   façon dont une revue l'écrit lui appartient. Chaque terme retenu existe
   déjà au catalogue, écrit comme les membres l'écrivent. L'ordre compte :
   « sous-bois » se cherche avant « bois », « chocolat noir » avant
   « chocolat », faute de quoi le plus court mangerait le plus précis. */
const AROMES = [
  ['sous-bois', /sous-\s?bois/i],
  ['chocolat noir', /chocolat\s+noir/i],
  ['pain grillé', /pain\s+grill|torr[ée]fi/i],
  ['fruits rouges', /fruits?\s+rouges?/i],
  ['fruits secs', /fruits?\s+secs?/i],
  ['café', /\bcaf[ée]|espresso|moka\b/i],
  ['cacao', /cacao/i],
  ['chocolat', /chocolat/i],
  ['cèdre', /c[èe]dre/i],
  ['cuir', /\bcuir/i],
  ['poivre', /poivr/i],
  ['épices', /[ée]pic[ée]|[ée]pices/i],
  ['terre', /\bterre|terreu/i],
  ['bois', /\bbois[éles]?\b|\bbois\b/i],
  ['noix', /\bnoix\b|ol[ée]agineu/i],
  ['noisette', /noisette/i],
  ['amande', /amande/i],
  ['miel', /\bmiel\b/i],
  ['vanille', /vanille/i],
  ['caramel', /caramel/i],
  ['réglisse', /r[ée]glisse/i],
  ['floral', /floral|\bfleurs?\b/i],
  ['herbacé', /herbac|v[ée]g[ée]tal/i],
  ['foin', /\bfoin\b/i],
  ['crème', /cr[èe]me|cr[ée]meu/i],
  ['beurre', /beurr/i],
  ['agrumes', /agrume|citron|orange/i],
  ['cannelle', /cannelle/i],
  ['muscade', /muscade/i],
  ['champignon', /champignon/i]
];
const MAX_AROMES = 5;
function aromesDuTexte(texte) {
  const t = ' ' + texte + ' ';
  const trouves = [];
  let reste = t;
  for (const [nom, re] of AROMES) {
    if (!re.test(reste)) continue;
    trouves.push(nom);
    reste = reste.replace(new RegExp(re.source, 'gi'), ' ');   // ne pas recompter le même mot
    if (trouves.length >= MAX_AROMES) break;
  }
  return trouves;
}

function polices(doc) {
  const tables = {}, familles = {};
  for (const [num, corps] of doc.objets) {
    if (!/\/Type\s*\/Font/.test(corps)) continue;
    const bf = corps.match(/\/BaseFont\s*\/([A-Za-z0-9+\-_]+)/);
    const t = tableDePolice(doc, num);
    for (const m of doc.brut.matchAll(new RegExp('\\/([A-Za-z]?[\\w.]*)\\s+' + num + '\\s+\\d+\\s+R', 'g'))) {
      if (t) tables[m[1]] = t;
      if (bf) familles[m[1]] = bf[1].replace(/^[A-Z]{6}\+/, '');
    }
  }
  return { tables, familles };
}

/* Les polices de la pastille : celles qui ne tracent que des A, des B et des C.
   Au pluriel, car un même caractère change de nom de ressource selon la page —
   R330 ici, R1246 trente pages plus loin. S'en tenir au nom le plus fréquent
   perdait la moitié des pastilles. On remonte donc à la famille. */
function policesDePastille(doc, familles) {
  const cand = {};
  for (const [, corps] of doc.objets) {
    const clair = inflate(corps);
    if (!clair) continue;
    let p = null;
    for (const m of clair.matchAll(/\/([A-Za-z]?[\w.]*)\s+[\d.]+\s+Tf|\(((?:\\.|[^)\\])*)\)\s*Tj/g)) {
      if (m[1] !== undefined) { p = m[1]; continue; }
      const t = (m[2] || '').trim(); if (!t) continue;
      const c = cand[p] = cand[p] || { abc: 0, autres: 0 };
      if (/^[ABC]$/.test(t)) c.abc++; else c.autres++;
    }
  }
  const gagnante = Object.entries(cand)
    .filter(([, c]) => c.abc >= 20 && c.abc > c.autres * 3)
    .sort((a, b) => b[1].abc - a[1].abc)[0];
  if (!gagnante) return null;
  const famille = familles[gagnante[0]];
  if (!famille) return new Set([gagnante[0]]);
  // tous les noms qui désignent cette même famille, et qui ne tracent qu'A/B/C
  const noms = new Set();
  for (const [nom, f] of Object.entries(familles))
    if (f === famille && (!cand[nom] || cand[nom].autres === 0)) noms.add(nom);
  return noms;
}

/* Une pastille : un A, un B ou un C seul, tracé en rouge. Le critère vaut pour
   les trois revues, qui emploient chacune leur police mais toutes le même
   rouge. Se fier au nom de la police échouait sur « L'amateur de cigare », où
   la lettre se dessine avec une police de texte ordinaire. */
const estPastille = r => r.rouge && /^[ABC]$/.test(r.t.trim());

function extraire(chemin) {
  const doc = charger(chemin);
  const { tables, familles } = polices(doc);
  const lots = [];
  let pastilles = 0;

  for (const [num, corps] of doc.objets) {
    const clair = inflate(corps);
    if (!clair) continue;
    const tous = runs(doc, clair, tables);
    const marques = tous.filter(estPastille);
    if (!marques.length) continue;
    pastilles += marques.length;
    const tailleDeLaPastille = marques[0].taille;

    for (const mq of marques) {
      // la colonne de la pastille, et le bloc qui la précède : jusqu'à la
      // pastille suivante au-dessus, qui appartient à une autre dégustation
      const colonne = tous.filter(r => Math.abs(r.x - mq.x) < 110);
      const plafond = marques
        .filter(o => o !== mq && Math.abs(o.x - mq.x) < 110 && o.y > mq.y)
        .reduce((h, o) => Math.min(h, o.y), Infinity);
      const bloc = colonne.filter(r => r.y > mq.y && r.y < plafond);

      /* Le titre, sans jamais nommer de police ni de taille absolue : la revue
         change de maquette d'un numéro à l'autre. On prend la taille la plus
         courante du bloc pour le corps du texte, et l'on retient ce qui la
         dépasse — en écartant le rouge, qui est la note et la pastille, et en
         se limitant aux premières lignes, le titre tenant en trois ou quatre. */
      const tailles = {};
      bloc.forEach(r => tailles[r.taille] = (tailles[r.taille] || 0) + r.t.length);
      const dominante = Object.entries(tailles).sort((a, b) => b[1] - a[1])[0];
      if (!dominante) { lots.push({ objet: num, rang: RANG[mq.t.trim()], titre: null, police: familles[mq.police] }); continue; }
      const corps = +dominante[0];
      /* Écarter tout le rouge coûtait la vitole, imprimée dans la même encre
         que la pastille. On n'écarte donc que ce que le rouge sert à noter :
         la pastille elle-même, et la suite de « a » de la note sur cinq. */
      const notation = r => r.rouge && /^[aA]+$|^[ABC]$/.test(r.t.trim());
      const gros = bloc.filter(r => r.taille > corps + 1 && !notation(r)
        && Math.abs(r.x - mq.x) < 70);
      if (!gros.length) { lots.push({ objet: num, rang: RANG[mq.t.trim()], titre: null, police: familles[mq.police] }); continue; }
      gros.sort((a, b) => b.y - a.y);
      const sommet = gros[0].y;
      const tete = gros.filter(r => sommet - r.y < 70);
      const maxi = Math.max(...tete.map(r => r.taille));
      const titre = tete.map(r => r.t.trim()).join(' ').replace(/\s+/g, ' ').trim();
      const texte = bloc.map(r => r.t).join(' ').replace(/\s+/g, ' ');
      const dim = texte.match(/(\d{2,3})\s*mm\s*[×x]\s*(\d{2})/);
      // la prose du bloc ne sort pas d'ici : on n'en retient que les arômes
      lots.push({
        objet: num, rang: RANG[mq.t.trim()], titre, police: familles[mq.police],
        vitole: tete.filter(r => r.taille === maxi).map(r => r.t.trim()).join(' ').trim(),
        length: dim ? +dim[1] : null, ring: dim ? +dim[2] : null,
        aromes: aromesDuTexte(texte)
      });
    }
  }
  const vues = new Set(lots.map(l => l.police).filter(Boolean));
  return { police: [...vues].join(', ') || '—', noms: vues.size, pastilles, lots };
}

module.exports = { extraire, RANG };

if (require.main === module) {
  for (const chemin of process.argv.slice(2)) {
    const r = extraire(chemin);
    const nommes = r.lots.filter(l => l.titre);
    console.log(`\n===== ${chemin.split(/[\\/]/).pop()}`);
    console.log(`police ${r.police} (${r.noms} noms) · ${r.pastilles} pastilles · ${nommes.length} avec un titre (${Math.round(nommes.length / (r.pastilles || 1) * 100)} %)`);
    nommes.slice(0, 12).forEach(l =>
      console.log(`   ${l.rang}/3  ${l.titre.slice(0, 42).padEnd(43)} ${(l.aromes || []).join(", ")}`));
  }
}
