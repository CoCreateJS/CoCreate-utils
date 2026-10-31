// Reference snapshot from CoCreate-file/src/server.js.
// Preserved for comparison; not imported or executed by Utils.
// Surrounding component services remain dependencies of these excerpts.

async function writeFiles(objects, configPath, destination) {
    let baseDir = destination
        ? path.resolve(destination)
        : process.cwd();
    if (!destination && configPath) {
        const projectRoot = path.dirname(configPath);
        baseDir = path.join(projectRoot, 'src');
        if (!fs.existsSync(baseDir)) {
            baseDir = projectRoot;
        }
    }

    const downloaded = [];
    for (const obj of objects) {
        try {
            const objPath = obj.pathname || obj.path;
            if (!objPath) continue;

            const targetPath = path.resolve(baseDir, '.' + objPath);
            const relativePath = path.relative(baseDir, targetPath);
            if (
                relativePath.startsWith(`..${path.sep}`) ||
                relativePath === '..' ||
                path.isAbsolute(relativePath)
            ) {
                throw new Error(`Path escapes download destination: ${objPath}`);
            }
            let isDirectory = obj["content-type"] === "text/directory" || obj.type === "directory" || objPath.endsWith('/');

            if (!isDirectory) {
                isDirectory = objects.some(o => {
                    let oPath = o.pathname || o.path;
                    return oPath && oPath !== objPath && (oPath.startsWith(objPath + '/') || oPath === objPath + '/');
                });
            }

            if (isDirectory) {
                await fs.promises.mkdir(targetPath, { recursive: true });
                continue;
            }

            await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

            const src = obj.src || obj.source || (obj.object && obj.object.src) || '';
            let content = src;
            if (!content && obj.content) content = obj.content;

            if (content && typeof content === 'object' && content.type === 'Buffer' && Array.isArray(content.data)) {
                const buf = Buffer.from(content.data);
                await fs.promises.writeFile(targetPath, buf);
                downloaded.push(targetPath);
                continue;
            }

            if (content && typeof content === 'object' && Array.isArray(content.data)) {
                try {
                    const buf = Buffer.from(content.data);
                    await fs.promises.writeFile(targetPath, buf);
                    downloaded.push(targetPath);
                    continue;
                } catch (err) {}
            }

            if (typeof content === 'string' && content.startsWith('data:')) {
                const base64Index = content.indexOf('base64,');
                if (base64Index > -1) {
                    const b64 = content.slice(base64Index + 7);
                    const buf = Buffer.from(b64, 'base64');
                    await fs.promises.writeFile(targetPath, buf);
                    downloaded.push(targetPath);
                    continue;
                } else {
                    const comma = content.indexOf(',');
                    if (comma > -1) {
                        const dataPart = content.slice(comma + 1);
                        try {
                            const decoded = decodeURIComponent(dataPart);
                            await fs.promises.writeFile(targetPath, decoded, 'utf8');
                            downloaded.push(targetPath);
                            continue;
                        } catch (err) {}
                    }
                }
            }

            if (Buffer.isBuffer(content)) {
                await fs.promises.writeFile(targetPath, content);
                downloaded.push(targetPath);
                continue;
            }

            await fs.promises.writeFile(targetPath, String(content || ''), 'utf8');
            downloaded.push(targetPath);
        } catch (err) {
            console.error('Failed to write object', obj && obj._id, err);
        }
    }
    return downloaded;
}
