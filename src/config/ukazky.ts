/** Single list of samples used on every page. Paths are relative to the site root. */
export type UkazkaCat = 'video' | 'viz' | 'social';
export interface Ukazka {
  id: string;
  title: string;
  desc: string;
  cats: UkazkaCat[];
  video: string;
  poster: string;
}

// Every sample was checked against its page (14. 11. 2026): videos from photos -> 'video', furnishing an empty
// or dated room -> 'viz', reels a broker would post -> 'social'. Domovid's own ads (motion-videa,
// motion-vizualizacie, hook-domo, portal) are not samples of client work and stay off the site.
export const UKAZKY: Ukazka[] = [
  { id: 'video-z-fotiek', title: 'Rodinný dom z fotiek', desc: 'Fotky z mobilu premenené na video s pohybom kamery a popiskami', cats: ['video'], video: 'media/ukazky/video-z-fotiek.mp4', poster: 'media/ukazky/video-z-fotiek.jpg' },
  { id: 'fpv', title: 'Prelet domom', desc: 'Plynulý prelet od záhrady cez všetky miestnosti', cats: ['video'], video: 'media/strihy/fpv.mp4', poster: 'media/strihy/fpv.jpg' },
  { id: 'premena-izby', title: 'Premena izby', desc: 'Prázdna izba sa zariadi priamo pred očami', cats: ['viz'], video: 'media/ukazky/premena-izby.mp4', poster: 'media/ukazky/premena-izby.jpg' },
  { id: 'premena-obyvacka', title: 'Premena obývačky', desc: 'Zastaraná obývačka v novom zariadení', cats: ['viz'], video: 'media/ukazky/premena-obyvacka.mp4', poster: 'media/ukazky/premena-obyvacka.jpg' },
  { id: 'premena-kuchyna', title: 'Premena kuchyne', desc: 'Pôvodná kuchyňa ako moderný priestor', cats: ['viz'], video: 'media/ukazky/premena-kuchyna.mp4', poster: 'media/ukazky/premena-kuchyna.jpg' },
  { id: 'room-transform', title: 'Premena ako reel', desc: 'Efektná premena prázdneho priestoru na sociálne siete', cats: ['viz'], video: 'media/strihy/room-transform.mp4', poster: 'media/strihy/room-transform.jpg' },
  { id: 'siete-co-urobim', title: 'Čo za vás urobím', desc: 'Maklér predstaví svoje služby krok za krokom', cats: ['social'], video: 'media/ukazky/siete-co-urobim.mp4', poster: 'media/ukazky/siete-co-urobim.jpg' },
  { id: 'siete-hladam', title: 'Hľadám byty a domy', desc: 'Nábor nových ponúk: kupci, ktorí už čakajú', cats: ['social'], video: 'media/ukazky/siete-hladam.mp4', poster: 'media/ukazky/siete-hladam.jpg' },
  { id: 'tipy-3-chyby', title: '3 chyby pri predaji', desc: 'Tipy pre predávajúcich s hlasom a titulkami', cats: ['social'], video: 'media/ukazky/tipy-3-chyby.mp4', poster: 'media/ukazky/tipy-3-chyby.jpg' },
  { id: 'beatcut', title: 'Interiér do rytmu', desc: 'Reel strihaný do hudby, ponuka zaujme za pár sekúnd', cats: ['video'], video: 'media/strihy/beatcut.mp4', poster: 'media/strihy/beatcut.jpg' },
];

export const ukazkyFor = (cat: UkazkaCat) => UKAZKY.filter((u) => u.cats.includes(cat));

export const CUTS = UKAZKY;
export type Cut = Ukazka;
export type CutCat = UkazkaCat;
