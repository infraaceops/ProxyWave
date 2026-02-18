const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const packageJsonPath = path.join(__dirname, 'package.json');
const docsIndexPath = path.join(__dirname, 'docs', 'index.html');

function updateVersion() {
    // 1. Read package.json
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const oldVersion = packageJson.version.replace('v', '');

    // 2. Determine new version (incremental patch by default)
    const parts = oldVersion.split('.');
    parts[2] = parseInt(parts[2]) + 1;
    const newVersion = parts.join('.');
    const newVersionTag = `v${newVersion}`;
    const oldVersionTag = `v${oldVersion}`;

    console.log(`Updating from ${oldVersionTag} to ${newVersionTag}...`);

    // 3. Update package.json
    packageJson.version = newVersionTag;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4));

    // 4. Update docs/index.html
    let docsContent = fs.readFileSync(docsIndexPath, 'utf8');

    // Update Hero Links and Version Tags
    // Example: releases/download/v1.0.7/ProxyWave-Setup-1.0.7.exe -> v1.0.8/ProxyWave-Setup-1.0.8.exe
    const releaseRegex = new RegExp(`releases/download/${oldVersionTag}`, 'g');
    docsContent = docsContent.replace(releaseRegex, `releases/download/${newVersionTag}`);

    // Update filenames in links (e.g., ProxyWave-Setup-1.0.7.exe)
    const filenameRegex = new RegExp(`ProxyWave-Setup-${oldVersion}`, 'g');
    docsContent = docsContent.replace(filenameRegex, `ProxyWave-Setup-${newVersion}`);

    const macRegex = new RegExp(`ProxyWave-${oldVersion}-arm64`, 'g');
    docsContent = docsContent.replace(macRegex, `ProxyWave-${newVersion}-arm64`);

    const linuxRegex = new RegExp(`proxy-wave_${oldVersion}_amd64`, 'g');
    docsContent = docsContent.replace(linuxRegex, `proxy-wave_${newVersion}_amd64`);

    // Update text mentions of version
    const versionTextRegex = new RegExp(`${oldVersionTag} •`, 'g');
    docsContent = docsContent.replace(versionTextRegex, `${newVersionTag} •`);

    // 5. Add to Old Releases
    // Find the releases-list div
    const releasesListStart = docsContent.indexOf('<div class="releases-list">');
    if (releasesListStart !== -1) {
        const insertPos = docsContent.indexOf('>', releasesListStart) + 1;
        const newOldRelease = `
                <div class="release-item">
                    <span class="v-tag">${oldVersionTag}</span>
                    <div class="links">
                        <a href="https://github.com/infraaceops/ProxyWave/releases/download/${oldVersionTag}/ProxyWave-Setup-${oldVersion}.exe">Windows (.exe)</a>
                        <a href="https://github.com/infraaceops/ProxyWave/releases/download/${oldVersionTag}/ProxyWave-${oldVersion}-arm64.dmg">macOS (.dmg)</a>
                        <a href="https://github.com/infraaceops/ProxyWave/releases/download/${oldVersionTag}/proxy-wave_${oldVersion}_amd64.deb">Linux (.deb)</a>
                    </div>
                </div>`;
        docsContent = docsContent.slice(0, insertPos) + newOldRelease + docsContent.slice(insertPos);
    }

    fs.writeFileSync(docsIndexPath, docsContent);

    // 6. Git Commands
    try {
        console.log('Committing changes...');
        execSync('git add .');
        execSync(`git commit -m "chore: release ${newVersionTag}"`);
        console.log('Pushing to main...');
        execSync('git push origin main');
        console.log(`Successfully updated to ${newVersionTag} and pushed changes.`);
    } catch (err) {
        console.error('Git command failed:', err.message);
    }
}

updateVersion();
