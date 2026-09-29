/* Storage: IndexedDB for the working copy, File System Access for the CSVs
 * on disk, and downloading a file.
 *
 * Primitives only: no knowledge of the tables. The working copy is a plain
 * key-value store, and files are read and written through a folder handle
 * that the caller owns. */
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

  function kvSet(key, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  /* Several keys in ONE transaction (v8.71): everything is written, or
     nothing. Eight separate transactions could leave the local copy half
     updated. */
  function kvSetPlusieurs(pairs) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      const store = tx.objectStore("kv");
      Object.entries(pairs).forEach(([key, value]) => store.put(value, key));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  function kvGet(key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readonly");
      const req = tx.objectStore("kv").get(key);
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

  async function ecrireFichier(handle, name, content) {
    const fh = await handle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
  }

  async function lireFichier(handle, name) {
    try {
      const fh = await handle.getFileHandle(name);
      const f = await fh.getFile();
      return await f.text();
    } catch (e) {
      return null;
    }
  }

  function telecharger(fileName, content, type) {
    const blob = new Blob([content], { type: type || "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  return { ouvrirDB, kvGet, kvSet, kvSetPlusieurs, verifierPermission, ecrireFichier, lireFichier, telecharger };
})();
