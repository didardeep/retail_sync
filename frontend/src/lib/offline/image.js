// Shrink a phone photo before it is stored or uploaded (D12). A 4000px camera
// JPEG is 3-8 MB; at 1600px / quality 0.7 it is roughly 300 KB, which is what
// makes storing it offline and sending it over store mobile data practical.
const MAX_SIDE = 1600
const QUALITY = 0.7

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // fall through to the <img> path
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not read that image'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function compressImage(file) {
  const img = await decode(file)
  const w = img.width
  const h = img.height
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  img.close?.()
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  )
  if (!blob) throw new Error('Could not process that image')
  return blob
}
