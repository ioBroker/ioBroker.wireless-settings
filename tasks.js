const { deleteFoldersRecursive, npmInstall, patchHtmlFile, buildReact, copyFiles } = require('@iobroker/build-tools');

deleteFoldersRecursive(`${__dirname}/admin`, ['network-settings.png']);
npmInstall(`${__dirname}/src-admin`)
    .then(() => buildReact(`${__dirname}/src-admin`, { rootDir: __dirname }))
    .then(() => copyFiles(['src-admin/build/*/**', 'src-admin/build/*'], 'admin/'))
    .then(() => patchHtmlFile(`${__dirname}/admin/index.html`));
