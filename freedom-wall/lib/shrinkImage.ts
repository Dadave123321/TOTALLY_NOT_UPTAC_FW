// BROWSER ONLY. Shrinks a picture before it is uploaded.
// Redrawing it on a canvas also drops hidden data (GPS location, camera model).

export async function shrinkImage(file: File, maxSide: number): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // Respect the phone's rotation flag so the picture is not sideways.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await createImageBitmap(file);
  }

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');

  // White behind transparent PNGs, so they don't turn black as JPEGs.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('could not encode picture'))),
      'image/jpeg',
      0.82
    );
  });
}
