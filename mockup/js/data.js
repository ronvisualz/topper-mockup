/* mockup v6 — content. Titles and sentences are the v5 site's; every line the owner still has to write is marked placeholder. */

// local: the page is served from /mockup/ next to the repo's assets/; in the artifact the files are published under assets/
const BASE = /\/mockup\//.test(location.pathname) ? '../assets/' : 'assets/';
const LOCAL = /\/mockup\//.test(location.pathname) ? 'assets/' : 'assets/';
export const asset = p => (p.startsWith('mockup:') ? LOCAL + p.slice(7) : BASE + p);

export const PLACEHOLDER_LINE = 'Placeholder — one line on what Topper made.';

export const PROJECTS = [
  { title: 'Wuant — The One', cat: '3D animation', tab: '3d', clip: 'portfolio/clips/c64.mp4', poster: 'portfolio/clips/c64.jpg', walk: true },
  { title: 'Casino Solverde', cat: 'VFX', tab: 'vfx', clip: 'portfolio/clips/c52.mp4', poster: 'portfolio/clips/c52.jpg', walk: true },
  { title: 'LING', cat: 'Campaign', tab: 'campaign', clip: 'portfolio/clips/c36.mp4', poster: 'portfolio/clips/c36.jpg', walk: true },
  { title: 'Richie Campbell', cat: 'Editing', tab: 'editing', clip: 'portfolio/clips/c44.mp4', poster: 'portfolio/clips/c44.jpg', walk: false }
];
export const FILTERS = [['all', 'All'], ['3d', '3D'], ['vfx', 'VFX'], ['campaign', 'Campaign'], ['editing', 'Editing']];

// [name, logo file in brand/clients/ or '' (the name is set as a wordmark until the logo exists)]
export const CLIENTS = [
  ['Riot Games', 'riot-games.svg'], ['Galp', 'galp.svg'], ['NOS', 'nos.svg'], ['Sporting CP', 'sporting-cp.png'],
  ['Federação Portuguesa de Futebol', 'fpf.svg'], ['Solverde', 'solverde.png'], ['Wuant', ''], ['Richie Campbell', ''], ['Delta Y', '']
];

export const COPY = {
  headline: 'We make images that move people.',
  sub: 'VFX, 3D and post-production for brands that want to be seen.',
  services: [
    ['3D, VFX & post-production', 'Animation, visual effects, compositing, grade and finishing for film, broadcast and digital.'],
    ['Adverts', 'From idea to final master: production and post for commercials that hold attention.'],
    ['Campaigns', 'Hero films, cutdowns and social assets built as one system across every format.']
  ],
  studioTitle: 'The trick is the craft.',
  studio1: 'Boutique VFX and motion design studio in Lisbon, working worldwide.',
  studio2: 'A small senior team that stays close to every frame — 3D, compositing, grade and finishing under one roof, so ideas survive all the way to the master.',
  clientsTitle: "Brands we've made things move for.",
  contactTitle: "Let's make something move.",
  email: 'info@topperdigital.xyz'
};

export const ACT_NAMES = ['The hat', 'Step inside', 'The stage', 'In good company', 'Daylight', "Let's talk"];

/* the opening film (v6.2): the logo boxes measured in the files, in normalized video coordinates (both films share the 3:2 framing).
   frame 0 — the frontal plastic logo; the still at 9.0 s — the glass logo with the dark glass hat on the «t» */
export const FILM = {
  src: () => innerWidth < 900 ? 'portfolio/clips/logo-reel-s.mp4' : 'portfolio/clips/logo-reel.mp4',
  vw: 1920, vh: 1280,
  logo0: { x0: 0.0911, y0: 0.3188, x1: 0.9068, y1: 0.6625 },
  still: 'mockup:opening-still.jpg', stillNoHat: 'mockup:opening-still-nohat.jpg', stillT: 9.0,
  logoStill: { x0: 0.0297, y0: 0.2898, x1: 0.9682, y1: 0.6875 },
  hatStill: { x0: 0.0297, y0: 0.2898, x1: 0.1276, y1: 0.4219 }
};
