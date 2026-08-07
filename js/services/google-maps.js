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
  const { PlaceAutocompleteElement } = await google.maps.importLibrary("places");
  const autocomplete = new PlaceAutocompleteElement();
  autocomplete.id = "projectAddressAutocomplete";
  autocomplete.placeholder = "Start typing an address";
  autocomplete.setAttribute("aria-label", "Address");

  input.insertAdjacentElement("afterend", autocomplete);
  input.hidden = true;
  document.querySelector('label[for="projectAddress"]')?.setAttribute("for", autocomplete.id);

  autocomplete.addEventListener("input", () => { input.value = ""; });
  autocomplete.addEventListener("gmp-select", async ({ placePrediction }) => {
    const place = placePrediction.toPlace();
    await place.fetchFields({ fields: ["formattedAddress"] });
    input.value = place.formattedAddress || "";
  });

  return autocomplete;
}
