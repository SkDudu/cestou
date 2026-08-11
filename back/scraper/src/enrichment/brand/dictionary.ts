import { displayBrand, foldBrand } from "./normalize.js";

/** Seed — common BR grocery brands + aliases. Grows via mergeFromList (PA scrape). */
const SEED: Array<string | { canonical: string; aliases?: string[] }> = [
  "Camil",
  { canonical: "Tio João", aliases: ["tio joao", "tio joo"] },
  "Nestlé",
  { canonical: "Nestlé", aliases: ["nestle"] },
  "Sadia",
  "Perdigão",
  { canonical: "Perdigão", aliases: ["perdigao"] },
  "Bauducco",
  "Itambé",
  { canonical: "Itambé", aliases: ["itambe"] },
  "Ypê",
  { canonical: "Ypê", aliases: ["ype"] },
  "Colgate",
  "Qualitá",
  { canonical: "Qualitá", aliases: ["qualita"] },
  "Prato Fino",
  "Solito",
  "Urbano",
  "La Pastina",
  "Pepe",
  "Veja",
  "Vanish",
  "Dove",
  "Omo",
  "Ariel",
  "Comfort",
  "Downy",
  "Nivea",
  "Rexona",
  "Seda",
  "Pantene",
  "Clear",
  "Head & Shoulders",
  "Oral-B",
  "Sensodyne",
  "Closeup",
  "Sorriso",
  "Danone",
  "Activia",
  "Vigor",
  "Parmalat",
  "Piracanjuba",
  "Elegê",
  { canonical: "Elegê", aliases: ["elege"] },
  "Shefa",
  "Batavo",
  "Cotoches",
  "Italac",
  "Ninho",
  "Nescau",
  "Nescafé",
  { canonical: "Nescafé", aliases: ["nescafe"] },
  "Toddy",
  "Garoto",
  "Lacta",
  "Hershey's",
  "M&M's",
  "Trident",
  "Halls",
  "Mentos",
  "Coca-Cola",
  { canonical: "Coca-Cola", aliases: ["coca cola"] },
  "Pepsi",
  "Guaraná Antarctica",
  { canonical: "Guaraná Antarctica", aliases: ["guarana antarctica", "antarctica"] },
  "Fanta",
  "Sprite",
  "Schweppes",
  "H2OH",
  "Crystal",
  "Bonafont",
  "Minalba",
  "Heineken",
  "Brahma",
  "Skol",
  "Amstel",
  "Spaten",
  "Stella Artois",
  "Corona",
  "Budweiser",
  "Quaker",
  "Kellogg's",
  { canonical: "Kellogg's", aliases: ["kelloggs", "kellogg"] },
  "Neston",
  "Mucilon",
  "Milharina",
  "Dona Benta",
  "Renata",
  "Adria",
  "Barilla",
  "Piraquê",
  { canonical: "Piraquê", aliases: ["piraque"] },
  "Ruffles",
  "Doritos",
  "Fandangos",
  "Cheetos",
  "Torcida",
  "Yoki",
  "Knorr",
  "Maggi",
  "Ajinomoto",
  "Hellmann's",
  { canonical: "Hellmann's", aliases: ["hellmanns", "hellmans"] },
  "Heinz",
  "Quero",
  "Elefante",
  "Pomarola",
  "Predilecta",
  "Fugini",
  "Oro",
  "Gallo",
  "Andorinha",
  "Liza",
  "Soya",
  "Primor",
  "União",
  { canonical: "União", aliases: ["uniao"] },
  "Da Barra",
  "Caravelas",
  "Guimarães",
  { canonical: "Guimarães", aliases: ["guimaraes"] },
  "Pão de Açúcar",
  { canonical: "Pão de Açúcar", aliases: ["pao de acucar", "pda"] },
  "Taeq",
  "Casa do Frango",
  "Seara",
  "Friboi",
  "Swift",
  "Aurora",
  "Excelsior",
  "Ceratti",
  "Sadia",
  "Perdigão",
  "Wickbold",
  "Pullman",
  "Nutrella",
  "Seven Boys",
  "Panco",
  "Bauducco",
  "Piraquê",
  "Marilan",
  "Isabela",
  "Aymore",
  { canonical: "Aymoré", aliases: ["aymore"] },
  "Mabel",
  "Club Social",
  "Negresco",
  "Oreo",
  "Passatempo",
  "Trakinas",
  "Bono",
  "Comfort",
  "Minuano",
  "Brilhante",
  "Tixan",
  "Assim",
  "Limpol",
  "Cif",
  "Pinho Sol",
  "Harpic",
  "Ajax",
  "Mr Músculo",
  { canonical: "Mr Músculo", aliases: ["mr musculo", "mr. musculo"] },
  "Sapolio",
  "Bombril",
  "Assolan",
  "Scotch-Brite",
  "Johnson's",
  { canonical: "Johnson's", aliases: ["johnsons", "johnson"] },
  "Huggies",
  "Pampers",
  "Babysec",
  "Cremer",
  "Needs",
  "Neve",
  "Personal",
  "Cottonete",
  "Always",
  "Intimus",
  "Sym",
  "Carefree",
  "Gillette",
  "Bic",
  "Bozzano",
  "Nivea Men",
  "Palmolive",
  "Lux",
  "Protex",
  "Francis",
  "Granado",
  "Phebo",
  "Monange",
  "Impala",
  "Risqué",
  { canonical: "Risqué", aliases: ["risque"] },
  "Colorama",
  "L'Oréal",
  { canonical: "L'Oréal", aliases: ["loreal", "l oreal"] },
  "Elseve",
  "TRESemmé",
  { canonical: "TRESemmé", aliases: ["tresemme"] },
  "Salon Line",
  "Skala",
  "Novex",
  "Elseve",
  "Garnier",
  "Maybelline",
  "Avon",
  "Natura",
  "O Boticário",
  { canonical: "O Boticário", aliases: ["boticario", "o boticario"] },
  "Vichy",
  "La Roche-Posay",
  "CeraVe",
  "Neutrogena",
  "Sundown",
  "Nivea Sun",
  "Episol",
  "Optimum",
  "Bello Festas",
  "Santa Cruz",
];

export type BrandEntry = {
  canonical: string;
  /** folded forms that map to canonical */
  keys: string[];
  /** token length of longest key (for longest-match sort) */
  keyLen: number;
};

export class BrandDictionary {
  private byKey = new Map<string, string>();
  private entries: BrandEntry[] = [];

  constructor(extra: string[] = []) {
    for (const item of SEED) {
      if (typeof item === "string") this.add(item);
      else this.add(item.canonical, item.aliases);
    }
    for (const b of extra) this.add(b);
  }

  add(canonical: string, aliases: string[] = []): void {
    const display = displayBrand(canonical);
    const keys = new Set<string>();
    const folded = foldBrand(display);
    if (folded) keys.add(folded);
    for (const a of aliases) {
      const f = foldBrand(a);
      if (f) keys.add(f);
    }

    for (const k of keys) {
      const existing = this.byKey.get(k);
      if (existing && existing !== display) continue; // keep first canonical
      this.byKey.set(k, display);
    }

    const keyLen = Math.max(...[...keys].map((k) => k.split(" ").length), 1);
    const prev = this.entries.find((e) => e.canonical === display);
    if (prev) {
      prev.keys = [...new Set([...prev.keys, ...keys])];
      prev.keyLen = Math.max(prev.keyLen, keyLen);
    } else {
      this.entries.push({ canonical: display, keys: [...keys], keyLen });
    }
  }

  mergeFromList(brands: string[]): void {
    for (const b of brands) {
      if (b?.trim()) this.add(b.trim());
    }
  }

  /** Entries sorted longest key first (multi-word before single). */
  sortedForMatch(): BrandEntry[] {
    return [...this.entries].sort((a, b) => b.keyLen - a.keyLen);
  }

  resolve(foldedTokenOrPhrase: string): string | undefined {
    return this.byKey.get(foldedTokenOrPhrase);
  }

  size(): number {
    return this.entries.length;
  }
}

export function createBrandDictionary(extra: string[] = []): BrandDictionary {
  return new BrandDictionary(extra);
}
