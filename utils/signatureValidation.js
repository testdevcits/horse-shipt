const sharp = require("sharp");

const SIGNATURE_DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp);base64,/i;
const MIN_SIGNATURE_BYTES = 500;
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;
const MIN_INK_PIXELS = 25;

const isValidSignatureDataUrl = async (value) => {
  if (typeof value !== "string") return false;

  const signature = value.trim();
  if (!SIGNATURE_DATA_URL_PATTERN.test(signature)) return false;

  const base64Data = signature.replace(SIGNATURE_DATA_URL_PATTERN, "");
  if (!base64Data || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data)) return false;

  try {
    const imageBuffer = Buffer.from(base64Data, "base64");
    if (
      imageBuffer.length < MIN_SIGNATURE_BYTES ||
      imageBuffer.length > MAX_SIGNATURE_BYTES
    ) {
      return false;
    }

    const { data, info } = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let inkPixels = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const alpha = data[offset + 3];
      const isVisible = alpha > 10;
      const isNotWhite = red < 245 || green < 245 || blue < 245;

      if (isVisible && isNotWhite) {
        inkPixels += 1;
        if (inkPixels >= MIN_INK_PIXELS) return true;
      }
    }

    return false;
  } catch (error) {
    return false;
  }
};

module.exports = { isValidSignatureDataUrl };
