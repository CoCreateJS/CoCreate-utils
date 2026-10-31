// Reference snapshot from CoCreate-file/src/server.js.
// Preserved for comparison; not imported or executed by Utils.
// Surrounding component services remain dependencies of these excerpts.

async function runFiles(directory, entry, Path, directoryName) {
        const entryPath = path.resolve(configDirectoryPath, entry);
        if (!fs.existsSync(entryPath)) return;

        let files = await fs.promises.readdir(entryPath);
        let exclude = directory.exclude || [];
        let include = directory.include || [];

        for (let file of files) {
            const filePath = path.resolve(entryPath, file);

            let stat = await fs.promises.lstat(filePath);
            let isSymlink = stat.isSymbolicLink();
            let isDirectory;

            if (isSymlink) {
                let symlinkPath = await realpathAsync(filePath);
                isDirectory =
                    fs.existsSync(symlinkPath) &&
                    (await fs.promises.lstat(symlinkPath)).isDirectory();
            } else {
                isDirectory = stat.isDirectory();
            }

            let skip = false;

            if (typeof match !== 'undefined' && match && match.length > 0) {
                let isMatched = false;
                for (let i = 0; i < match.length; i++) {
                    if (filePath.startsWith(match[i])) {
                        isMatched = true;
                        break;
                    } else if (isDirectory && match[i].startsWith(filePath)) {
                        isMatched = "directory";
                        break;
                    }
                }

                if (isMatched === false) {
                    skip = true;
                } else if (isMatched === "directory") {
                    skip = "directory";
                }
            }

            if (skip !== true && include && include.length > 0) {
                let included = false;
                for (let i = 0; i < include.length; i++) {
                    if (filePath.includes(include[i])) {
                        included = true;
                        break;
                    } else if (isDirectory) {
                        included = "directory";
                        break;
                    }
                }

                if (included === false) {
                    skip = true;
                } else if (included === "directory" && skip !== "directory") {
                    skip = "directory";
                }
            }

            if (skip !== true && exclude && exclude.length > 0) {
                for (let i = 0; i < exclude.length; i++) {
                    if (filePath.includes(exclude[i])) {
                        skip = true;
                        break;
                    }
                }
            }

            if (skip === true) continue;

            let name = file;
            let source = "";

            const fileExtension = path.extname(file);
            let mimeType = mimeTypes[fileExtension];

            if (!directoryName) {
                if (directory.object && directory.object.directory) {
                    if (directory.object.directory === "{{directory}}") {
                        let parts = entry.split("/");
                        directoryName = parts[parts.length - 1];
                    } else directoryName = directory.object.directory;
                } else directoryName = "/";
            }

            if (!Path) {
                if (directoryName === "/") Path = directoryName;
                else Path = "/" + directoryName;
            }

            let pathname;
            if (Path === "/") pathname = Path + name;
            else pathname = Path + "/" + name;

            if (isDirectory) {
                mimeType = "text/directory";
            } else {
                source = await getSource(
                    `${entryPath}/${file}`,
                    mimeType,
                    isSymlink
                );
            }

            let values = {
                "{{name}}": name || "",
                "{{source}}": Buffer.isBuffer(source) ? `data:${mimeType};base64,${source.toString('base64')}` : source || "",
                "{{directory}}": directoryName || "",
                "{{path}}": Path || "",
                "{{pathname}}": pathname,
                "{{content-type}}": mimeType || "",
            };

            let data = {
                array: directory.array || "files"
            };

            let isData = false;

            if (typeof directory.$data === "string") {
                if (isDirectory) {
                    skip = "directory";
                } else {
                    isData = true;
                    data = await getData(
                        `${entryPath}/${file}`,
                        mimeType,
                        isSymlink
                    );
                    if (!data) continue;
                }
            } else if (typeof directory.object === "string") {
                if (isDirectory) {
                    skip = "directory";
                } else {
                    isData = true;
                    data.object = await getData(
                        `${entryPath}/${file}`,
                        mimeType,
                        isSymlink
                    );
                    if (!data.object) continue;
                }
            } else if (typeof directory.object === "object" && directory.object !== null) {
                data.array = directory.array || "files";
                let object = { ...directory.object };

                if (!object.name) object.name = "{{name}}";
                if (!object.src) object.src = "{{source}}";
                if (!object.directory) object.directory = "{{directory}}";
                if (!object.path) object.path = "{{path}}";
                if (!object.pathname) object.pathname = "{{pathname}}";
                if (!object["content-type"])
                    object["content-type"] = "{{content-type}}";
                if (
                    !object.public &&
                    object.public !== false &&
                    object.public !== "false"
                )
                    object.public = "true";

                data.object = object;

                if (!data.object._id) {
                    data.filter = {
                        query: {
                            pathname
                        }
                    };
                }

                if (
                    options.translate &&
                    mimeType === "text/html" &&
                    Array.isArray(directory.languages) &&
                    !object.translations
                ) {
                    try {
                        const translations = await options.translate(
                            Buffer.isBuffer(source) ? source.toString('utf-8') : source,
                            directory.languages
                        );
                        data.object.translations = translations;
                    } catch (err) {
                        console.error("Translation error:", err);
                    }
                }

                if (directory.storage) data.storage = directory.storage;
                if (directory.database) data.database = directory.database;
                if (directory.array) data.array = directory.array || "files";

                for (const key of Object.keys(directory.object)) {
                    if (typeof directory.object[key] === "string") {
                        let variables = directory.object[key].match(
                            /{{([A-Za-z0-9_.,\[\]\-\/ ]*)}}/g
                        );
                        if (variables) {
                            for (let variable of variables) {
                                let replacement = values[variable];
                                if (key === 'src' && variable === '{{source}}' && Buffer.isBuffer(source)) {
                                    replacement = `data:${mimeType};base64,${source.toString('base64')}`;
                                }
                                data.object[key] = replaceTemplateVariable(
                                    data.object[key],
                                    variable,
                                    replacement
                                );
                            }
                        }
                    }
                }
            }

            if (skip !== "directory") {
                let response = await runStore(data);
                if (!response || response.error) {
                    console.error(`Upload not confirmed: ${filePath}`, response?.error || "No server confirmation received");
                } else if (isData) {
                    console.log(`Saved: ${entryPath}/${file}`);
                } else {
                    console.log(
                        `Uploaded: ${entryPath}/${file}`,
                        `To: ${pathname}`
                    );
                }
            }

            if (isDirectory && pathname) {
                let newEntry;
                if (entry.endsWith("/")) newEntry = entry + name;
                else newEntry = entry + "/" + name;

                await runFiles(directory, newEntry, pathname, name);
            }
        }
    }

    async function getSource(filePath, mimeType, isSymlink) {
        const base64MimeTypes = /^(image|audio|video|font\/(woff2?|ttf|otf|eot)|application\/vnd\.ms-fontobject|application\/x-font-.*|application\/octet-stream)/;
        const needsBase64 = base64MimeTypes.test(mimeType);

        let resolvedPath = filePath;
        if (isSymlink) {
            resolvedPath = await realpathAsync(filePath);
        }

        let fileBuffer;
        try {
            fileBuffer = await fs.promises.readFile(resolvedPath);
        } catch (error) {
            console.error(`Error reading file: ${resolvedPath}`, error);
            return "";
        }

        if (needsBase64) {
            return fileBuffer;
        } else {
            return fileBuffer.toString('utf8');
        }
    }
