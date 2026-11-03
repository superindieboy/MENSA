/* Crée une fiche pour les cigares que la douane homologue et que le catalogue
 * ignore encore.
 *
 *   node _outils/tarif/creer-fiches.js            épreuve à blanc
 *   node _outils/tarif/creer-fiches.js --ecrire   crée les fiches
 *
 * Le relevé des prix porte les nouveaux tarifs aux fiches existantes, mais n'a
 * jamais créé de fiche : un cigare homologué en novembre et absent du
 * catalogue y restait absent. C'est ce trou que cet outil comble.
 *
 * Il le comble avec méfiance, parce que le barème des douanes n'est pas un
 * catalogue de cigares. On y trouve des humidors de voyage, des assortiments
 * de six, des coffrets vendus à la boîte et des cigarillos à cinquante
 * centimes. Créer une fiche par ligne nouvelle polluerait le catalogue
 * exactement comme l'avaient fait les blunts.
 *
 * D'où une garde qui vaut mieux que tous les filtres : le nom qu'on tire du
 * libellé doit se réduire à la clé de relevé dont il vient. Si ce n'est pas le
 * cas, c'est qu'on a perdu ou ajouté un mot en chemin — la fiche ne
 * retrouverait alors jamais son prix au relevé suivant, et on préfère ne pas
 * la créer. Cette règle élimine d'elle-même les libellés tordus, sans qu'on
 * ait à les prévoir un par un.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { relever } = require('./relever-ods.js');

const RACINE = path.join(__dirname, '..', '..');
const PORTAIL = 'https://www.douane.gouv.fr/la-douane/opendata/categories/tabacs-manufactures';
const ecrire = process.argv.includes('--ecrire');

/* Jamais plus que cela d'un coup. Une nomenclature apporte quelques dizaines
   de nouveautés ; des centaines signifieraient que l'appariement s'est
   effondré, et mieux vaut alors ne rien écrire du tout. */
const PLAFOND = 200;
const PRIX_PLANCHER = 2.5;        // en dessous, c'est un cigarillo à la pièce

/* Ce qui n'est pas un cigare, même rangé parmi les cigares. */
const PAS_UN_CIGARE = [
  /cigarillo/i,
  /humidor/i,
  /\bassortment\b|\bassortiment\b|\bsampler\b/i,
  /\d+\s*-?\s*cigars?\s+selection\b/i,
  /\bselection\b.*\bcigars?\b|\bcigars?\b.*\bselection\b/i,
  /bo[iî]te\s+unitaire/i,          // le prix est celui de la boîte, pas du cigare
  /\bmallette\b|\bécrin\b|\bcave\s+à\s+cigares?\b/i,
  /\bcoffret\b/i,                  // dans le NOM, et non dans le conditionnement
  /bo[iî]te\s+d[ée]couverte/i,     // un assortiment pour découvrir, pas un cigare
  /\bmehari|\bfilter\b/i
];

/* La douane écrit sans accents — « Don Tomas Clasico » — là où le catalogue
   écrit « Don Tomás Clásico ». Créer la fiche telle quelle poserait, à côté
   d'un cigare déjà connu, son sosie décapité de ses accents. On rend donc à
   chaque mot l'accentuation que le catalogue lui donne déjà, quand il la donne
   sans ambiguïté. C'est le catalogue qui sert de dictionnaire : aucune règle
   d'accentuation à écrire, et rien d'inventé. */
function accentueur(fiches) {
  const nu = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const vu = new Map();
  for (const f of fiches)
    for (const mot of String(f.name).split(/[\s,()/]+/)) {
      if (mot.length < 3) continue;
      const k = nu(mot);
      if (k === mot.toLowerCase()) continue;        // ce mot n'a pas d'accent
      const d = vu.get(k);
      if (d === undefined) vu.set(k, mot);
      else if (d !== mot) vu.set(k, null);          // deux graphies : on s'abstient
    }
  return nom => nom.replace(/[^\s,()/]+/g, mot => {
    if (nu(mot) !== mot.toLowerCase()) return mot;  // déjà accentué
    const d = vu.get(nu(mot));
    if (!d) return mot;
    return mot === mot.toUpperCase() ? d.toUpperCase() : d;
  });
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

async function derniereNomenclature() {
  const r = await fetch(PORTAIL, { redirect: 'follow' });
  if (!r.ok) throw new Error('portail douane : HTTP ' + r.status);
  const html = await r.text();
  const vus = new Map();
  for (const m of html.matchAll(/href="([^"]*Maquette[^"]*\.ods)"/gi)) {
    const url = new URL(m[1].replace(/&amp;/g, '&'), PORTAIL).href;
    const d = decodeURIComponent(m[1]).match(/1er\s+([a-zéûô]+)\s+(\d{4})/i);
    if (!d) continue;
    const mois = MOIS.indexOf(d[1].toLowerCase());
    if (mois < 0) continue;
    if (!vus.has(url)) vus.set(url, { url, quand: new Date(Date.UTC(+d[2], mois, 1)), texte: `1er ${d[1]} ${d[2]}` });
  }
  const toutes = [...vus.values()].sort((a, b) => b.quand - a.quand);
  if (!toutes.length) throw new Error('aucune nomenclature trouvée');
  return toutes[0];
}

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
  const banc = { TARIFS: {}, nomsPartages: {}, TARIFS_MOTS: null };
  vm.createContext(banc);
  vm.runInContext(['const MOTS_VIDES=new Set(', 'function normCigar(s)', 'function cleTarif(nom)',
    'function motsDeFiche(c)', 'function clesParCouverture(c)', 'function cleParCouverture(c)']
    .map(bloc).join('\n'), banc);
  return banc;
}

/* Le nom du produit : ce que la douane écrit avant le conditionnement. Le
   libellé s'écrit « Nom du cigare, en 25 cigares » ou « Nom (coffret), en
   boîte de 10 » — la virgule sépare le produit de sa présentation. */
function nomDuLibelle(libelle) {
  let n = libelle.split(',')[0];
  /* La virgule sépare d'ordinaire le produit de sa présentation, mais pas
     toujours : « ... Culebra (Boîte) en 3 cigares » n'en porte aucune, et le
     nom emportait alors son conditionnement. On retire donc aussi tout ce qui
     annonce un emballage, virgule ou pas. */
  n = n.replace(/\s*\(\s*bo[iî]tes?\s*\)\s*/ig, ' ');
  n = n.replace(/\s*(?:en\s+)?bo[iî]tes?(?:\s+de)?\s+\d+.*$/i, '');
  n = n.replace(/\s*en\s+\d+\s*(?:cigares?|cigarillos?).*$/i, '');
  n = n.replace(/\s*\bbundle\s+de\s+\d+.*$/i, '');
  n = n.replace(/\s*\([^)]*\)\s*$/, '');        // « (coffret) », « (Boite Premium) »
  n = n.replace(/\s+/g, ' ').trim();
  // un libellé tout en capitales se lit mal au milieu d'un catalogue qui ne
  // l'est pas : on lui rend sa casse
  if (n === n.toUpperCase() && /[A-ZÀ-Þ]/.test(n))
    n = n.toLowerCase().replace(/(^|[\s\-'’"(])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
  return n;
}

/* La marque : la plus longue de celles que le catalogue connaît déjà et par
   laquelle le nom commence. Un appariement court — « Casa » pour « Casa de
   Nicaragua », « El » pour « El Unico » — ne vaut rien : on exige quatre
   lettres, et qu'il reste quelque chose derrière. À défaut, les deux premiers
   mots, qui sont la marque dans l'immense majorité des libellés. */
/* Les mots qui ouvrent la désignation d'un cigare et ferment donc la marque.
   Uniquement des vitoles et des formats : surtout pas des origines, sans quoi
   « Casa de Nicaragua » s'arrêterait à « Casa de ». */
const MOT_DE_FORMAT = new RegExp('^(?:' + [
  'robusto', 'robustos', 'toro', 'toros', 'churchill', 'churchills', 'corona', 'coronas',
  'coronita', 'coronitas', 'belicoso', 'belicosos', 'torpedo', 'torpedos', 'gordo', 'gordito',
  'lancero', 'lanceros', 'perfecto', 'figurado', 'piramide', 'piramides', 'magnum', 'petit',
  'petits', 'double', 'half', 'short', 'shorts', 'salomon', 'salomones', 'diadema', 'diademas',
  'panetela', 'panatela', 'campana', 'sublime', 'sublimes', 'genios', 'magicos', 'siglo',
  'behike', 'bhk', 'gran', 'grande', 'epicure', 'esplendido', 'esplendidos', 'tubulares',
  'no', 'n'
].join('|') + ')$', 'i');
const nu = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const motDeMarque = m => !MOT_DE_FORMAT.test(nu(m)) && !/^\d/.test(m) && !/^\d+\s*x/i.test(m) && !/^n[°º]/i.test(m);

/* Les particules qui soudent une marque en plusieurs mots. C'est le motif de
   presque toutes : Casa DE Nicaragua, Flor DE Copán, Quai D'Orsay, Aroma DE
   Nicaragua. « of » et « the » n'en sont pas — ils ouvrent des noms de
   produits, « Year of the Goat ». */
const PARTICULE = /^(?:de|del|du|da|des|la|le|los|las|y|von|van|san|santa)$/i;

/* La marque d'un cigare.

   Le premier mot, d'abord : il suffit pour Plasencia, Vegafina, Trinidad,
   Davidoff. Puis on l'étend tant qu'une particule le réclame — « Casa de
   Nicaragua » tient en un bloc, et s'arrêter à « Casa » serait le couper au
   milieu. Un premier mot d'une ou deux lettres n'est jamais une marque à lui
   seul : « A Flores » en prend deux.

   Le catalogue sert ensuite d'arbitre, mais seulement s'il propose plus long :
   il connaît « Black Label », « Villa Zamorano », « Alec Bradley », que nulle
   particule ne révélerait. On ne le laisse pas raccourcir, en revanche — il
   porte « Casa » pour Casa De Garcia et « Quai » à côté de « Quai Dorsay »,
   et lui obéir propagerait ses propres approximations. */
function marqueDuNom(nom, marquesTriees, norm) {
  const mots = nom.split(' ');
  let n = mots[0] && mots[0].length <= 2 ? 2 : 1;
  while (n < mots.length) {
    // « D'Orsay », « L'Atelier » : la particule est collée au nom
    if (/^[dl]['’]./i.test(mots[n]) && motDeMarque(mots[n])) { n++; continue; }
    if (PARTICULE.test(mots[n]) && n + 1 < mots.length && motDeMarque(mots[n + 1])) { n += 2; continue; }
    break;
  }
  let marque = mots.slice(0, Math.min(n, mots.length)).join(' ');

  const cible = norm(nom);
  for (const b of marquesTriees) {
    if (b.length <= marque.length) break;      // triées par longueur : rien de plus long ensuite
    const nb = norm(b);
    if (cible.startsWith(nb + ' ')) return b;
  }
  return marque;
}

async function principal() {
  const derniere = await derniereNomenclature();
  console.log('nomenclature : ' + derniere.texte);
  const r = await fetch(derniere.url);
  if (!r.ok) throw new Error('téléchargement : HTTP ' + r.status);
  const fichier = path.join(os.tmpdir(), 'nomen-' + Date.now() + '.ods');
  fs.writeFileSync(fichier, Buffer.from(await r.arrayBuffer()));
  const { nouveaux, libelles } = relever(fichier);
  fs.unlinkSync(fichier);
  console.log('lu           : ' + Object.keys(nouveaux).length + ' clés');

  const banc = outilsDeLApp();
  const brut = fs.readFileSync(path.join(RACINE, 'catalogue.json'), 'utf8');
  const fiches = JSON.parse(brut);
  fiches.forEach(c => { const k = banc.normCigar(c.name); banc.nomsPartages[k] = (banc.nomsPartages[k] || 0) + 1; });
  banc.TARIFS = nouveaux; banc.TARIFS_MOTS = null;

  /* Les clés qu'une fiche tient déjà — par son nom, ou par recouvrement du
     format, et jamais pour une fiche homonyme d'une autre. Les mêmes règles
     que l'application, sans quoi on créerait des doublons. */
  const tenues = new Set();
  for (const f of fiches) {
    const k = banc.cleTarif(f.name);
    if (k && nouveaux[k] !== undefined) { tenues.add(k); continue; }
    if (banc.nomsPartages[banc.normCigar(f.name)] > 1) continue;
    const kc = banc.cleParCouverture(f);
    if (kc && nouveaux[kc] !== undefined) tenues.add(kc);
  }
  console.log('déjà tenues  : ' + tenues.size + ' clés par ' + fiches.length + ' fiches');

  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const accentuer = accentueur(fiches);
  const marques = [...new Set(fiches.map(f => f.brand).filter(Boolean))].sort((a, b) => b.length - a.length);
  let suivant = Math.max(...fiches.map(f => +f.id.slice(6)).filter(n => n > 0)) + 1;

  const retenues = [], jumelles = [];
  const ecartees = { prix: 0, nature: 0, nom: 0, cle: 0, doublon: 0, jumelle: 0, abime: 0 };
  const vusParNom = new Set(fiches.map(f => banc.normCigar(f.name)));

  /* Les mots de chaque fiche du catalogue, une fois pour toutes : la règle des
     sosies se pose sur eux, et la reposer trois mille fois par proposition
     coûterait des minutes. */
  const motsDesFiches = fiches.map(f => ({
    nom: f.name, mots: new Set(banc.cleTarif(f.name).split(' ').filter(Boolean))
  })).filter(x => x.mots.size >= 2);
  /* Le SENS de l'inclusion décide, et c'est tout l'art.

     Si les mots de la proposition tiennent entiers dans ceux d'une fiche —
     « Cohiba BHK 52 » dans « Cohiba Behike Bhk 52 », « Cohiba Genios » dans
     « Cohiba Maduro 5 Genios » — alors la fiche dit déjà tout ce que la
     proposition dit, et mieux : c'est un sosie, on l'écarte.

     Si c'est l'inverse — « Don Tomás Clásico Robusto » contient « Don Tomás
     Clásico » — la proposition ajoute le format. Or c'est exactement la fiche
     qui manquait : trois fiches partagent le nom « Don Tomás Clásico » sans
     dire laquelle est le Robusto, et aucune ne peut donc être chiffrée. La
     créer lève l'ambiguïté au lieu de l'épaissir. On la garde. */
  const jumelle = nom => {
    const a = new Set(banc.cleTarif(nom).split(' ').filter(Boolean));
    if (a.size < 2) return null;
    for (const f of motsDesFiches)
      if ([...a].every(x => f.mots.has(x))) return f.nom;   // proposition ⊆ fiche
    return null;
  };
  const precise = nom => {
    const a = new Set(banc.cleTarif(nom).split(' ').filter(Boolean));
    for (const f of motsDesFiches)
      if (f.mots.size < a.size && [...f.mots].every(x => a.has(x))) return f.nom;
    return null;
  };

  for (const cle of Object.keys(nouveaux)) {
    if (tenues.has(cle)) continue;
    const libelle = libelles[cle];
    if (!libelle) continue;
    if (!(nouveaux[cle] >= PRIX_PLANCHER)) { ecartees.prix++; continue; }
    if (PAS_UN_CIGARE.some(re => re.test(libelle))) { ecartees.nature++; continue; }
    const nom = accentuer(nomDuLibelle(libelle));
    if (nom.split(' ').length < 2 || nom.length < 6) { ecartees.nom++; continue; }
    /* « ch°teau » pour « château » : la source de la douane perd parfois un
       accent en chemin, et le degré prend sa place. Deviner quelle voyelle
       manquait serait inventer — on n'écrit pas la fiche. Les épreuves
       guettent déjà ce défaut au catalogue ; autant ne pas l'y verser. */
    if (/°[a-zA-ZÀ-ÿ]/.test(nom)) { ecartees.abime++; continue; }
    /* La garde : le nom doit se réduire à la clé dont il vient. Sinon la fiche
       ne retrouverait pas son prix au relevé suivant. */
    if (banc.cleTarif(nom) !== cle) { ecartees.cle++; continue; }
    if (vusParNom.has(banc.normCigar(nom))) { ecartees.doublon++; continue; }
    /* Le nom exact ne suffit pas à reconnaître un sosie. « Cohiba BHK 52 » et
       « Cohiba Behike Bhk 52 » sont le même cigare au même prix, et la douane
       nomme rarement comme le catalogue. On reprend donc la règle dont l'app
       se sert déjà pour avertir d'un doublon : si les mots de l'un tiennent
       entiers dans ceux de l'autre, c'est le même produit sous deux plumes. */
    const j = jumelle(nom);
    if (j) { ecartees.jumelle++; jumelles.push({ nom, prix: nouveaux[cle], comme: j }); continue; }
    vusParNom.add(banc.normCigar(nom));
    retenues.push({
      id: 'mensa-' + String(suivant++).padStart(4, '0'),
      tarif: nouveaux[cle],
      name: nom,
      brand: marqueDuNom(nom, marques, norm),
      terroir: 'autre',            // le libellé ne dit pas l'origine, on ne la devine pas
      libelle, precise: precise(nom)
    });
  }

  console.log('\nÉCARTÉES');
  console.log('   prix sous ' + PRIX_PLANCHER.toFixed(2).replace('.', ',') + ' € (cigarillos) : ' + ecartees.prix);
  console.log('   humidor, assortiment, coffret vendu à la boîte : ' + ecartees.nature);
  console.log('   nom trop court pour être un cigare            : ' + ecartees.nom);
  console.log('   le nom ne se réduit pas à sa clé              : ' + ecartees.cle);
  console.log('   un nom déjà porté au catalogue                : ' + ecartees.doublon);
  console.log('   sosie d\'une fiche existante                   : ' + ecartees.jumelle);
  console.log('   nom abîmé par un accent perdu à la source     : ' + ecartees.abime);
  if (jumelles.length) {
    console.log('\n   quelques sosies écartés, pour contrôle :');
    jumelles.slice(0, 10).forEach(j =>
      console.log('      ' + String(j.prix).padStart(7) + ' €  ' + j.nom.padEnd(38).slice(0, 38) + '  ≈  ' + j.comme));
  }

  const precisantes = retenues.filter(f => f.precise);
  console.log('\nRETENUES : ' + retenues.length + ' fiches à créer, dont '
    + precisantes.length + ' qui ajoutent le format à un nom déjà porté');
  if (precisantes.length) {
    precisantes.slice(0, 6).forEach(f =>
      console.log('   ' + String(f.tarif).padStart(7) + ' €  ' + f.name.padEnd(38).slice(0, 38) + '  précise  ' + f.precise));
    console.log('');
  }
  retenues.slice(0, 40).forEach(f =>
    console.log('   ' + String(f.tarif).padStart(7) + ' €  ' + f.name.padEnd(46).slice(0, 46) + '  [' + f.brand + ']'));
  if (retenues.length > 40) console.log('   … et ' + (retenues.length - 40) + ' autres');

  if (!retenues.length) { console.log('\nRien à créer.'); return 0; }
  if (retenues.length > PLAFOND)
    throw new Error(`${retenues.length} fiches à créer, au-dessus du plafond de ${PLAFOND} : on n'écrit rien`);

  if (!ecrire) { console.log('\n(épreuve à blanc — relancer avec --ecrire)'); return 0; }

  /* On insère en conservant l'écriture du fichier : il tient sur une ligne, et
     le réécrire en entier changerait la forme de tous les nombres. */
  const ajout = retenues.map(f => JSON.stringify({ id: f.id, tarif: f.tarif, name: f.name, brand: f.brand, terroir: f.terroir })).join(',');
  const neuf = brut.replace(/\]\s*$/, ',' + ajout + ']');
  const relu = JSON.parse(neuf);
  if (relu.length !== fiches.length + retenues.length) throw new Error('le compte ne tombe pas : rien écrit');
  fs.writeFileSync(path.join(RACINE, 'catalogue.json'), neuf);
  console.log('\nécrit : ' + retenues.length + ' fiches, ' + relu.length + ' au total.');
  return 0;
}

principal().catch(e => { console.error('échec : ' + (e && e.message)); process.exit(1); });
