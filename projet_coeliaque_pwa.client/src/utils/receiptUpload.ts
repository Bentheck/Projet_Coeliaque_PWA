const DEFAULT_MAX_UPLOAD_BYTES = 900_000;
const DEFAULT_MAX_DIMENSION = 2200;
const MIN_DIMENSION = 1280;
const QUALITY_STEPS = [0.9, 0.82, 0.74, 0.66, 0.58];
const TOO_LARGE_PATTERN = /413(?:\s+Request)?\s+Entity\s+Too\s+Large/i;

function isCompressibleImage(file: File) {
    return file.type.startsWith("image/");
}

function withJpegExtension(fileName: string) {
    const baseName = fileName.replace(/\.[^.]+$/, "");
    return `${baseName || "receipt"}.jpg`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };

        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Unable to load image."));
        };

        image.src = url;
    });
}

function canvasToBlob(
    canvas: HTMLCanvasElement,
    quality: number
): Promise<Blob | null> {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
    });
}

async function buildCompressedFile(
    canvas: HTMLCanvasElement,
    source: File,
    quality: number
) {
    const blob = await canvasToBlob(canvas, quality);
    if (!blob) return null;

    return new File([blob], withJpegExtension(source.name), {
        type: "image/jpeg",
        lastModified: source.lastModified,
    });
}

export async function prepareReceiptUploadFile(file: File) {
    if (!isCompressibleImage(file) || file.size <= DEFAULT_MAX_UPLOAD_BYTES) {
        return file;
    }

    try {
        const image = await loadImage(file);
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        const longestSide = Math.max(sourceWidth, sourceHeight);

        if (!sourceWidth || !sourceHeight || !longestSide) {
            return file;
        }

        let bestCandidate = file;
        let targetMaxSide = Math.min(longestSide, DEFAULT_MAX_DIMENSION);

        for (let attempt = 0; attempt < 5; attempt++) {
            const ratio = Math.min(1, targetMaxSide / longestSide);
            const width = Math.max(1, Math.round(sourceWidth * ratio));
            const height = Math.max(1, Math.round(sourceHeight * ratio));

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;

            const context = canvas.getContext("2d");
            if (!context) return bestCandidate;

            context.drawImage(image, 0, 0, width, height);

            for (const quality of QUALITY_STEPS) {
                const candidate = await buildCompressedFile(canvas, file, quality);
                if (!candidate) continue;

                if (candidate.size < bestCandidate.size) {
                    bestCandidate = candidate;
                }

                if (candidate.size <= DEFAULT_MAX_UPLOAD_BYTES) {
                    return candidate;
                }
            }

            if (targetMaxSide <= MIN_DIMENSION) {
                break;
            }

            targetMaxSide = Math.max(
                MIN_DIMENSION,
                Math.round(targetMaxSide * 0.85)
            );
        }

        return bestCandidate.size < file.size ? bestCandidate : file;
    } catch {
        return file;
    }
}

export async function getUploadErrorMessage(
    response: Response,
    tooLargeMessage: string
) {
    if (response.status === 413) {
        return tooLargeMessage;
    }

    const text = await response.text().catch(() => "");
    if (TOO_LARGE_PATTERN.test(text)) {
        return tooLargeMessage;
    }

    return text || `HTTP ${response.status}`;
}
