// Reference snapshot from CoCreate-file-server/src/index.js.
// Preserved for comparison; not imported or executed by Utils.
// Surrounding component services remain dependencies of these excerpts.

async function normalizeSrc({ src, contentType, pathname, file, organization, urlObject, langRegion, lang, theme, state, session, crud }) {

    const activeCrud = crud || (server ? server.crud : null);

    const isBase64Only = (s) =>

        typeof s === "string" && s.length > 0 && /^[A-Za-z0-9+/=\-_]+$/.test(s.replace(/\s+/g, '')) && s.replace(/\s+/g, '').length % 4 === 0;



    const parseDataUri = (s) => {

        const m = /^data:([^;]+)(;base64)?,(.*)$/is.exec(s);

        if (!m) return null;

        return { mime: m[1].toLowerCase(), isBase64: !!m[2], data: m[3] };

    };



    // Fonts

    if (contentType.startsWith("font/") || /\.(woff2?|ttf|otf)$/i.test(pathname)) {

        if (Buffer.isBuffer(src)) return src;

        if (typeof src !== "string") return Buffer.from("");



        const cleanedSrc = src.trim();

        const d = parseDataUri(cleanedSrc);

        if (d?.isBase64) {

            return Buffer.from(d.data.replace(/\s+/g, ''), "base64");

        }



        const stripped = cleanedSrc.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');

        if (isBase64Only(stripped)) {

            return Buffer.from(stripped, "base64");

        }



        // Graceful fallback for binary or raw font strings instead of throwing

        try {

            return Buffer.from(src, "binary");

        } catch (_) {

            return Buffer.from(src);

        }

    }



    // Data URIs

    if (typeof src === "string") {

        const d = parseDataUri(src);

        if (d) {

            if (d.mime === "image/svg+xml") {

                if (d.isBase64) return Buffer.from(d.data, "base64").toString("utf8");

                try {

                    return decodeURIComponent(d.data);

                } catch (_) {

                    return d.data;

                }

            }

            if (/^(image\/(png|jpe?g|webp|bmp|gif|x-icon|vnd\.microsoft\.icon|ico)|video\/.*|audio\/.*)$/i.test(d.mime)) {

                if (d.isBase64) return Buffer.from(d.data, "base64");

            }

            if (!d.isBase64) {

                try {

                    return decodeURIComponent(d.data);

                } catch (_) {

                    return d.data;

                }

            }

        }

    }



    // Plain base64-only string

    if (isBase64Only(src)) {

        if (

            contentType.startsWith("image/") ||

            contentType.startsWith("font/") ||

            contentType.startsWith("video/") ||

            contentType.startsWith("audio/") ||

            contentType === "application/octet-stream"

        ) {

            return Buffer.from(src, "base64");

        }

        return src;

    }



    // HTML rendering

    if (contentType === "text/html") {

        const recursiveResolve = async (nestedPathname) => {

            const resolved = await resolveFile({

                pathname: nestedPathname,

                hostname: urlObject.hostname,

                organizationId: organization._id,

                session,

                recursive: true,

                crud: activeCrud

            });

            return resolved?.file || null;

        };



        return await render.HTML({

            file,

            organization,

            urlObject,

            langRegion,

            lang,

            theme,

            state,

            resolveFile: recursiveResolve,

            crud: activeCrud

        });

    }



    // XML host replacement

    if ((contentType === "text/xml" || contentType === "application/xml") && typeof src === "string") {

        const protocol = "https://";

        return src.replaceAll("{{$host}}", `${protocol}${urlObject.hostname}`);

    }



    return src;

}
