/* Petite couche de lecture PDF : objets, flux, polices et texte positionné.
   Rien d'universel — juste ce que ces trois revues emploient. */
const fs = require('fs');
const zlib = require('zlib');

function charger(chemin) {
  const brut = fs.readFileSync(chemin).toString('latin1');
  const objets = new Map();
  for (const m of brut.matchAll(/(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g))
    if (!objets.has(m[1])) objets.set(m[1], m[3]);

  /* Les PDF récents empaquettent leurs petits objets — polices, ressources —
     dans des flux comprimés. Sans les déballer, les pages semblent n'avoir
     aucune police, et le texte ne se décode plus : c'est le cas du Journal
     officiel, dont on ne lisait que des codes bruts. */
  for (const [, corps] of [...objets]) {
    if (!/\/Type\s*\/ObjStm/.test(corps)) continue;
    const clair = inflate(corps);
    if (!clair) continue;
    const n = +(corps.match(/\/N\s+(\d+)/) || [])[1];
    const premier = +(corps.match(/\/First\s+(\d+)/) || [])[1];
    if (!n || !premier) continue;
    const entete = clair.slice(0, premier).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const num = String(entete[i * 2]), decalage = entete[i * 2 + 1];
      if (!num || !isFinite(decalage) || objets.has(num)) continue;
      const fin = (i + 1 < n) ? premier + entete[i * 2 + 3] : clair.length;
      objets.set(num, clair.slice(premier + decalage, fin));
    }
  }
  return { brut, objets };
}

function inflate(corps) {
  const i = corps.indexOf('stream');
  if (i < 0) return null;
  const entete = corps.slice(0, i);
  let d = i + 6;
  if (corps[d] === '\r') d++;
  if (corps[d] === '\n') d++;
  const f = corps.lastIndexOf('endstream');
  if (f <= d) return null;
  const donnees = Buffer.from(corps.slice(d, f), 'latin1');
  if (!/\/FlateDecode/.test(entete)) return donnees.toString('latin1');
  try { return zlib.inflateSync(donnees).toString('latin1'); } catch (e) { return null; }
}

/* Table code → caractère, lue du CMap ToUnicode quand il existe, sinon des
   /Differences, sinon l'identité. Ces revues emploient des sous-ensembles où
   « R » peut valoir 0x1C : sans cette table, « Robusto » se lit « obusto ». */
function tableDePolice(doc, refObjet) {
  const corps = doc.objets.get(refObjet);
  if (!corps) return null;
  const table = {};
  let octets = 1;
  const tu = corps.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
  if (tu) {
    const cmap = inflate(doc.objets.get(tu[1]) || '');
    if (cmap) {
      // largeur des codes : le Journal officiel écrit « <01> », d'autres
      // documents « <0001> ». La plage de codes le dit.
      const plage = cmap.match(/begincodespacerange\s*<([0-9A-Fa-f]+)>/);
      if (plage) octets = Math.max(1, Math.round(plage[1].length / 2));
      for (const b of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
        for (const p of b[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g))
          table[parseInt(p[1], 16)] = String.fromCharCode(parseInt(p[2].slice(0, 4), 16));
      for (const b of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
        for (const p of b[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
          const a = parseInt(p[1], 16), z = parseInt(p[2], 16), v = parseInt(p[3], 16);
          for (let c = a; c <= z && c - a < 500; c++) table[c] = String.fromCharCode(v + c - a);
        }
    }
  }
  const enc = corps.match(/\/Encoding\s+(\d+)\s+\d+\s+R/);
  const encCorps = enc ? doc.objets.get(enc[1]) : (/\/Differences/.test(corps) ? corps : null);
  if (encCorps) {
    const diff = encCorps.match(/\/Differences\s*\[([\s\S]*?)\]/);
    if (diff) {
      let code = 0;
      for (const jeton of diff[1].match(/\d+|\/[^\s\/\]]+/g) || []) {
        if (/^\d/.test(jeton)) { code = +jeton; continue; }
        const nom = jeton.slice(1);
        if (table[code] === undefined) table[code] = nomVersCaractere(nom);
        code++;
      }
    }
  }
  if (!Object.keys(table).length) return null;
  Object.defineProperty(table, 'octets', { value: octets, enumerable: false });
  return table;
}

const ACCENTS = {
  eacute: 'é', egrave: 'è', ecircumflex: 'ê', agrave: 'à', acircumflex: 'â',
  ccedilla: 'ç', ocircumflex: 'ô', ucircumflex: 'û', ugrave: 'ù', icircumflex: 'î',
  idieresis: 'ï', edieresis: 'ë', udieresis: 'ü', odieresis: 'ö', adieresis: 'ä',
  ntilde: 'ñ', space: ' ', hyphen: '-', period: '.', comma: ',', quotesingle: "'",
  quoteright: '’', quoteleft: '‘', parenleft: '(', parenright: ')', endash: '–',
  emdash: '—', bullet: '•', degree: '°', multiply: '×', numbersign: '#', slash: '/',
  ampersand: '&', plus: '+', colon: ':', semicolon: ';', exclam: '!', question: '?'
};
function nomVersCaractere(nom) {
  if (ACCENTS[nom]) return ACCENTS[nom];
  if (/^uni([0-9A-Fa-f]{4})$/.test(nom)) return String.fromCharCode(parseInt(nom.slice(3), 16));
  if (/^[A-Za-z]$/.test(nom)) return nom;
  if (/^(zero|one|two|three|four|five|six|seven|eight|nine)$/.test(nom))
    return String('zero one two three four five six seven eight nine'.split(' ').indexOf(nom));
  return nom.length === 1 ? nom : '';
}

/* Les runs de texte d'un flux, décodés et posés à leur place.
   Le texte se positionne rarement en absolu : « Tm » ne revient qu'en tête de
   bloc, et tout le reste avance en relatif — « Td » pour un décalage, « T* »
   et « ' » pour aller à la ligne suivante d'une hauteur « TL ». Sans les
   suivre, tous les runs d'un même bloc portent la même coordonnée, et la
   pastille ne peut plus désigner personne.
   On suit aussi la matrice de la page (« cm »), car ces revues dessinent au
   dixième : deux blocs d'échelles différentes ne se compareraient pas. */
function runs(doc, clair, polices) {
  const sortie = [];
  let police = null, taille = 0;
  let ctm = { a: 1, d: 1, e: 0, f: 0 };
  const pile = [];
  let tm = { a: 1, d: 1, e: 0, f: 0 }, tlm = { a: 1, d: 1, e: 0, f: 0 }, tl = 0;

  /* La couleur de remplissage : c'est elle, plus que la police, qui distingue
     la pastille. Les trois revues la tracent en rouge — chacune avec sa
     police, mais toutes avec le même geste. */
  let rouge = false;
  const N = '(-?[\\d.]+)';
  const re = new RegExp([
    '\\/([A-Za-z]?[\\w.]*)\\s+([\\d.]+)\\s+Tf',                                   // 1,2
    `${N}\\s+${N}\\s+${N}\\s+${N}\\s+${N}\\s+${N}\\s+(cm|Tm)`,                     // 3..9
    `${N}\\s+${N}\\s+(Td|TD)`,                                                     // 10,11,12
    `${N}\\s+TL`,                                                                  // 13
    '(T\\*)',                                                                      // 14
    '(q|Q|BT)',                                                                    // 15
    '\\[((?:[^\\[\\]\\\\]|\\\\.)*)\\]\\s*TJ',                                      // 16
    '\\(((?:\\\\.|[^)\\\\])*)\\)\\s*(Tj|\')',                                      // 17,18
    `((?:${N}\\s+){1,5})(rg|g|k|scn)\\b`,                                          // 19,20,21
    '<([0-9A-Fa-f\\s]*)>\\s*(Tj|\')'                                               // 22,23
  ].join('|'), 'g');

  for (const m of clair.matchAll(re)) {
    if (m[1] !== undefined) { police = m[1]; taille = +m[2]; continue; }
    if (m[9] !== undefined) {
      const v = { a: +m[3], d: +m[6], e: +m[7], f: +m[8] };
      if (m[9] === 'cm') ctm = { a: v.a * ctm.a, d: v.d * ctm.d, e: v.e * ctm.a + ctm.e, f: v.f * ctm.d + ctm.f };
      else { tlm = { ...v }; tm = { ...v }; }
      continue;
    }
    if (m[12] !== undefined) {
      const tx = +m[10], ty = +m[11];
      if (m[12] === 'TD') tl = -ty;
      tlm = { ...tlm, e: tlm.e + tx * tlm.a, f: tlm.f + ty * tlm.d };
      tm = { ...tlm };
      continue;
    }
    if (m[13] !== undefined) { tl = +m[13]; continue; }
    if (m[14] !== undefined) { tlm = { ...tlm, f: tlm.f - tl * tlm.d }; tm = { ...tlm }; continue; }
    if (m[15] !== undefined) {
      if (m[15] === 'q') pile.push({ ...ctm });
      else if (m[15] === 'Q') { if (pile.length) ctm = pile.pop(); }
      else { tm = { a: 1, d: 1, e: 0, f: 0 }; tlm = { ...tm }; }
      continue;
    }
    if (m[21] !== undefined) {
      const v = m[19].trim().split(/\s+/).map(Number);
      let r, g, b;
      if (m[21] === 'g') { r = g = b = v[0]; }
      else if (m[21] === 'k' && v.length >= 4) {
        r = (1 - v[0]) * (1 - v[3]); g = (1 - v[1]) * (1 - v[3]); b = (1 - v[2]) * (1 - v[3]);
      } else if (v.length >= 3) { [r, g, b] = v; }
      else { r = g = b = v[0]; }
      rouge = (r > 0.55 && g < 0.42 && b < 0.42);
      continue;
    }
    /* Trois façons d'écrire du texte : la chaîne littérale « (Robusto) », le
       tableau crénelé « [(Rob)-20(usto)] », et la chaîne hexadécimale
       « <0102> » — celle du Journal officiel, qui ne s'y lit que par la table
       de la police. Les trois cohabitent dans un même tableau TJ. */
    let t;
    if (m[16] !== undefined) {
      t = '';
      for (const el of m[16].matchAll(/\(((?:\\.|[^)\\])*)\)|<([0-9A-Fa-f\s]*)>/g))
        t += el[1] !== undefined
          ? decoder(el[1], polices[police])
          : decoderHexa(el[2], polices[police]);
    } else if (m[17] !== undefined) {
      if (m[18] === "'") { tlm = { ...tlm, f: tlm.f - tl * tlm.d }; tm = { ...tlm }; }
      t = decoder(m[17], polices[police]);
    } else if (m[22] !== undefined) {
      if (m[23] === "'") { tlm = { ...tlm, f: tlm.f - tl * tlm.d }; tm = { ...tlm }; }
      t = decoderHexa(m[22], polices[police]);
    } else continue;
    const x = ctm.a * tm.e + ctm.e, y = ctm.d * tm.f + ctm.f;
    /* La taille visible n'est pas celle de « Tf » : la matrice du texte et
       celle de la page la multiplient. « L'amateur de cigare » compose tout en
       Tf 1 et met l'échelle dans le Tm — sans cette correction, titres et corps
       de texte s'y valaient, et aucun titre ne se distinguait plus. */
    const vue = taille * Math.abs(tm.a) * Math.abs(ctm.a);
    if (t.trim()) sortie.push({ police, x, y, taille: Math.round(vue * 10) / 10, t, rouge });
  }
  return sortie;
}

function decoderHexa(hexa, table) {
  const h = (hexa || '').replace(/\s+/g, '');
  if (!h) return '';
  const pas = (table && table.octets === 2) ? 4 : 2;
  let out = '';
  for (let i = 0; i < h.length; i += pas) {
    const code = parseInt(h.slice(i, i + pas).padEnd(pas, '0'), 16);
    if (isNaN(code)) continue;
    const v = table ? table[code] : undefined;
    out += (v !== undefined ? v : (code >= 32 && code < 127 ? String.fromCharCode(code) : ''));
  }
  return out;
}

function decoder(cru, table) {
  const brut = cru.replace(/\\([nrtbf()\\])/g, (s, c) =>
    ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[c] || c))
    .replace(/\\([0-7]{1,3})/g, (s, o) => String.fromCharCode(parseInt(o, 8)));
  if (!table) return brut;
  let out = '';
  for (const ch of brut) {
    const v = table[ch.charCodeAt(0)];
    out += (v !== undefined ? v : ch);
  }
  return out;
}

/* Les polices du document, par nom de ressource. On balaie les corps d'objets
   autant que le fichier brut : depuis que les ressources voyagent dans des
   flux comprimés, le second ne suffit plus. */
function policesDuDocument(doc) {
  const tables = {}, familles = {};
  const corpsTous = [doc.brut, ...doc.objets.values()];
  for (const [num, corps] of doc.objets) {
    if (!/\/Type\s*\/Font/.test(corps)) continue;
    const bf = corps.match(/\/BaseFont\s*\/([A-Za-z0-9+\-_]+)/);
    const t = tableDePolice(doc, num);
    const re = new RegExp('\\/([A-Za-z][\\w.]*)\\s+' + num + '\\s+\\d+\\s+R', 'g');
    for (const source of corpsTous)
      for (const m of source.matchAll(re)) {
        if (t) tables[m[1]] = t;
        if (bf) familles[m[1]] = bf[1].replace(/^[A-Z]{6}\+/, '');
      }
  }
  return { tables, familles };
}

module.exports = { charger, inflate, tableDePolice, runs, policesDuDocument };
