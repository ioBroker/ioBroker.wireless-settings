/*!
 * ioBroker gulpfile
 * Date: 2019-01-28
 */
'use strict';

const gulp = require('gulp');
const fs = require('node:fs');
const cp = require('node:child_process');
const { deleteFoldersRecursive, npmInstall, patchHtmlFile } = require('@iobroker/build-tools');

gulp.task('clean', done => {
    deleteFoldersRecursive(`${__dirname}/admin`, ['network-settings.png']);
    done();
});

gulp.task('2-npm', () => {
    if (fs.existsSync(`${__dirname}/src/node_modules`)) {
        return Promise.resolve();
    }
    return npmInstall(`${__dirname}/src`);
});

gulp.task('2-npm-dep', gulp.series('clean', '2-npm'));

function build() {
    return new Promise((resolve, reject) => {
        const options = {
            stdio: 'pipe',
            cwd: `${__dirname}/src/`,
        };

        const version = JSON.parse(fs.readFileSync(`${__dirname}/package.json`).toString('utf8')).version;
        const data = JSON.parse(fs.readFileSync(`${__dirname}/src/package.json`).toString('utf8'));
        data.version = version;
        fs.writeFileSync(`${__dirname}/src/package.json`, JSON.stringify(data, null, 2));

        console.log(options.cwd);

        let script = `${__dirname}/src/node_modules/react-scripts/scripts/build.js`;
        if (!fs.existsSync(script)) {
            script = `${__dirname}/node_modules/react-scripts/scripts/build.js`;
        }
        if (!fs.existsSync(script)) {
            console.error(`Cannot find execution file: ${script}`);
            reject(`Cannot find execution file: ${script}`);
        } else {
            const child = cp.fork(script, [], options);
            child.stdout.on('data', data => console.log(data.toString()));
            child.stderr.on('data', data => console.log(data.toString()));
            child.on('close', code => {
                console.log(`child process exited with code ${code}`);
                code ? reject(`Exit code: ${code}`) : resolve();
            });
        }
    });
}

gulp.task('3-build', () => build());

gulp.task('3-build-dep', gulp.series('2-npm-dep', '3-build'));

gulp.task('5-copy', () => gulp.src(['src/build/*/**', 'src/build/*']).pipe(gulp.dest('admin/')));

gulp.task('5-copy-dep', gulp.series('3-build-dep', '5-copy'));

gulp.task('6-patch', async () => {
    if (fs.existsSync(`${__dirname}/admin/index.html`)) {
        await patchHtmlFile(`${__dirname}/admin/index.html`);
        const code = fs.readFileSync(`${__dirname}/admin/index.html`);
        fs.unlinkSync(`${__dirname}/admin/index.html`);
        fs.writeFileSync(`${__dirname}/admin/index_m.html`, code);
    }
    if (fs.existsSync(`${__dirname}/src/build/index.html`)) {
        await patchHtmlFile(`${__dirname}/src/build/index.html`);
        const code = fs.readFileSync(`${__dirname}/src/build/index.html`);
        fs.writeFileSync(`${__dirname}/src/build/index.html`, code);
    }
});

gulp.task('6-patch-dep', gulp.series('5-copy-dep', '6-patch'));

gulp.task('default', gulp.series('6-patch-dep'));
