// Vision models are picky about image formats — llava can't decode WebP, for
// example. Rather than restrict what people can upload, decode whatever the
// browser understands and re-encode it to something the model definitely
// accepts. Downscaling here also keeps the base64 payload small, which avoids
// slow (and sometimes failing) inference on very large photos.

const MAX_DIM = 1280;      // plenty for captioning; keeps payloads modest
const JPEG_QUALITY = 0.9;

export function prepareImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      // Flatten onto white: JPEG has no alpha, and transparent pixels would
      // otherwise render black.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      const base64 = dataUrl.split(",")[1] || "";
      if (!base64) return reject(new Error("could not read that image"));
      resolve({
        base64,
        width: w,
        height: h,
        bytes: Math.round((base64.length * 3) / 4),
        converted: file.type !== "image/jpeg" || scale < 1,
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("this browser can't read that image format"));
    };
    img.src = url;
  });
}
