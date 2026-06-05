const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ensureDir, decodeHtml } = require("./utils");

function collectImageTags(html) {
    const images = [];
    const pattern = /<img\b([^>]*)>/gi;
    let match;

    while ((match = pattern.exec(html)) !== null) {
        const attrs = match[1];
        const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
        const altMatch = attrs.match(/\balt=["']([^"']*)["']/i);
        const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);

        images.push({
            tag: match[0],
            index: match.index,
            src: srcMatch ? decodeHtml(srcMatch[1]) : "",
            alt: altMatch ? decodeHtml(altMatch[1]) : "",
            id: idMatch ? decodeHtml(idMatch[1]) : ""
        });
    }

    return images;
}

function saveImageAsset(src, destDir, index) {
    if (!src) return null;

    const hash = crypto.createHash("md5").update(src).digest("hex").slice(0, 10);
    const extFromSrc = path.extname(src.split("?")[0]).toLowerCase();
    const ext = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(extFromSrc) ? extFromSrc : ".png";
    const fileName = `image-${index + 1}-${hash}${ext}`;
    const filePath = path.join(destDir, fileName);

    if (src.startsWith("data:image/")) {
        const base64 = src.split(",")[1];
        if (!base64) return null;
        ensureDir(destDir);
        fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
        return { fileName, filePath, publicPath: fileName };
    }

    if (src.startsWith("http://") || src.startsWith("https://")) {
        return { fileName, filePath: null, publicPath: src, external: true };
    }

    return { fileName, filePath: null, publicPath: src, relative: true };
}

function extractAndSaveImages(html, options = {}) {
    const { destDir, publicBase = "" } = options;
    const tags = collectImageTags(html);
    const saved = [];

    tags.forEach((tag, index) => {
        const asset = saveImageAsset(tag.src, destDir, index);
        if (!asset) return;

        let url = tag.src;
        if (asset.filePath && fs.existsSync(asset.filePath)) {
            url = `${publicBase}/${asset.fileName}`.replace(/\\/g, "/");
        } else if (asset.publicPath) {
            url = asset.publicPath;
        }

        saved.push({
            id: `img-${index + 1}`,
            src: url,
            alt: tag.alt,
            originalSrc: tag.src,
            index: tag.index,
            fileName: asset.fileName || null
        });
    });

    return saved;
}

function linkImagesToGroups(images, groupHtml, groupIndex) {
    return images
        .filter((image) => groupHtml.includes(image.originalSrc) || groupHtml.includes(image.tag))
        .map((image) => image.id);
}

function replaceImagesInHtml(html, imageMap) {
    let output = html;
    imageMap.forEach((image) => {
        if (image.originalSrc) {
            output = output.split(image.originalSrc).join(image.src);
        }
    });
    return output;
}

module.exports = {
    collectImageTags,
    extractAndSaveImages,
    linkImagesToGroups,
    replaceImagesInHtml
};
