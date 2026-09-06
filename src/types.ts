export type Pin = {
  id: string
  handle: string
  locationName: string
  lat: number
  lng: number
  joinedAt: string
}

export type PinDraft = {
  handle: string
  locationName: string
  lat: number
  lng: number
}

export type GeoSuggestion = {
  id: string
  displayName: string
  lat: number
  lng: number
}
