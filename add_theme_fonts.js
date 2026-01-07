// Script to add font definitions to all themes
const fs = require('fs');
const path = require('path');

// Curated font pairings by theme ID
const THEME_FONTS = {
    // Luxury themes - elegant serifs and refined sans
    noir: { heading: "Outfit", headingWeights: "600,700,800", body: "Space Grotesk", bodyWeights: "400,500,600" },
    velvet: { heading: "Cormorant Garamond", headingWeights: "500,600,700", body: "Raleway", bodyWeights: "400,500,600" },
    marble: { heading: "Playfair Display", headingWeights: "500,600,700", body: "Lora", bodyWeights: "400,500,600" },
    rosegold: { heading: "Cormorant Garamond", headingWeights: "500,600,700", body: "Nunito", bodyWeights: "400,500,600" },
    midnight: { heading: "Cinzel", headingWeights: "500,600,700", body: "EB Garamond", bodyWeights: "400,500,600" },

    // Classic themes - timeless serifs
    paper: { heading: "Playfair Display", headingWeights: "500,600,700", body: "Libre Baskerville", bodyWeights: "400,700" },
    trattoria: { heading: "Gilda Display", headingWeights: "400", body: "Lora", bodyWeights: "400,500,600" },
    brasserie: { heading: "Bodoni Moda", headingWeights: "500,600,700", body: "Source Sans 3", bodyWeights: "400,500,600" },

    // Heritage themes - warm elegant serifs
    saffron: { heading: "EB Garamond", headingWeights: "500,600,700", body: "Crimson Pro", bodyWeights: "400,500,600" },
    mezze: { heading: "Lora", headingWeights: "500,600,700", body: "Source Serif 4", bodyWeights: "400,500,600" },
    terracotta: { heading: "Merriweather", headingWeights: "700,900", body: "Nunito Sans", bodyWeights: "400,500,600" },
    vineyard: { heading: "Cormorant Garamond", headingWeights: "500,600,700", body: "Quattrocento Sans", bodyWeights: "400,700" },
    oasis: { heading: "Amiri", headingWeights: "400,700", body: "Cairo", bodyWeights: "400,500,600" },

    // Modern themes - clean geometric sans
    umami: { heading: "Zen Kaku Gothic New", headingWeights: "500,700,900", body: "Noto Sans JP", bodyWeights: "400,500" },
    aurora: { heading: "DM Sans", headingWeights: "500,600,700", body: "Inter", bodyWeights: "400,500,600" },
    bamboo: { heading: "Noto Serif Display", headingWeights: "500,600,700", body: "Noto Sans", bodyWeights: "400,500,600" },
    graphite: { heading: "Space Grotesk", headingWeights: "500,600,700", body: "IBM Plex Sans", bodyWeights: "400,500,600" },
    sage: { heading: "Plus Jakarta Sans", headingWeights: "600,700,800", body: "DM Sans", bodyWeights: "400,500,600" },
    arctic: { heading: "Outfit", headingWeights: "500,600,700", body: "Inter", bodyWeights: "400,500" },
    slate: { heading: "Sora", headingWeights: "500,600,700", body: "Work Sans", bodyWeights: "400,500,600" },

    // Playful themes - rounded friendly fonts
    citrus: { heading: "Bebas Neue", headingWeights: "400", body: "Poppins", bodyWeights: "400,500,600" },
    honeycomb: { heading: "Fredoka", headingWeights: "500,600,700", body: "Nunito", bodyWeights: "400,500,600" },

    // Street themes - bold display fonts
    taqueria: { heading: "Oswald", headingWeights: "500,600,700", body: "Barlow", bodyWeights: "400,500,600" },
    ramen: { heading: "Dela Gothic One", headingWeights: "400", body: "M PLUS 1p", bodyWeights: "400,500,700" },
    smokehouse: { heading: "Teko", headingWeights: "500,600,700", body: "Barlow Condensed", bodyWeights: "400,500,600" },
    copper: { heading: "Archivo Black", headingWeights: "400", body: "Public Sans", bodyWeights: "400,500,600" },
    ember: { heading: "Anton", headingWeights: "400", body: "Rubik", bodyWeights: "400,500,600" },

    // Coastal themes - breezy and fresh
    harbor: { heading: "Josefin Sans", headingWeights: "500,600,700", body: "Work Sans", bodyWeights: "400,500,600" },
    sunkissed: { heading: "Aleo", headingWeights: "400,700", body: "Quicksand", bodyWeights: "400,500,600" },
    oceanic: { heading: "Rufina", headingWeights: "400,700", body: "Open Sans", bodyWeights: "400,500,600" },

    // Cafe themes - warm inviting fonts
    patisserie: { heading: "Playfair Display", headingWeights: "500,600,700", body: "Poppins", bodyWeights: "400,500" },
    matcha: { heading: "Zen Maru Gothic", headingWeights: "400,500,700", body: "Noto Sans", bodyWeights: "400,500" },
    espresso: { heading: "Bitter", headingWeights: "500,600,700", body: "Manrope", bodyWeights: "400,500,600" },
    lavender: { heading: "Cormorant", headingWeights: "500,600,700", body: "Quicksand", bodyWeights: "400,500,600" },
};

// Read the file
const filePath = path.join(__dirname, '../apps/web/src/lib/menuThemes.ts');
let content = fs.readFileSync(filePath, 'utf-8');

// For each theme, add fonts after layout
for (const [themeId, fonts] of Object.entries(THEME_FONTS)) {
    const pattern = new RegExp(
        `(id: "${themeId}",[\\s\\S]*?layout: "[^"]+",)`,
        'g'
    );

    const fontsBlock = `
        fonts: {
            heading: "${fonts.heading}",
            headingWeights: "${fonts.headingWeights}",
            body: "${fonts.body}",
            bodyWeights: "${fonts.bodyWeights}"
        },`;

    // Check if this theme already has fonts (from noir update)
    const hasFonts = content.includes(`id: "${themeId}",`) &&
        content.match(new RegExp(`id: "${themeId}",[\\s\\S]*?fonts:`));

    if (!hasFonts) {
        content = content.replace(pattern, `$1${fontsBlock}`);
    }
}

// Write back
fs.writeFileSync(filePath, content, 'utf-8');
console.log('Done! Added fonts to all themes.');
