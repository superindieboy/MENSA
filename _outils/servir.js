/* Sert le dossier du projet en local, pour voir l'application avant de la
 * pousser.
 *
 *   node _outils/servir.js         puis http://localhost:4173
 *
 * Rien d'autre qu'un serveur de fichiers : ni cache, ni compression, ni
 * réécriture. Ce qu'il montre est exactement ce que GitHub Pages servira, à
 * une exception près, qui est le motif de son existence — les dossiers
 * préfixés d'un souligné, que Pages ne publie pas, restent ici visibles. On
 * s'interdit donc de les servir, pour que la ressemblance soit complète.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const racine = path.join(__dirname, '..');
const port = Number(process.argv[2]) || 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

http.createServer((req, res) => {
  let chemin = decodeURIComponent(req.url.split('?')[0]);
  if (chemin === '/') chemin = '/index.html';

  const fichier = path.join(racine, chemin);
  // on ne sort pas du dossier, et l'on ne sert pas ce que Pages garde pour lui
  const dehors = !fichier.startsWith(racine);
  const prive = chemin.split('/').some(p => p.startsWith('_') || p === '.git');
  if (dehors || prive) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404');
  }

  fs.readFile(fichier, (err, corps) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 ' + chemin);
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(fichier).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(corps);
  });
}).listen(port, () => console.log(`MENSA sur http://localhost:${port}`));
