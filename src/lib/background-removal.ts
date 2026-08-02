/**
 * Client-side background removal (自动抠图).
 *
 * Samples the four corners of the image to estimate the background color,
 * then flood-clears every pixel whose color stays within the tolerance of
 * that background estimate. Works best for solid / near-solid backgrounds
 * (white product shots, scanned drawings, simple posters).
 */

export interface RemoveBackgroundOptions {
  /** 0-255 Euclidean RGB distance tolerance. Default 42. */
  tolerance?: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function colorDistance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function sampleCorners(data: Uint8ClampedArray, width: number, height: number): Rgb {
  const points = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + width - 1) * 4,
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const offset of points) {
    r += data[offset];
    g += data[offset + 1];
    b += data[offset + 2];
  }
  return { r: r / points.length, g: g / points.length, b: b / points.length };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = src;
  });
}

/**
 * Remove the estimated background color from a data-URL image.
 * Returns a PNG data URL with transparency. Throws when the environment
 * has no canvas 2d context (caller should fall back to the original image).
 */
export async function removeBackground(
  src: string,
  options: RemoveBackgroundOptions = {},
): Promise<string> {
  const tolerance = options.tolerance ?? 42;
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d");
  if (!context || !canvas.width || !canvas.height) throw new Error("无法创建画布进行抠图");
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const background = sampleCorners(data, canvas.width, canvas.height);
  for (let i = 0; i < data.length; i += 4) {
    const pixel = { r: data[i], g: data[i + 1], b: data[i + 2] };
    const distance = colorDistance(pixel, background);
    if (distance < tolerance) {
      data[i + 3] = 0;
    } else if (distance < tolerance * 1.6) {
      // Soften edges so the cutout does not look jagged.
      data[i + 3] = Math.round(data[i + 3] * ((distance - tolerance) / (tolerance * 0.6)));
    }
  }
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}
