export interface LatLng {
  lat: number;
  lng: number;
}

export async function geocodeAddress(
  address: string,
  city: string,
  state: string
): Promise<LatLng | null> {
  const parts = [address, city, state, 'Brasil'].filter(Boolean).join(', ');
  const query = encodeURIComponent(parts);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=br`;
  try {
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'pt-BR' },
    });
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch {
    // silently fail — coordinates are optional
  }
  return null;
}
