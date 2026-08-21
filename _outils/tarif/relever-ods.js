/* Relève les prix homologués depuis la nomenclature officielle de la douane.
 *
 *   node _outils/tarif/relever-ods.js "<Maquette JORF ....ods>" [--ecrire]
 *
 * Le fichier se télécharge librement sur le portail open data de la DGDDI,
 * rubrique « tabacs manufacturés », publié en même temps que l'arrêté :
 *   https://www.douane.gouv.fr/la-douane/opendata/categories/tabacs-manufactures
 *
 * C'est la même maquette que le PDF du Journal officiel, mais en tableur : ni
 * ordre de flux à rétablir, ni police à décoder, ni colonne à deviner. Elle
 * remplace l'extraction PDF, qui lisait d'ailleurs la mauvaise colonne.
 *
 * Le tableau porte quatre colonnes de prix :
 *   1-2  les ANCIENS prix, à l'unité puis au conditionnement
 *   3-4  les NOUVEAUX, ou « Sans changement » s'ils ne bougent pas
 * D'où un relevé complet et son précédent, tirés d'un seul fichier : l'app
 * peut dire de combien un cigare a monté sans attendre l'arrêté suivant.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');

const RACINE = path.join(__dirname, '..', '..');

/* ---- Lecture du tableur ----
   Un ODS est un zip dont content.xml porte le tableau. Les en-têtes locaux du
   zip annoncent parfois une taille nulle : on passe donc par l'annuaire
   central, en fin de fichier, qui dit la vérité. */
function lignesDuTableur(chemin) {
  const buf = fs.readFileSync(chemin);
  let xml = null;
  for (let i = buf.length - 46; i >= 0; i--) {
    if (buf.readUInt32LE(i) !== 0x02014b50) continue;
    const lNom = buf.readUInt16LE(i + 28);
    if (buf.slice(i + 46, i + 46 + lNom).toString('latin1') !== 'content.xml') continue;
    const off = buf.readUInt32LE(i + 42), taille = buf.readUInt32LE(i + 20);
    const debut = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const brut = buf.slice(debut, debut + taille);
    xml = (buf.readUInt16LE(i + 10) === 8 ? zlib.inflateRawSync(brut) : brut).toString('utf8');
    break;
  }
  if (!xml) throw new Error('content.xml introuvable : est-ce bien un fichier ODS ?');
  const lignes = [];
  for (const m of xml.matchAll(/<table:table-row[^>]*>([\s\S]*?)<\/table:table-row>/g)) {
    const cellules = [];
    /* Deux formes de cellule, et il faut les distinguer franchement : la
       cellule vide se referme sur elle-même, la pleine encadre son texte. Les
       confondre — en laissant l'expression hésiter entre « /> » et « > » — fait
       avaler à chaque cellule vide le contenu de sa voisine, et tout le tableau
       glisse d'une colonne. C'est ce qui donnait des cigares à 220 € l'unité. */
    const CELLULE = /<table:table-cell([^>]*?)\/>|<table:table-cell([^>]*?)>([\s\S]*?)<\/table:table-cell>/g;
    for (const c of m[1].matchAll(CELLULE)) {
      const attrs = c[1] !== undefined ? c[1] : c[2];
      const repete = +((attrs.match(/number-columns-repeated="(\d+)"/) || [])[1] || 1);
      const texte = (c[3] || '').replace(/<[^>]+>/g, '')
        .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ').trim();
      // une cellule vide répétée trois cents fois ne mérite pas trois cents cases
      for (let k = 0; k < Math.min(repete, 12); k++) cellules.push(texte);
    }
    lignes.push(cellules);
  }
  return lignes;
}

/* La clé du relevé, empruntée à l'application : une seule définition, pour que
   les deux ne dérivent jamais l'une de l'autre. */
function cleTarifDeLApp() {
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
  vm.runInContext(['const MOTS_VIDES=new Set(', 'function normCigar(s)', 'function cleTarif(nom)']
    .map(bloc).join('\n'), banc);
  return banc.cleTarif;
}

/* Une seule rubrique nous intéresse, et tout le reste en sort. Énumérer les
   autres était une invitation à l'oubli : « Autres tabacs à fumer ou à inhaler
   après avoir été chauffés » ne commençait par aucun des mots prévus, et
   quatre cents tabacs à rouler entraient dans le relevé des cigares. */
const RUBRIQUE_CIGARE = /^cigares? et cigarillos$|^cigares?$|^cigarillos$/i;
const NON_PRODUIT = /^(FOURNISSEUR|FABRICANT|DÉSIGNATION|RÉFÉRENCE|NOUVEAU LIBELL|Anciens prix|Nouveaux prix|PRIX DE VENTE|A l'unité|Arrêté du)/i;
const montant = v => /^\d[\d ]*,\d{2}$/.test((v || '').trim());
const nombre = v => Number((v || '').replace(/\s/g, '').replace(',', '.'));

function relever(chemin) {
  const lignes = lignesDuTableur(chemin);
  const cleTarif = cleTarifDeLApp();
  const entete = (lignes.find(l => /Arrêté du/.test(l[0] || '')) || [])[0] || '';
  const applicable = (entete.match(/applicable au (.+?)\s*$/i) || [])[1] || null;

  const nouveaux = {}, anciens = {}, votes = {};
  let rubrique = null, produits = 0, sansPrix = 0;
  /* Six colonnes, et il faut les nommer pour ne plus s'y tromper :
       0  la référence actuelle, telle qu'elle était déjà homologuée
       1  le nouveau libellé, quand l'arrêté renomme le produit
       2  3  les anciens prix, à l'unité puis au conditionnement
       4  5  les nouveaux, ou « Sans changement »
     Le libellé qui fait foi est donc le nouveau s'il existe, l'ancien sinon. */
  for (const l of lignes) {
    const libelle = ((l[1] || '').trim() || (l[0] || '').trim());
    if (!libelle) continue;
    // un titre de rubrique occupe sa ligne, seul et sans prix
    if (!l.slice(2).some(c => c)) {
      // fournisseur et fabricant ne changent pas de rubrique, ils la coiffent
      if (!/^(FOURNISSEUR|FABRICANT)/i.test(libelle))
        rubrique = RUBRIQUE_CIGARE.test(libelle) ? 'cigares' : 'autre';
      continue;
    }
    if (NON_PRODUIT.test(libelle) || rubrique !== 'cigares') continue;

    /* Le prix en vigueur : le nouveau s'il est publié, l'ancien sinon —
       « Sans changement » veut dire ce qu'il dit. Et à défaut de prix à
       l'unité, celui du conditionnement divisé par ce que le libellé annonce :
       les coffrets et les grands crus n'ont souvent que celui-là. */
    const parLot = (unite, lot) => {
      if (montant(unite)) return nombre(unite);
      if (!montant(lot)) return null;
      /* La quantité s'écrit de trois façons : « en 25 cigares », « , 3 cigares »
         sans le « en », et « en 50 » tout court. Les trois valent, sauf devant
         un poids — « en 20 g » n'est pas un compte de cigares. */
      if (/\ben\s+\d+\s*(?:g|gr|kg)\b/i.test(libelle)) return null;
      const q = libelle.match(/\ben\s+(\d+)\b|[,(]\s*(\d+)\s+(?:cigares?|cigarillos?)/i);
      const n = q ? +(q[1] || q[2]) : 0;
      return n > 0 ? Math.round(nombre(lot) / n * 100) / 100 : null;
    };
    const ancien = parLot(l[2], l[3]);
    const neuf = parLot(l[4], l[5]);
    const prix = (neuf > 0) ? neuf : ancien;
    if (!(prix > 0)) { sansPrix++; continue; }
    produits++;

    const cle = cleTarif(libelle);
    if (!cle) continue;
    /* Un même cigare paraît sous plusieurs présentations — coffret de 24, de
       25, tins de 24 — et pas toujours au même prix. On retient le prix le plus
       souvent publié, non le moins cher : une présentation isolée à 5,50 ne
       doit pas décider pour deux qui s'accordent sur 7. À égalité, le moins
       cher l'emporte, qui est celui qu'un membre peut payer. */
    (votes[cle] = votes[cle] || []).push({ prix, avant: (ancien > 0) ? ancien : prix });
  }
  // dépouillement : pour chaque cigare, le prix que ses présentations disent
  // le plus souvent, et l'ancien prix de la même présentation
  for (const [cle, liste] of Object.entries(votes)) {
    const compte = {};
    liste.forEach(v => compte[v.prix] = (compte[v.prix] || 0) + 1);
    const gagnant = Object.entries(compte)
      .sort((a, b) => b[1] - a[1] || (+a[0]) - (+b[0]))[0][0];
    nouveaux[cle] = +gagnant;
    const memes = liste.filter(v => v.prix === +gagnant);
    anciens[cle] = Math.min(...memes.map(v => v.avant));
  }
  return { nouveaux, anciens, applicable, produits, sansPrix, lignes: lignes.length };
}

module.exports = { relever, lignesDuTableur };

if (require.main === module) {
  const chemin = process.argv[2];
  if (!chemin) {
    console.error('usage : node _outils/tarif/relever-ods.js "<Maquette JORF ....ods>" [--ecrire]');
    process.exit(1);
  }
  const { nouveaux, anciens, applicable, produits, sansPrix, lignes } = relever(chemin);
  const cles = Object.keys(nouveaux);
  console.log(`arrêté applicable au   ${applicable || '(date non lue)'}`);
  console.log(`lignes lues            ${lignes}`);
  console.log(`produits retenus       ${produits}`);
  console.log(`sans prix exploitable  ${sansPrix}`);
  console.log(`clés distinctes        ${cles.length}`);
  const bouge = cles.filter(k => anciens[k] !== nouveaux[k]);
  console.log(`prix modifiés par l'arrêté ${bouge.length}`);
  bouge.slice(0, 8).forEach(k => console.log(`   ${String(anciens[k]).padStart(7)} → ${String(nouveaux[k]).padEnd(7)} ${k.slice(0, 46)}`));

  const actuel = JSON.parse(fs.readFileSync(path.join(RACINE, 'tarifs.json'), 'utf8'));
  const communes = cles.filter(k => actuel[k] !== undefined);
  const memes = communes.filter(k => Math.abs(actuel[k] - nouveaux[k]) < 0.005);
  console.log(`\nrelevé en place        ${Object.keys(actuel).length} clés`);
  console.log(`   communes            ${communes.length}`);
  console.log(`   même prix           ${memes.length}`);
  console.log(`   prix différent      ${communes.length - memes.length}`);
  console.log(`   nouvelles           ${cles.length - communes.length}`);
  console.log(`   disparues           ${Object.keys(actuel).length - communes.length}`);

  if (!process.argv.includes('--ecrire')) { console.log('\n(épreuve à blanc — relancer avec --ecrire)'); process.exit(0); }
  fs.writeFileSync(path.join(RACINE, 'tarifs.json'), JSON.stringify(nouveaux));
  fs.writeFileSync(path.join(RACINE, 'tarifs-precedent.json'), JSON.stringify(anciens));
  console.log(`\nécrit : tarifs.json (${cles.length} clés) et tarifs-precedent.json`);
  if (applicable) console.log(`Pensez à porter « Au ${applicable} » dans TARIF_SOURCE, au haut d'index.html.`);
}
