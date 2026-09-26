/* Stockage : IndexedDB pour la copie de travail, File System Access pour les
 * CSV du disque, et le téléchargement d'un fichier.
 *
 * Primitives seulement : aucune connaissance des tables. La copie de travail
 * est un simple magasin clé-valeur, et les fichiers se lisent et s'écrivent
 * par un handle de dossier que l'appelant possède. */
"use strict";

const DATA_STORE = (() => {

  let db = null;

  function ouvrirDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("cafe-tracker", 1);
      req.onupgradeneeded = () => { req.result.createObjectStore("kv"); };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  function kvSet(cle, valeur) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(valeur, cle);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  /* Plusieurs clés en UNE transaction (v8.71) : tout est écrit, ou rien. Huit
     transactions séparées pouvaient laisser la copie locale à moitié à jour. */
  function kvSetPlusieurs(paires) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      const magasin = tx.objectStore("kv");
      Object.entries(paires).forEach(([cle, valeur]) => magasin.put(valeur, cle));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  function kvGet(cle) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readonly");
      const req = tx.objectStore("kv").get(cle);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function verifierPermission(handle) {
    if (!handle) return false;
    const opts = { mode: "readwrite" };
    if (await handle.queryPermission(opts) === "granted") return true;
    if (await handle.requestPermission(opts) === "granted") return true;
    return false;
  }

  async function ecrireFichier(handle, nom, contenu) {
    const fh = await handle.getFileHandle(nom, { create: true });
    const w = await fh.createWritable();
    await w.write(contenu);
    await w.close();
  }

  async function lireFichier(handle, nom) {
    try {
      const fh = await handle.getFileHandle(nom);
      const f = await fh.getFile();
      return await f.text();
    } catch (e) {
      return null;
    }
  }

  function telecharger(nomFichier, contenu, type) {
    const blob = new Blob([contenu], { type: type || "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomFichier;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  return { ouvrirDB, kvGet, kvSet, kvSetPlusieurs, verifierPermission, ecrireFichier, lireFichier, telecharger };
})();
