const express = require('express');
const cors = require('cors');
const fs = require("fs");
const path = require("path");
const chroma = require('chroma-js');

const app = express();
const PORT = 5000;
app.use(cors());
app.use(express.json()); 

function generateRandomColor() {
  return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`;
}

function generateColorsWithLock(count) {
  return Array.from({ length: count }, () => ({
    color: generateRandomColor(),
    locked: false,
  }));
}

let colorsData = generateColorsWithLock(5);

function hexToRgb(hex) {
  const bigint = parseInt(hex.slice(1), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b }; 
}

const rgbToHex = (r, g, b) => {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

function hexToHsl(hex) {
  let r = 0, g = 0, b = 0;
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 6) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  }
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

const hslToHex = (h, s, l) => {
  s /= 100;
  l /= 100;

  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * color);
  };
  return `#${((1 << 24) + (f(0) << 16) + (f(8) << 8) + f(4)).toString(16).slice(1)}`;
};

function generateMonochrome(baseColor, count = 5) {
  const colors = [];
  const { r, g, b } = hexToRgb(baseColor);
  for (let i = 0; i < count; i++) {
    const factor = 0.8 + (i * 0.2) / (count - 1); 
    const newColor = rgbToHex(
      Math.round(r * factor),
      Math.round(g * factor),
      Math.round(b * factor)
    );
    colors.push(newColor);
  }
  return colors;
};

function generateTriadic(baseColor) {
  const { r, g, b } = hexToRgb(baseColor);
  const color1 = baseColor;
  const color2 = rgbToHex(g, b, r); 
  const color3 = rgbToHex(b, r, g);
  return [color1, color2, color3]; 
}

function generateTetradic(baseColor) {
  const { r, g, b } = hexToRgb(baseColor);
  const color1 = baseColor;
  const color2 = rgbToHex(g, b, r);
  const color3 = rgbToHex(b, r, g); 
  const color4 = rgbToHex((r + g) % 256, (g + b) % 256, (b + r) % 256);
  return [color1, color2, color3, color4];
}
function savePaletteToFile(filePath, palette, res) {
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading palettes.json:", err);
      return res.status(500).json({ error: "Error reading file" });
    }
    let palettes = [];
    try {
      palettes = JSON.parse(data);
    } catch (err) {
      console.error("Error parsing JSON:", err);
      return res.status(500).json({ error: "Error parsing palettes file" });
    }
    palettes.push(palette);
    fs.writeFile(filePath, JSON.stringify(palettes, null, 2), (err) => {
      if (err) {
        console.error("Error writing to palettes.json:", err);
        return res.status(500).json({ error: "Error saving palette" });
      }
      res.status(200).send("Palette saved successfully");
    });
  });
}

const generateShades = (baseColor) => {
  return chroma.scale([chroma(baseColor).brighten(2), chroma(baseColor).darken(2)])
               .mode('lab')
               .colors(8);
};

const generateCSSContent = (paletteName, colors) => {
  let cssContent = `/* Palette: ${paletteName} */\n\n:root {\n`;

  colors.forEach((color, index) => {
    const shades = generateShades(color);
    shades.forEach((shade, i) => {
      cssContent += `  --color-${index + 1}-shade-${i + 1}: ${shade};\n`;
    });
  });

  cssContent += `}\n`;
  return cssContent;
};

app.get("/api/colors", (req, res) => {
  res.json(colorsData);
});

app.get("/api/random-color", (req, res) => {
  const color = generateRandomColor();
  res.json({ color });
});

app.post("/api/colors/update", (req, res) => {
  colorsData = colorsData.map((colorObj) =>
    colorObj.locked ? colorObj : { ...colorObj, color: generateRandomColor() }
  );
  res.json(colorsData);
});

app.post("/api/colors/toggle-lock/:index", (req, res) => {
  const index = parseInt(req.params.index, 10);
  if (index >= 0 && index < colorsData.length){
    colorsData[index].locked = !colorsData[index].locked;
    res.json(colorsData);
  } else {
    res.status(400).json({ error: "Invalid index" });
  }
});

app.get("/api/convert-color", (req, res) => {
  const { color, format } = req.query;
  let convertedColor;
  try {
    switch (format) {
      case "rgb":
        convertedColor = hexToRgb(color);
        break;
      case "hsl":
        convertedColor = hexToHsl(color);
        break;
      case "hex":
      default:
        convertedColor = color;
        break;
    }

    res.json({ color: convertedColor });
  } catch (error) {
    res.status(400).json({ error: "Invalid color format" });
  }
});

app.get("/api/monochrome", (req, res) => {
  const baseColor = generateRandomColor(); 
  const colors = generateMonochrome(baseColor);
  res.json(colors);
});

app.get("/api/triadic", (req, res) => {
  const baseColor = generateRandomColor(); 
  const colors = generateTriadic(baseColor);
  res.json(colors); 
});

app.get("/api/tetradic", (req, res) => {
  const baseColor = generateRandomColor(); 
  const colors = generateTetradic(baseColor);
  res.json(colors); 
});

app.post("/api/save-palette", (req, res) => {
  const { paletteName, colors } = req.body;
  const palette = {
    name: paletteName,
    colors
  };
  const filePath = path.join(__dirname, "palettes.json");
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      fs.writeFile(filePath, "[]", (err) => {
        if (err) {
          console.error("Error creating palettes.json:", err);
          return res.status(500).json({ error: "Error creating file" });
        }
        savePaletteToFile(filePath, palette, res);
      });
    } else {
      savePaletteToFile(filePath, palette, res);
    }
  });
});


app.get("/api/get-palettes", (req, res) => {
  fs.readFile("palettes.json", "utf8", (err, data) => {
    if (err) {
      console.error("Error reading palettes.json:", err);
      return res.status(500).json({ error: "Error reading file" });
    }
    let palettes = [];
    try {
      palettes = JSON.parse(data);
    } catch (parseError) {
      console.error("Error parsing palettes.json:", parseError);
    }
    res.json(palettes);
  });
});

app.get("/api/palette-names", (req, res) => {
  fs.readFile("palettes.json", "utf8", (err, data) => {
    if (err) {
      console.error("Error reading palettes.json:", err);
      return res.status(500).json({ error: "Error reading file" });
    }
    const palettes = JSON.parse(data);
    const paletteNames = palettes.map((palette) => palette.name);
    res.json(paletteNames);
  });
});

app.get("/api/palette/:name", (req, res) => {
  const paletteName = req.params.name;
  fs.readFile("palettes.json", "utf8", (err, data) => {
    if (err) {
      console.error("Error reading palettes.json:", err);
      return res.status(500).json({ error: "Error reading file" });
    }
    const palettes = JSON.parse(data);
    const palette = palettes.find((p) => p.name === paletteName);

    if (palette) {
      res.json(palette.colors);
    } else {
      res.status(404).json({ error: "Palette not found" });
    }
  });
});
app.get('/api/download-palette/:paletteName', async (req, res) => {
  const paletteName = req.params.paletteName;
  if (!paletteName) {
    return res.status(400).send("Palette name is required.");
  }

  const colors = ["#ff0000", "#00ff00", "#0000ff"];
  const cssContent = generateCSSContent(paletteName, colors);
  const filePath = path.join(__dirname, `${paletteName}-palette.css`);
  try {
    await fs.promises.writeFile(filePath, cssContent);
    res.download(filePath, `${paletteName}-palette.css`, (err) => {
      if (err) {
        console.error("Error downloading file:", err);
        return res.status(500).send("Error downloading file.");
      }
    });
  } catch (err) {
    console.error("Error writing file:", err);
    res.status(500).send("Error creating file.");
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
