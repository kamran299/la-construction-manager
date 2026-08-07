import { getPublicConfig } from "./supabase.js";

let mapsPromise;

function loadMapsScript(key) {
  if (globalThis.google?.maps?.places) return Promise.resolve(globalThis.google);
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise((resolve, reject) => {
    const callbackName = `initGoogleMaps_${Date.now()}`;
    globalThis[callbackName] = () => {
      delete globalThis[callbackName];
      resolve(globalThis.google);
    };

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => {
      delete globalThis[callbackName];
      mapsPromise = null;
      reject(new Error("Google Maps could not be loaded."));
    };
    document.head.append(script);
  });

  return mapsPromise;
}

export async function enableAddressAutocomplete(input) {
  const { googleMapsKey } = await getPublicConfig();
  if (!googleMapsKey || !input) return false;

  const google = await loadMapsScript(googleMapsKey);
  const autocomplete = new google.maps.places.Autocomplete(input, {
    componentRestrictions: { country: "us" },
    fields: ["formatted_address", "address_components", "geometry", "place_id"],
    types: ["address"],
  });

  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();
    if (place.formatted_address) input.value = place.formatted_address;
  });

  return true;
}
