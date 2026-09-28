const fs = require('fs');
const path = require('path');

/**
 * Keep only the NSIS Setup .exe in the output folder.
 */
exports.default = async function afterAllArtifactBuild(buildResult) {
  const outDir = buildResult.outDir;
  if (!outDir || !fs.existsSync(outDir)) return;

  for (const name of fs.readdirSync(outDir)) {
    const full = path.join(outDir, name);
    const keep = /^Calendar Gadget Setup .+\.exe$/i.test(name);
    if (keep) continue;

    try {
      fs.rmSync(full, { recursive: true, force: true });
      console.log(`afterAllArtifactBuild: removed ${name}`);
    } catch (err) {
      console.warn(`afterAllArtifactBuild: could not remove ${name}:`, err.message);
    }
  }
};
