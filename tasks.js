const { deleteFoldersRecursive, npmInstall, patchHtmlFile, buildReact, copyFiles } = require('@iobroker/build-tools');
const { renameSync } = require('node:fs');

deleteFoldersRecursive(`${__dirname}/admin`, ['wireless-settings.png']);
npmInstall(`${__dirname}/src-admin`)
    .then(() => buildReact(`${__dirname}/src-admin`, { rootDir: __dirname }))
    .then(() => copyFiles(['src-admin/build/*/**', 'src-admin/build/*'], 'admin/'))
    .then(() => patchHtmlFile(`${__dirname}/admin/index.html`))
    .then(() => renameSync(`${__dirname}/admin/index.html`, `${__dirname}/admin/index_m.html`))
