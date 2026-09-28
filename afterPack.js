const fs = require('fs');
const path = require('path');

/**
 * Remove unused Electron/Chromium bits that this calendar gadget never needs.
 * Runs after pack, before NSIS compression — smaller Setup.exe.
 */
exports.default = async function afterPack(context) {
  const out = context.appOutDir;

  const removable = [
    'LICENSES.chromium.html',
    'LICENSE.electron.txt',
    // WebGPU / DXIL shader stack — not used
    'dxcompiler.dll',
    'dxil.dll',
    // Software Vulkan — not used
    'vk_swiftshader.dll',
    'vk_swiftshader_icd.json',
    'vulkan-1.dll',
  ];

  let freed = 0;
  for (const name of removable) {
    const full = path.join(out, name);
    try {
      if (!fs.existsSync(full)) continue;
      const size = fs.statSync(full).size;
      fs.unlinkSync(full);
      freed += size;
      console.log(`afterPack: removed ${name} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    } catch (err) {
      console.warn(`afterPack: could not remove ${name}:`, err.message);
    }
  }

  // Keep only en-US locale packs
  const localeDir = path.join(out, 'locales');
  if (fs.existsSync(localeDir)) {
    for (const name of fs.readdirSync(localeDir)) {
      if (name === 'en-US.pak') continue;
      const full = path.join(localeDir, name);
      try {
        const size = fs.statSync(full).size;
        fs.unlinkSync(full);
        freed += size;
        console.log(`afterPack: removed locales/${name} (${(size / 1024).toFixed(0)} KB)`);
      } catch (err) {
        console.warn(`afterPack: could not remove locales/${name}:`, err.message);
      }
    }
  }

  console.log(`afterPack: freed ~${(freed / 1024 / 1024).toFixed(1)} MB before compression`);
};
