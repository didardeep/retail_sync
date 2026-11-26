// Where a photo was taken: the device's position at the moment of upload.
// Works in the browser and the phone app alike (both use navigator.geolocation).

// Resolves to { lat, lng, accuracy, captured_at } or null when the device has no
// location, the person said no, or it takes too long. Never rejects.
export function currentPosition({ timeout = 8000, geolocation = globalThis.navigator?.geolocation } = {}) {
  if (!geolocation?.getCurrentPosition) return Promise.resolve(null)
  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        captured_at: new Date(pos.timestamp || Date.now()).toISOString(),
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 },
    )
  })
}

// "28.61390, 77.20900 (±12 m)"
export function geoLabel(geo) {
  if (!geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) return ''
  const acc = Number.isFinite(geo.accuracy) ? ` (±${Math.round(geo.accuracy)} m)` : ''
  return `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}${acc}`
}

export function mapLink(geo) {
  return `https://www.google.com/maps?q=${geo.lat},${geo.lng}`
}
