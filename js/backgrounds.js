/* =========================================================
   自定义背景 · 本地图片存储与取色
   ---------------------------------------------------------
   图片只保存在当前浏览器的 IndexedDB 中，不会上传。
   ========================================================= */

(() => {
  "use strict";

  const DB_NAME = "sugar-dashboard";
  const DB_VERSION = 1;
  const STORE = "backgrounds";
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const MAX_EDGE = 2560;
  const THUMB_EDGE = 420;

  let dbPromise = null;

  const supported = typeof indexedDB !== "undefined";

  function openDB() {
    if (!supported) return Promise.reject(new Error("当前浏览器不支持本地图片存储"));
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("无法打开本地图片存储"));
      request.onblocked = () => reject(new Error("本地图片存储被其他页面占用"));
    });

    return dbPromise;
  }

  async function runStore(mode, action) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;

      try {
        const request = action(store);
        if (request) {
          request.onsuccess = () => {
            result = request.result;
          };
          request.onerror = () => reject(request.error || new Error("图片存储操作失败"));
        }
      } catch (error) {
        reject(error);
        return;
      }

      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("图片存储事务失败"));
      tx.onabort = () => reject(tx.error || new Error("图片存储事务中断"));
    });
  }

  async function getAll() {
    const records = await runStore("readonly", (store) => store.getAll());
    return (records || []).sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
  }

  async function add(record) {
    await runStore("readwrite", (store) => store.put(record));
    return record;
  }

  async function remove(id) {
    await runStore("readwrite", (store) => store.delete(id));
  }

  async function clear() {
    await runStore("readwrite", (store) => store.clear());
  }

  function makeId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `bg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function isImageFile(file) {
    if (!file) return false;
    if (file.type && file.type.startsWith("image/")) return true;
    return /\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(file.name || "");
  }

  async function decodeImage(file) {
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        return {
          image: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          cleanup: () => bitmap.close && bitmap.close(),
        };
      } catch (error) {
        // 某些浏览器/格式不支持 createImageBitmap，回退到 <img>
      }
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";
    image.src = url;

    try {
      await image.decode();
    } catch (error) {
      URL.revokeObjectURL(url);
      throw new Error("无法读取这张图片，请换一张试试");
    }

    return {
      image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      cleanup: () => URL.revokeObjectURL(url),
    };
  }

  function fitSize(width, height, maxEdge) {
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("图片编码失败"));
        },
        type,
        quality
      );
    });
  }

  async function encodeCanvas(canvas, quality) {
    try {
      const webp = await canvasToBlob(canvas, "image/webp", quality);
      if (webp) return webp;
    } catch (error) {
      // 回退 JPEG
    }
    return canvasToBlob(canvas, "image/jpeg", quality);
  }

  function rgbToHsl(r, g, b) {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    const lightness = (max + min) / 2;

    if (delta === 0) return [0, 0, lightness];

    const saturation = delta / (1 - Math.abs(2 * lightness - 1));
    let hue = 0;

    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;

    hue *= 60;
    if (hue < 0) hue += 360;

    return [hue, saturation, lightness];
  }

  function hueDistance(a, b) {
    const diff = Math.abs(a - b) % 360;
    return Math.min(diff, 360 - diff);
  }

  function extractPalette(imageData) {
    const data = imageData.data;
    const buckets = Array.from({ length: 24 }, () => ({
      weight: 0,
      hue: 0,
      saturation: 0,
      count: 0,
    }));

    let redSum = 0;
    let greenSum = 0;
    let blueSum = 0;
    let sampleCount = 0;
    let luminanceSum = 0;

    for (let index = 0; index < data.length; index += 8) {
      const alpha = data[index + 3];
      if (alpha < 40) continue;

      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const [hue, saturation, lightness] = rgbToHsl(red, green, blue);

      redSum += red;
      greenSum += green;
      blueSum += blue;
      sampleCount += 1;
      luminanceSum += 0.2126 * red + 0.7152 * green + 0.0722 * blue;

      if (saturation < 0.13 || lightness < 0.1 || lightness > 0.92) continue;

      const weight =
        saturation * (1 - Math.min(1, Math.abs(lightness - 0.5) * 1.5)) + 0.02;
      const bucketIndex = Math.floor(hue / 15) % 24;
      const bucket = buckets[bucketIndex];
      bucket.weight += weight;
      bucket.hue += hue * weight;
      bucket.saturation += saturation * weight;
      bucket.count += weight;
    }

    const sorted = buckets
      .filter((bucket) => bucket.weight > 0.001)
      .sort((a, b) => b.weight - a.weight);

    const colors = [];

    for (const bucket of sorted) {
      const hue = bucket.hue / bucket.weight;
      const saturation = bucket.saturation / bucket.weight;

      if (colors.every((color) => hueDistance(color.h, hue) >= 32)) {
        colors.push({
          h: Math.round(hue),
          s: Number(Math.max(0.18, saturation).toFixed(2)),
        });
      }

      if (colors.length >= 4) break;
    }

    const fallbackHues = [330, 265, 168, 38];
    const baseHue = colors[0]?.h ?? fallbackHues[0];
    const fallbackOffsets = [38, 76, 120, 165, 205, 250, 295];

    for (const offset of fallbackOffsets) {
      if (colors.length >= 4) break;
      const candidateHue = (baseHue + offset) % 360;
      if (colors.every((color) => hueDistance(color.h, candidateHue) >= 30)) {
        colors.push({
          h: Math.round(candidateHue),
          s: Math.max(0.42, colors[0]?.s ?? 0.58),
        });
      }
    }

    while (colors.length < 4) {
      const hue = (baseHue + colors.length * 90) % 360;
      colors.push({ h: Math.round(hue), s: 0.58 });
    }

    return {
      colors: colors.slice(0, 4),
      average:
        sampleCount > 0
          ? {
              r: Math.round(redSum / sampleCount),
              g: Math.round(greenSum / sampleCount),
              b: Math.round(blueSum / sampleCount),
            }
          : { r: 64, g: 48, b: 82 },
      luminance:
        sampleCount > 0
          ? Number((luminanceSum / sampleCount / 255).toFixed(3))
          : 0.5,
    };
  }

  function paletteFromCanvas(canvas) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return {
        colors: [
          { h: 330, s: 0.62 },
          { h: 265, s: 0.58 },
          { h: 168, s: 0.5 },
          { h: 38, s: 0.7 },
        ],
        average: { r: 64, g: 48, b: 82 },
        luminance: 0.5,
      };
    }
    return extractPalette(context.getImageData(0, 0, canvas.width, canvas.height));
  }

  async function prepareFile(file) {
    if (!isImageFile(file)) {
      throw new Error("只支持图片文件");
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new Error("图片超过 25MB，请先压缩一下");
    }

    const decoded = await decodeImage(file);

    try {
      if (!decoded.width || !decoded.height) {
        throw new Error("图片尺寸读取失败");
      }

      const fullSize = fitSize(decoded.width, decoded.height, MAX_EDGE);
      const canvas = document.createElement("canvas");
      canvas.width = fullSize.width;
      canvas.height = fullSize.height;
      const context = canvas.getContext("2d");

      if (!context) throw new Error("当前浏览器无法处理图片");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(decoded.image, 0, 0, fullSize.width, fullSize.height);
      const blob = await encodeCanvas(canvas, 0.86);

      const thumbSize = fitSize(decoded.width, decoded.height, THUMB_EDGE);
      const thumbCanvas = document.createElement("canvas");
      thumbCanvas.width = thumbSize.width;
      thumbCanvas.height = thumbSize.height;
      const thumbContext = thumbCanvas.getContext("2d");

      if (!thumbContext) throw new Error("当前浏览器无法处理图片");
      thumbContext.imageSmoothingEnabled = true;
      thumbContext.imageSmoothingQuality = "high";
      thumbContext.drawImage(decoded.image, 0, 0, thumbSize.width, thumbSize.height);
      const thumb = await encodeCanvas(thumbCanvas, 0.8);

      const paletteCanvas = document.createElement("canvas");
      paletteCanvas.width = 64;
      paletteCanvas.height = 64;
      const paletteContext = paletteCanvas.getContext("2d", { willReadFrequently: true });
      if (!paletteContext) throw new Error("当前浏览器无法分析图片颜色");
      paletteContext.drawImage(decoded.image, 0, 0, 64, 64);

      return {
        id: makeId(),
        name: (file.name || "背景图片").replace(/\.[^.]+$/, "").slice(0, 48),
        blob,
        thumb,
        width: fullSize.width,
        height: fullSize.height,
        sourceBytes: file.size,
        bytes: blob.size,
        type: blob.type || "image/webp",
        palette: paletteFromCanvas(paletteCanvas),
      };
    } finally {
      decoded.cleanup();
    }
  }

  window.SugarBackgrounds = {
    supported,
    getAll,
    add,
    remove,
    clear,
    prepareFile,
    isImageFile,
    extractPalette,
  };
})();
